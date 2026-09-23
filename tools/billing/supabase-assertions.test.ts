import { describe, expect, it, vi } from 'vitest';

import {
  createSupabaseAssertionAdapter,
  type SupabaseAssertionTransport,
} from './supabase-assertions';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const NOW = new Date('2026-09-18T12:00:00.000Z');
const SECRET_LIKE_VALUE = 'service-role-secret-value';

function mirrorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    user_id: USER_ID,
    provider: 'revenuecat',
    entitlement: 'pro',
    status: 'active',
    expires_at: '2026-10-18T12:00:00.000Z',
    raw_customer_id: USER_ID,
    last_event_at: '2026-09-17T12:00:00.000Z',
    updated_at: '2026-09-17T12:00:01.000Z',
    ...overrides,
  };
}

function ledgerRow(overrides: Record<string, unknown> = {}) {
  return {
    event_id: 'evt_1',
    user_id: USER_ID,
    event_type: 'INITIAL_PURCHASE',
    event_at: '2026-09-17T12:00:00.000Z',
    applied: true,
    skipped_reason: null,
    received_at: '2026-09-17T12:00:01.000Z',
    ...overrides,
  };
}

function transport(
  options: {
    subscriptions?: unknown;
    ledger?: unknown;
    authorization?: unknown;
  } = {},
): SupabaseAssertionTransport {
  return {
    readSubscriptions: vi
      .fn()
      .mockResolvedValue(options.subscriptions ?? { data: [mirrorRow()], error: null }),
    readLedger: vi.fn().mockResolvedValue(options.ledger ?? { data: [ledgerRow()], error: null }),
    readServerAuthorization: vi
      .fn()
      .mockResolvedValue(options.authorization ?? { data: true, error: null }),
  };
}

function adapter(fake: SupabaseAssertionTransport) {
  return createSupabaseAssertionAdapter({
    url: 'https://example.supabase.co',
    serviceRoleKey: 'service-role-secret',
    transport: fake,
    now: () => NOW,
  });
}

describe('Supabase billing assertion adapter', () => {
  it('reduces an active mirror, coherent ledger, and true RPC', async () => {
    const result = await adapter(transport()).readUser(USER_ID);

    expect(result).toMatchObject({
      ok: true,
      data: { activeMirror: true, ledgerCoherent: true, serverAuthorized: true },
    });
  });

  it('represents no mirror row and a false RPC', async () => {
    const result = await adapter(
      transport({
        subscriptions: { data: [], error: null },
        ledger: { data: [], error: null },
        authorization: { data: false, error: null },
      }),
    ).readUser(USER_ID);

    expect(result).toMatchObject({
      ok: true,
      data: { activeMirror: false, ledgerRows: [], serverAuthorized: false },
    });
  });

  it('fails closed for duplicate or conflicting mirror rows', async () => {
    const duplicate = await adapter(
      transport({ subscriptions: { data: [mirrorRow(), mirrorRow()], error: null } }),
    ).readUser(USER_ID);
    const wrongProvider = await adapter(
      transport({ subscriptions: { data: [mirrorRow({ provider: 'stripe' })], error: null } }),
    ).readUser(USER_ID);

    expect(duplicate).toMatchObject({ ok: false, error: { code: 'SUPABASE_MIRROR_CONFLICT' } });
    expect(wrongProvider).toMatchObject({
      ok: false,
      error: { code: 'SUPABASE_MIRROR_IDENTITY_MISMATCH' },
    });
  });

  it('honors cancelled-but-active and expiry semantics from the current schema', async () => {
    const activeUntilExpiry = await adapter(transport()).readUser(USER_ID);
    const expired = await adapter(
      transport({
        subscriptions: {
          data: [mirrorRow({ expires_at: '2026-09-17T12:00:00.000Z' })],
          error: null,
        },
      }),
    ).readUser(USER_ID);
    const cancelledByWebhookStatus = await adapter(
      transport({
        subscriptions: { data: [mirrorRow({ status: 'expired' })], error: null },
      }),
    ).readUser(USER_ID);

    expect(activeUntilExpiry).toMatchObject({ ok: true, data: { activeMirror: true } });
    expect(expired).toMatchObject({ ok: true, data: { activeMirror: false } });
    expect(cancelledByWebhookStatus).toMatchObject({ ok: true, data: { activeMirror: false } });
  });

  it('rejects duplicate IDs and mirror high-water marks absent from applied ledger entries', async () => {
    const duplicateEvents = await adapter(
      transport({ ledger: { data: [ledgerRow(), ledgerRow()], error: null } }),
    ).readUser(USER_ID);
    const missingAppliedEvent = await adapter(
      transport({
        ledger: {
          data: [ledgerRow({ event_at: '2026-09-16T12:00:00.000Z' })],
          error: null,
        },
      }),
    ).readUser(USER_ID);
    const newerAppliedEvent = await adapter(
      transport({
        ledger: {
          data: [
            ledgerRow({
              event_id: 'evt_2',
              event_at: '2026-09-18T10:00:00.000Z',
            }),
            ledgerRow(),
          ],
          error: null,
        },
      }),
    ).readUser(USER_ID);

    expect(duplicateEvents).toMatchObject({
      ok: false,
      error: { code: 'SUBSCRIPTION_LEDGER_CONFLICT' },
    });
    expect(missingAppliedEvent).toMatchObject({
      ok: false,
      error: { code: 'SUBSCRIPTION_LEDGER_CONFLICT' },
    });
    expect(newerAppliedEvent).toMatchObject({
      ok: false,
      error: { code: 'SUBSCRIPTION_LEDGER_CONFLICT' },
    });
  });

  it('maps mirror, ledger, and RPC errors without returning raw rows', async () => {
    const mirrorError = await adapter(
      transport({ subscriptions: { data: [{ secret: 'raw' }], error: { message: 'db raw' } } }),
    ).readUser(USER_ID);
    const ledgerError = await adapter(
      transport({ ledger: { data: [{ secret: 'raw' }], error: { message: 'db raw' } } }),
    ).readUser(USER_ID);
    const rpcError = await adapter(
      transport({ authorization: { data: null, error: { message: 'db raw' } } }),
    ).readUser(USER_ID);
    const malformedRpc = await adapter(
      transport({ authorization: { data: 'true', error: null } }),
    ).readUser(USER_ID);
    const malformedMirror = await adapter(
      transport({ subscriptions: { data: [{ user_id: USER_ID }], error: null } }),
    ).readUser(USER_ID);

    expect(mirrorError).toMatchObject({
      ok: false,
      error: { code: 'SUPABASE_MIRROR_READ_FAILED' },
    });
    expect(ledgerError).toMatchObject({
      ok: false,
      error: { code: 'SUBSCRIPTION_LEDGER_READ_FAILED' },
    });
    expect(rpcError).toMatchObject({
      ok: false,
      error: { code: 'SERVER_AUTHORIZATION_READ_FAILED' },
    });
    expect(malformedRpc).toMatchObject({
      ok: false,
      error: { code: 'SERVER_AUTHORIZATION_MALFORMED' },
    });
    expect(malformedMirror).toMatchObject({
      ok: false,
      error: { code: 'SUPABASE_MIRROR_MALFORMED' },
    });
    expect(JSON.stringify([mirrorError, ledgerError, rpcError])).not.toContain('db raw');
  });

  it('classifies client initialization throws without exposing thrown details', async () => {
    const thrownValue = `client failure ${USER_ID} ${SECRET_LIKE_VALUE} https://secret.example/key`;
    const result = await createSupabaseAssertionAdapter({
      url: 'https://example.supabase.co',
      serviceRoleKey: SECRET_LIKE_VALUE,
      clientFactory: () => {
        throw new Error(thrownValue);
      },
    }).readUser(USER_ID);

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'SUPABASE_CLIENT_UNEXPECTED' },
    });
    const output = JSON.stringify(result);
    expect(output).not.toContain(thrownValue);
    expect(output).not.toContain(USER_ID);
    expect(output).not.toContain(SECRET_LIKE_VALUE);
    expect(output).not.toContain('https://');
  });

  it.each([
    ['mirror', 'SUPABASE_MIRROR_UNEXPECTED'],
    ['ledger', 'SUBSCRIPTION_LEDGER_UNEXPECTED'],
    ['authorization', 'SERVER_AUTHORIZATION_UNEXPECTED'],
  ] as const)('classifies an unexpected %s transport throw safely', async (stage, code) => {
    const thrownValue = `${stage} failure ${USER_ID} ${SECRET_LIKE_VALUE} https://secret.example/key`;
    const fake = transport();
    if (stage === 'mirror') {
      fake.readSubscriptions = vi.fn().mockRejectedValue(new Error(thrownValue));
    } else if (stage === 'ledger') {
      fake.readLedger = vi.fn().mockRejectedValue(new Error(thrownValue));
    } else {
      fake.readServerAuthorization = vi.fn().mockRejectedValue(new Error(thrownValue));
    }

    const result = await adapter(fake).readUser(USER_ID);

    expect(result).toMatchObject({ ok: false, error: { code } });
    const output = JSON.stringify(result);
    expect(output).not.toContain(thrownValue);
    expect(output).not.toContain(USER_ID);
    expect(output).not.toContain(SECRET_LIKE_VALUE);
    expect(output).not.toContain('https://');
  });
});
