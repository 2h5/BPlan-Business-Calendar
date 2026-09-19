import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { assertionFailure, type BillingAssertionResult } from './assertion-types';
import { BILLING_CONTRACT } from './contract';

const timestampSchema = z.string().datetime({ offset: true });

const subscriptionRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  provider: z.string().min(1),
  entitlement: z.string().min(1),
  status: z.string().min(1),
  expires_at: timestampSchema.nullable(),
  raw_customer_id: z.string().nullable(),
  last_event_at: timestampSchema.nullable(),
  updated_at: timestampSchema,
});

const ledgerRowSchema = z.object({
  event_id: z.string().min(1),
  user_id: z.string().uuid(),
  event_type: z.string().min(1),
  event_at: timestampSchema,
  applied: z.boolean(),
  skipped_reason: z.string().nullable(),
  received_at: timestampSchema,
});

export type SubscriptionRow = z.infer<typeof subscriptionRowSchema>;
export type SubscriptionLedgerRow = z.infer<typeof ledgerRowSchema>;

export interface SupabaseAssertionTransport {
  readSubscriptions(userId: string): Promise<unknown>;
  readLedger(userId: string): Promise<unknown>;
  readServerAuthorization(userId: string): Promise<unknown>;
}

export interface SupabaseUserSnapshot {
  readonly mirrorRows: readonly SubscriptionRow[];
  readonly activeMirror: boolean;
  readonly ledgerRows: readonly SubscriptionLedgerRow[];
  readonly ledgerCoherent: boolean;
  readonly serverAuthorized: boolean;
}

interface SupabaseQueryResult {
  readonly data: unknown;
  readonly error: { readonly message?: string } | null;
}

export interface SupabaseAssertionAdapter {
  readUser(userId: string): Promise<BillingAssertionResult<SupabaseUserSnapshot>>;
}

export interface SupabaseAssertionAdapterOptions {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly transport?: SupabaseAssertionTransport;
  readonly now?: () => Date;
}

function readResult<T>(
  category: 'SUPABASE_MIRROR' | 'SUBSCRIPTION_LEDGER' | 'SERVER_AUTHORIZATION',
  code: string,
  message: string,
  value: unknown,
): BillingAssertionResult<T> {
  if (typeof value !== 'object' || value === null) {
    return assertionFailure(category, code, message);
  }
  const result = value as Partial<SupabaseQueryResult>;
  if (result.error) return assertionFailure(category, code, message);
  return { ok: true, data: result.data as T };
}

export function createSupabaseAssertionTransport(
  url: string,
  serviceRoleKey: string,
  client: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }),
): SupabaseAssertionTransport {
  return {
    async readSubscriptions(userId) {
      return client
        .from('subscriptions')
        .select(
          'id,user_id,provider,entitlement,status,expires_at,raw_customer_id,last_event_at,updated_at',
        )
        .eq('user_id', userId)
        .eq('entitlement', BILLING_CONTRACT.entitlement);
    },
    async readLedger(userId) {
      return client
        .from('subscription_events')
        .select('event_id,user_id,event_type,event_at,applied,skipped_reason,received_at')
        .eq('user_id', userId)
        .order('event_at', { ascending: false });
    },
    async readServerAuthorization(userId) {
      return client.rpc('has_active_entitlement', {
        p_user_id: userId,
        p_entitlement: BILLING_CONTRACT.entitlement,
      });
    },
  };
}

function parseMirrorRows(value: unknown): BillingAssertionResult<readonly SubscriptionRow[]> {
  const result = readResult<unknown>(
    'SUPABASE_MIRROR',
    'SUPABASE_MIRROR_READ_FAILED',
    'Supabase subscription mirror read failed.',
    value,
  );
  if (!result.ok) return result;
  const parsed = z.array(subscriptionRowSchema).safeParse(result.data);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : assertionFailure(
        'SUPABASE_MIRROR',
        'SUPABASE_MIRROR_MALFORMED',
        'Supabase subscription mirror response was malformed.',
      );
}

function parseLedgerRows(value: unknown): BillingAssertionResult<readonly SubscriptionLedgerRow[]> {
  const result = readResult<unknown>(
    'SUBSCRIPTION_LEDGER',
    'SUBSCRIPTION_LEDGER_READ_FAILED',
    'Supabase subscription ledger read failed.',
    value,
  );
  if (!result.ok) return result;
  const parsed = z.array(ledgerRowSchema).safeParse(result.data);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : assertionFailure(
        'SUBSCRIPTION_LEDGER',
        'SUBSCRIPTION_LEDGER_MALFORMED',
        'Supabase subscription ledger response was malformed.',
      );
}

function parseAuthorization(value: unknown): BillingAssertionResult<boolean> {
  const result = readResult<unknown>(
    'SERVER_AUTHORIZATION',
    'SERVER_AUTHORIZATION_READ_FAILED',
    'Supabase server authorization RPC failed.',
    value,
  );
  if (!result.ok) return result;
  return typeof result.data === 'boolean'
    ? { ok: true, data: result.data }
    : assertionFailure(
        'SERVER_AUTHORIZATION',
        'SERVER_AUTHORIZATION_MALFORMED',
        'Supabase server authorization RPC response was malformed.',
      );
}

function mirrorIsActive(row: SubscriptionRow, now: Date): boolean {
  return (
    row.provider === 'revenuecat' &&
    row.entitlement === BILLING_CONTRACT.entitlement &&
    row.status === 'active' &&
    (row.expires_at === null || Date.parse(row.expires_at) > now.getTime())
  );
}

function ledgerIsCoherent(
  rows: readonly SubscriptionLedgerRow[],
  mirrorRows: readonly SubscriptionRow[],
): boolean {
  const ids = new Set(rows.map((row) => row.event_id));
  if (ids.size !== rows.length) return false;
  if (
    rows.some(
      (row) =>
        (row.applied && row.skipped_reason !== null) ||
        (!row.applied && row.skipped_reason === null),
    )
  ) {
    return false;
  }
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (!previous || !current || Date.parse(previous.event_at) < Date.parse(current.event_at)) {
      return false;
    }
  }

  const mirrorEventTimes = mirrorRows
    .map((row) => row.last_event_at)
    .filter((value): value is string => value !== null);
  const newestApplied = rows.find((row) => row.applied)?.event_at;
  return mirrorEventTimes.every(
    (eventAt) => newestApplied !== undefined && eventAt === newestApplied,
  );
}

export function createSupabaseAssertionAdapter(
  options: SupabaseAssertionAdapterOptions,
): SupabaseAssertionAdapter {
  const transport =
    options.transport ?? createSupabaseAssertionTransport(options.url, options.serviceRoleKey);
  return {
    async readUser(userId) {
      const mirror = parseMirrorRows(await transport.readSubscriptions(userId));
      if (!mirror.ok) return mirror;
      if (mirror.data.length > 1) {
        return assertionFailure(
          'SUPABASE_MIRROR',
          'SUPABASE_MIRROR_CONFLICT',
          'Supabase returned multiple Pro mirror rows for the explicit user.',
        );
      }
      if (
        mirror.data.some(
          (row) =>
            row.user_id !== userId ||
            row.provider !== 'revenuecat' ||
            row.entitlement !== BILLING_CONTRACT.entitlement,
        )
      ) {
        return assertionFailure(
          'SUPABASE_MIRROR',
          'SUPABASE_MIRROR_IDENTITY_MISMATCH',
          'Supabase mirror identity or provider did not match the assertion target.',
        );
      }

      const ledger = parseLedgerRows(await transport.readLedger(userId));
      if (!ledger.ok) return ledger;
      if (ledger.data.some((row) => row.user_id !== userId)) {
        return assertionFailure(
          'SUBSCRIPTION_LEDGER',
          'SUBSCRIPTION_LEDGER_IDENTITY_MISMATCH',
          'Supabase ledger contained an event for a different user.',
        );
      }
      const ledgerCoherent = ledgerIsCoherent(ledger.data, mirror.data);
      if (!ledgerCoherent) {
        return assertionFailure(
          'SUBSCRIPTION_LEDGER',
          'SUBSCRIPTION_LEDGER_CONFLICT',
          'Supabase subscription ledger failed replay or latest-applied invariants.',
        );
      }

      const authorization = parseAuthorization(await transport.readServerAuthorization(userId));
      if (!authorization.ok) return authorization;
      const now = (options.now ?? (() => new Date()))();

      return {
        ok: true,
        data: {
          mirrorRows: mirror.data,
          activeMirror: mirror.data.some((row) => mirrorIsActive(row, now)),
          ledgerRows: ledger.data,
          ledgerCoherent,
          serverAuthorized: authorization.data,
        },
      };
    },
  };
}
