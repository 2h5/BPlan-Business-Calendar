// deno-lint-ignore-file require-await -- async stubs implement Promise-returning dependency interfaces.
import { assertEquals, assertRejects } from 'jsr:@std/assert@^1.0.0';

import { EdgeError } from '../errors/index.ts';
import type { ProviderAccountRow } from '../providers/accounts.ts';
import { releaseProviderGrant } from '../providers/disconnect.ts';
import type { NormalisedEvent, ProviderAuth, ProviderContext } from '../providers/types.ts';
import { createScriptedProvider } from '../test-support/provider-lifecycle.ts';
import { MemorySupabase } from '../test-support/memory-supabase.ts';

import {
  ensureAccountWatch,
  ensureWatch,
  recordSyncFailure,
  syncCalendar,
  type SyncStateRow,
} from './engine.ts';
import { drainQueue } from './worker.ts';
import type { SyncJob } from './jobs.ts';
import { eventDraftSchema, pushEvent } from './push.ts';
import { applyProviderEvents } from './upsert.ts';

const USER_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_USER_ID = '33333333-3333-3333-3333-333333333333';
const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';
const CALENDAR_ID = '44444444-4444-4444-4444-444444444444';
const STATE_ID = '55555555-5555-5555-5555-555555555555';
const EVENT_ID = '66666666-6666-6666-6666-666666666666';
const CONTEXT: ProviderContext = {
  providerAccountId: ACCOUNT_ID,
  userId: USER_ID,
  accessToken: 'dummy-access-token',
};
const NOW = new Date('2026-01-01T12:00:00.000Z');

Deno.test(
  'sync engine chooses the persisted mode, falls back once, and owns null cursors',
  async () => {
    const account = providerAccount();
    const db = new MemorySupabase({
      provider_accounts: [{ ...account }],
      calendar_sync_states: [{ ...syncState({ sync_cursor: null, needs_full_resync: true }) }],
      events: [],
    });
    let initialCalls = 0;
    let incrementalCalls = 0;
    const { provider, calls } = createScriptedProvider({
      kind: 'google',
      initialSync: async () => {
        initialCalls += 1;
        return initialCalls === 1
          ? { events: [normalisedEvent('provider-event')], cursor: 'cursor-1' }
          : { events: [], cursor: 'fresh-cursor' };
      },
      incrementalSync: async () => {
        incrementalCalls += 1;
        return incrementalCalls === 1
          ? { events: [normalisedEvent('provider-event')], cursor: null }
          : { events: [], cursor: null, cursorInvalid: true };
      },
    });
    const deps = {
      provider,
      now: () => NOW,
      initialSyncWindow: () => ({
        from: '2025-01-01T00:00:00.000Z',
        to: '2027-01-01T00:00:00.000Z',
      }),
    };

    const first = await syncCalendar(
      db.asClient(),
      account,
      CONTEXT,
      syncState({ sync_cursor: null, needs_full_resync: true }),
      deps,
    );
    assertEquals(first.mode, 'initial');
    assertEquals(db.rows('calendar_sync_states')[0]?.sync_cursor, 'cursor-1');
    assertEquals(calls[0]?.window, {
      from: '2025-01-01T00:00:00.000Z',
      to: '2027-01-01T00:00:00.000Z',
    });

    const afterInitial = db.rows('calendar_sync_states')[0] as unknown as SyncStateRow;
    const second = await syncCalendar(db.asClient(), account, CONTEXT, afterInitial, deps);
    assertEquals(second.mode, 'incremental');
    assertEquals(db.rows('calendar_sync_states')[0]?.sync_cursor, null);

    const staleState = {
      ...(db.rows('calendar_sync_states')[0] as unknown as SyncStateRow),
      sync_cursor: 'stale-cursor',
      needs_full_resync: false,
    };
    const recovered = await syncCalendar(db.asClient(), account, CONTEXT, staleState, deps);
    assertEquals(recovered.mode, 'initial');
    assertEquals(db.rows('calendar_sync_states')[0]?.sync_cursor, 'fresh-cursor');
    assertEquals(
      calls.map((call) => call.operation),
      ['initialSync', 'incrementalSync', 'incrementalSync', 'initialSync'],
    );
  },
);

Deno.test(
  'sync failure before state commit records retry state without claiming success',
  async () => {
    const account = providerAccount();
    const state = syncState({ sync_cursor: 'old-cursor', retry_count: 1 });
    const db = new MemorySupabase({
      provider_accounts: [{ ...account }],
      calendar_sync_states: [{ ...state }],
      events: [],
    });
    db.failNext('events', 'upsert');
    const { provider } = createScriptedProvider({
      kind: 'google',
      incrementalSync: async () => ({
        events: [normalisedEvent('provider-event')],
        cursor: 'new-cursor',
      }),
    });

    const error = await assertRejects(
      () => syncCalendar(db.asClient(), account, CONTEXT, state, { provider, now: () => NOW }),
      EdgeError,
    );
    assertEquals(error.code, 'UNKNOWN');
    assertEquals(db.rows('calendar_sync_states')[0]?.sync_cursor, 'old-cursor');

    await recordSyncFailure(db.asClient(), state, error);
    assertEquals(db.rows('calendar_sync_states')[0]?.last_error, 'UNKNOWN');
    assertEquals(db.rows('calendar_sync_states')[0]?.retry_count, 2);
    assertEquals(db.rows('calendar_sync_states')[0]?.needs_full_resync, false);
    assertEquals(db.rows('events'), []);
  },
);

Deno.test(
  'replayed provider changes are idempotent and do not overwrite pending edits',
  async () => {
    const db = new MemorySupabase({
      events: [
        {
          id: EVENT_ID,
          provider_account_id: ACCOUNT_ID,
          provider_event_id: 'pending-event',
          title: 'Local edit in flight',
          sync_status: 'pending',
        },
        {
          id: '99999999-9999-9999-9999-999999999999',
          provider_account_id: ACCOUNT_ID,
          provider_event_id: 'provider-deleted',
          title: 'Will be removed',
          sync_status: 'synced',
        },
      ],
    });
    const changes = [
      normalisedEvent('provider-live', { title: 'Provider version' }),
      normalisedEvent('pending-event', { title: 'Stale provider version' }),
      normalisedEvent('provider-deleted', { deleted: true, status: 'cancelled' }),
    ];
    const target = {
      userId: USER_ID,
      calendarId: CALENDAR_ID,
      providerAccountId: ACCOUNT_ID,
    };

    assertEquals(await applyProviderEvents(db.asClient(), target, changes, 'google'), {
      written: 1,
      deleted: 1,
      skippedPending: 1,
    });
    assertEquals(await applyProviderEvents(db.asClient(), target, changes, 'google'), {
      written: 1,
      deleted: 0,
      skippedPending: 1,
    });
    assertEquals(
      db.rows('events').map((row) => [row.provider_event_id, row.title, row.sync_status]),
      [
        ['pending-event', 'Local edit in flight', 'pending'],
        ['provider-live', 'Provider version', 'synced'],
      ],
    );
  },
);

Deno.test(
  'provider-first writes reconcile canonical responses and keep rejected edits truthful',
  async () => {
    const account = providerAccount();
    const draft = eventDraftSchema.parse({
      title: 'Draft title',
      startAt: '2026-01-02T09:00:00.000Z',
      endAt: '2026-01-02T10:00:00.000Z',
      timezone: 'UTC',
    });
    const canonical = normalisedEvent('provider-created', {
      title: 'Canonical provider title',
      providerEtag: 'provider-etag',
    });
    const successDb = new MemorySupabase({
      calendars: [
        {
          id: CALENDAR_ID,
          user_id: USER_ID,
          provider_account_id: ACCOUNT_ID,
          provider_calendar_id: 'provider-calendar',
          is_read_only: false,
        },
      ],
      events: [],
    });
    const { provider: successProvider, calls: successCalls } = createScriptedProvider({
      kind: 'google',
      createEvent: async () => canonical,
    });

    const created = await pushEvent(
      successDb.asClient(),
      account,
      CONTEXT,
      { operation: 'create', calendarId: CALENDAR_ID, draft },
      successProvider,
    );
    assertEquals(created.providerEventId, 'provider-created');
    assertEquals(successDb.rows('events')[0]?.title, 'Canonical provider title');
    assertEquals(successDb.rows('events')[0]?.provider_etag, 'provider-etag');
    assertEquals(successCalls[0]?.providerCalendarId, 'provider-calendar');

    const failedCreateDb = new MemorySupabase({
      calendars: [
        {
          id: CALENDAR_ID,
          user_id: USER_ID,
          provider_account_id: ACCOUNT_ID,
          provider_calendar_id: 'provider-calendar',
          is_read_only: false,
        },
      ],
      events: [],
    });
    const { provider: failedCreateProvider } = createScriptedProvider({
      kind: 'google',
      createEvent: async () => {
        throw new EdgeError('PROVIDER_RATE_LIMITED', 'rate limited', 429);
      },
    });
    await assertRejects(
      () =>
        pushEvent(
          failedCreateDb.asClient(),
          account,
          CONTEXT,
          { operation: 'create', calendarId: CALENDAR_ID, draft },
          failedCreateProvider,
        ),
      EdgeError,
    );
    assertEquals(failedCreateDb.rows('events'), []);

    const updateDb = new MemorySupabase({
      calendars: [
        {
          id: CALENDAR_ID,
          user_id: USER_ID,
          provider_account_id: ACCOUNT_ID,
          provider_calendar_id: 'provider-calendar',
          is_read_only: false,
        },
      ],
      events: [
        {
          id: EVENT_ID,
          user_id: USER_ID,
          calendar_id: CALENDAR_ID,
          provider_account_id: ACCOUNT_ID,
          provider_event_id: 'provider-event',
          provider_etag: 'old-etag',
          title: 'Old local title',
          sync_status: 'synced',
        },
      ],
    });
    const updated = normalisedEvent('provider-event', {
      title: 'Canonical updated title',
      providerEtag: 'new-etag',
    });
    const { provider: updateProvider, calls: updateCalls } = createScriptedProvider({
      kind: 'google',
      updateEvent: async () => updated,
    });
    await pushEvent(
      updateDb.asClient(),
      account,
      CONTEXT,
      { operation: 'update', eventId: EVENT_ID, draft },
      updateProvider,
    );
    assertEquals(updateCalls[0]?.input?.providerEtag, 'old-etag');
    assertEquals(updateDb.rows('events')[0]?.title, 'Canonical updated title');
    assertEquals(updateDb.rows('events')[0]?.sync_status, 'synced');

    const deleteDb = new MemorySupabase({
      calendars: [
        {
          id: CALENDAR_ID,
          user_id: USER_ID,
          provider_account_id: ACCOUNT_ID,
          provider_calendar_id: 'provider-calendar',
          is_read_only: false,
        },
      ],
      events: [
        {
          id: EVENT_ID,
          user_id: USER_ID,
          calendar_id: CALENDAR_ID,
          provider_account_id: ACCOUNT_ID,
          provider_event_id: 'provider-event',
          provider_etag: 'old-etag',
          sync_status: 'synced',
        },
      ],
    });
    const { provider: deleteProvider, calls: deleteCalls } = createScriptedProvider({
      kind: 'google',
    });
    await pushEvent(
      deleteDb.asClient(),
      account,
      CONTEXT,
      { operation: 'delete', eventId: EVENT_ID },
      deleteProvider,
    );
    assertEquals(
      deleteCalls.map((call) => call.operation),
      ['deleteEvent'],
    );
    assertEquals(deleteDb.rows('events'), []);

    const failedDeleteDb = new MemorySupabase({
      calendars: [
        {
          id: CALENDAR_ID,
          user_id: USER_ID,
          provider_account_id: ACCOUNT_ID,
          provider_calendar_id: 'provider-calendar',
          is_read_only: false,
        },
      ],
      events: [
        {
          id: EVENT_ID,
          user_id: USER_ID,
          calendar_id: CALENDAR_ID,
          provider_account_id: ACCOUNT_ID,
          provider_event_id: 'provider-event',
          provider_etag: 'old-etag',
          sync_status: 'synced',
        },
      ],
    });
    const { provider: failedDeleteProvider } = createScriptedProvider({
      kind: 'google',
      deleteEvent: async () => {
        throw new EdgeError('PROVIDER_RATE_LIMITED', 'rate limited', 429);
      },
    });
    await assertRejects(
      () =>
        pushEvent(
          failedDeleteDb.asClient(),
          account,
          CONTEXT,
          { operation: 'delete', eventId: EVENT_ID },
          failedDeleteProvider,
        ),
      EdgeError,
    );
    assertEquals(failedDeleteDb.rows('events')[0]?.sync_status, 'failed');
    assertEquals(failedDeleteDb.rows('events')[0]?.provider_event_id, 'provider-event');
  },
);

Deno.test('read-only and cross-account rows are rejected before provider mutation', async () => {
  const account = providerAccount();
  const draft = eventDraftSchema.parse({
    title: 'No write',
    startAt: '2026-01-02T09:00:00.000Z',
    endAt: '2026-01-02T10:00:00.000Z',
    timezone: 'UTC',
  });
  const readOnlyDb = new MemorySupabase({
    calendars: [
      {
        id: CALENDAR_ID,
        user_id: USER_ID,
        provider_account_id: ACCOUNT_ID,
        provider_calendar_id: 'read-only-calendar',
        is_read_only: true,
      },
    ],
  });
  const { provider: readOnlyProvider, calls: readOnlyCalls } = createScriptedProvider({
    kind: 'google',
    createEvent: async () => normalisedEvent('must-not-write'),
  });
  const readOnlyError = await assertRejects(
    () =>
      pushEvent(
        readOnlyDb.asClient(),
        account,
        CONTEXT,
        { operation: 'create', calendarId: CALENDAR_ID, draft },
        readOnlyProvider,
      ),
    EdgeError,
  );
  assertEquals(readOnlyError.code, 'NOT_AUTHORIZED');
  assertEquals(readOnlyCalls, []);

  const isolatedDb = new MemorySupabase({
    calendars: [
      {
        id: CALENDAR_ID,
        user_id: OTHER_USER_ID,
        provider_account_id: '99999999-9999-9999-9999-999999999999',
        provider_calendar_id: 'other-calendar',
        is_read_only: false,
      },
    ],
  });
  const { provider: isolatedProvider, calls: isolatedCalls } = createScriptedProvider({
    kind: 'google',
    createEvent: async () => normalisedEvent('must-not-write'),
  });
  const isolatedError = await assertRejects(
    () =>
      pushEvent(
        isolatedDb.asClient(),
        account,
        CONTEXT,
        { operation: 'create', calendarId: CALENDAR_ID, draft },
        isolatedProvider,
      ),
    EdgeError,
  );
  assertEquals(isolatedError.code, 'VALIDATION_FAILED');
  assertEquals(isolatedCalls, []);
});

Deno.test(
  'account watch renewal distinguishes a gone Graph subscription from other failures',
  async () => {
    const account = providerAccount({
      provider: 'microsoft',
      webhook_channel_id: 'old-subscription',
      webhook_subscription_id: 'old-subscription',
      webhook_token: 'old-token',
      webhook_expires_at: '2025-12-20T00:00:00.000Z',
    });
    const registration = {
      channelId: 'new-subscription',
      resourceId: null,
      subscriptionId: 'new-subscription',
      token: 'new-token',
      expiresAt: '2026-01-10T00:00:00.000Z',
    };

    const goneDb = new MemorySupabase({ provider_accounts: [{ ...account }] });
    const { provider: goneProvider, calls: goneCalls } = createScriptedProvider({
      kind: 'microsoft',
      watchScope: 'account',
      renewWatch: async () => {
        throw new EdgeError('NOT_FOUND', 'gone', 404);
      },
      watch: async () => registration,
    });
    const recreated = await ensureAccountWatch(
      goneDb.asClient(),
      account,
      CONTEXT,
      { force: true },
      {
        provider: goneProvider,
        now: () => NOW,
        webhookUrl: () => 'https://app.example.com/webhook-microsoft',
      },
    );
    assertEquals(recreated, true);
    assertEquals(
      goneCalls.map((call) => call.operation),
      ['renewWatch', 'unwatch', 'watch'],
    );
    assertEquals(goneDb.rows('provider_accounts')[0]?.webhook_subscription_id, 'new-subscription');

    const otherFailureDb = new MemorySupabase({ provider_accounts: [{ ...account }] });
    const { provider: otherFailureProvider, calls: otherFailureCalls } = createScriptedProvider({
      kind: 'microsoft',
      watchScope: 'account',
      renewWatch: async () => {
        throw new EdgeError('PROVIDER_RATE_LIMITED', 'retry later', 429);
      },
      watch: async () => registration,
    });
    const renewed = await ensureAccountWatch(
      otherFailureDb.asClient(),
      account,
      CONTEXT,
      { force: true },
      {
        provider: otherFailureProvider,
        now: () => NOW,
        webhookUrl: () => 'https://app.example.com/webhook-microsoft',
      },
    );
    assertEquals(renewed, false);
    assertEquals(
      otherFailureCalls.map((call) => call.operation),
      ['renewWatch'],
    );
    assertEquals(
      otherFailureDb.rows('provider_accounts')[0]?.webhook_subscription_id,
      'old-subscription',
    );

    const healthyDb = new MemorySupabase({
      provider_accounts: [{ ...account, webhook_expires_at: '2026-01-05T00:00:00.000Z' }],
    });
    const { provider: healthyProvider, calls: healthyCalls } = createScriptedProvider({
      kind: 'microsoft',
      watchScope: 'account',
      watch: async () => registration,
    });
    assertEquals(
      await ensureAccountWatch(
        healthyDb.asClient(),
        { ...account, webhook_expires_at: '2026-01-05T00:00:00.000Z' },
        CONTEXT,
        {},
        {
          provider: healthyProvider,
          now: () => NOW,
          webhookUrl: () => 'https://app.example.com/webhook-microsoft',
        },
      ),
      true,
    );
    assertEquals(healthyCalls, []);
  },
);

Deno.test(
  'calendar watch persistence failure discards the newly created remote watch',
  async () => {
    const account = providerAccount({
      webhook_channel_id: null,
      webhook_resource_id: null,
      webhook_subscription_id: null,
    });
    const state = syncState({
      webhook_channel_id: 'old-channel',
      webhook_resource_id: 'old-resource',
      webhook_token: 'old-token',
      webhook_expires_at: '2025-12-20T00:00:00.000Z',
    });
    const fresh = {
      channelId: 'fresh-channel',
      resourceId: 'fresh-resource',
      subscriptionId: null,
      token: 'fresh-token',
      expiresAt: '2026-01-10T00:00:00.000Z',
    };
    const db = new MemorySupabase({ calendar_sync_states: [{ ...state }] });
    db.failNext('calendar_sync_states', 'update');
    const { provider, calls } = createScriptedProvider({
      kind: 'google',
      watchScope: 'calendar',
      watch: async () => fresh,
    });

    assertEquals(
      await ensureWatch(
        db.asClient(),
        account,
        CONTEXT,
        state,
        {},
        {
          provider,
          now: () => NOW,
          webhookUrl: () => 'https://app.example.com/webhook-google',
        },
      ),
      false,
    );
    assertEquals(
      calls.map((call) => call.operation),
      ['unwatch', 'watch', 'unwatch'],
    );
    assertEquals(calls[0]?.registration?.channelId, 'old-channel');
    assertEquals(calls[2]?.registration?.channelId, 'fresh-channel');
    assertEquals(db.rows('calendar_sync_states')[0]?.webhook_channel_id, 'old-channel');
  },
);

Deno.test('worker fences a queue row whose user does not own the provider account', async () => {
  const account = providerAccount();
  const job: SyncJob = {
    id: '77777777-7777-7777-7777-777777777777',
    user_id: OTHER_USER_ID,
    provider_account_id: account.id,
    kind: 'account.sync',
    payload: {},
    attempts: 1,
    claim_token: '88888888-8888-8888-8888-888888888888',
  };
  const db = new MemorySupabase({ provider_accounts: [{ ...account }] });
  let claimAvailable = true;
  db.onRpc('claim_sync_jobs', () => {
    if (!claimAvailable) return [];
    claimAvailable = false;
    return [job];
  });
  db.onRpc('complete_sync_job', () => null);

  assertEquals(await drainQueue(db.asClient(), 1), {
    claimed: 1,
    succeeded: 0,
    failed: 1,
  });
  assertEquals(
    db.rpcCalls.map((call) => call.name),
    ['claim_sync_jobs', 'complete_sync_job'],
  );
  assertEquals(
    db.rpcCalls.some((call) => call.name === 'read_provider_secret'),
    false,
  );
  assertEquals(db.rpcCalls[1]?.params.p_error, 'NOT_AUTHORIZED');
});

Deno.test(
  'worker fences a calendar state from another provider account before reading secrets',
  async () => {
    const job: SyncJob = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      user_id: USER_ID,
      provider_account_id: ACCOUNT_ID,
      kind: 'calendar.sync',
      payload: { calendarId: CALENDAR_ID },
      attempts: 1,
      claim_token: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    };
    const db = new MemorySupabase({
      provider_accounts: [{ ...providerAccount() }],
      calendar_sync_states: [
        {
          ...syncState({ provider_account_id: '99999999-9999-9999-9999-999999999999' }),
        },
      ],
    });
    let claimAvailable = true;
    db.onRpc('claim_sync_jobs', () => {
      if (!claimAvailable) return [];
      claimAvailable = false;
      return [job];
    });
    db.onRpc('complete_sync_job', () => null);

    assertEquals(await drainQueue(db.asClient(), 1), {
      claimed: 1,
      succeeded: 0,
      failed: 1,
    });
    assertEquals(
      db.rpcCalls.some((call) => call.name === 'read_provider_secret'),
      false,
    );
    assertEquals(db.rpcCalls[1]?.params.p_error, 'NOT_AUTHORIZED');
  },
);

Deno.test(
  'disconnect teardown deduplicates watches and continues after remote cleanup failure',
  async () => {
    const account = providerAccount({
      provider: 'microsoft',
      webhook_channel_id: 'channel-1',
      webhook_subscription_id: 'subscription-1',
      webhook_token: 'token-1',
      webhook_expires_at: '2026-01-10T00:00:00.000Z',
    });
    const db = new MemorySupabase({
      provider_accounts: [{ ...account }],
      calendar_sync_states: [
        {
          provider_account_id: account.id,
          webhook_channel_id: 'channel-1',
          webhook_resource_id: null,
          webhook_subscription_id: 'subscription-1',
          webhook_token: 'token-1',
          webhook_expires_at: '2026-01-10T00:00:00.000Z',
        },
        {
          provider_account_id: account.id,
          webhook_channel_id: 'channel-2',
          webhook_resource_id: null,
          webhook_subscription_id: 'subscription-2',
          webhook_token: 'token-2',
          webhook_expires_at: '2026-01-10T00:00:00.000Z',
        },
      ],
    });
    const timeline: string[] = [];
    db.onRpc('read_provider_secret', () => {
      timeline.push('read-secret');
      return 'dummy-refresh-token';
    });
    db.onRpc('delete_provider_secret', () => {
      timeline.push('delete-secret');
      return null;
    });
    const { provider } = createScriptedProvider({
      kind: 'microsoft',
      watchScope: 'account',
      unwatch: async (_ctx, registration) => {
        const id = registration.subscriptionId ?? registration.channelId;
        timeline.push(`unwatch:${id}`);
        if (id === 'subscription-1') throw new Error('remote cleanup failed');
      },
    });
    const auth: ProviderAuth = {
      kind: 'microsoft',
      authorizationUrl: () => 'https://example.com/authorize',
      exchangeCode: async () => {
        throw new Error('not used');
      },
      refresh: async () => {
        throw new Error('not used');
      },
      identify: async () => ({ providerUserId: 'not-used', email: null }),
      revoke: async () => {
        timeline.push('revoke');
      },
    };

    await releaseProviderGrant(db.asClient(), account.id, {
      resolveContext: async () => CONTEXT,
      providerFor: () => provider,
      authFor: () => auth,
    });

    assertEquals(timeline, [
      'read-secret',
      'unwatch:subscription-1',
      'unwatch:subscription-2',
      'revoke',
      'delete-secret',
    ]);
    assertEquals(
      db.rpcCalls.map((call) => call.name),
      ['read_provider_secret', 'delete_provider_secret'],
    );
  },
);

function providerAccount(overrides: Partial<ProviderAccountRow> = {}): ProviderAccountRow {
  return {
    id: ACCOUNT_ID,
    user_id: USER_ID,
    provider: 'google',
    provider_user_id: 'dummy-provider-user',
    email: 'person@example.com',
    status: 'active',
    scopes: [],
    webhook_channel_id: null,
    webhook_resource_id: null,
    webhook_subscription_id: null,
    webhook_token: null,
    webhook_expires_at: null,
    ...overrides,
  };
}

function syncState(overrides: Partial<SyncStateRow> = {}): SyncStateRow {
  return {
    id: STATE_ID,
    provider_account_id: ACCOUNT_ID,
    calendar_id: CALENDAR_ID,
    provider_calendar_id: 'provider-calendar',
    sync_cursor: 'old-cursor',
    needs_full_resync: false,
    webhook_channel_id: null,
    webhook_resource_id: null,
    webhook_subscription_id: null,
    webhook_token: null,
    webhook_expires_at: null,
    retry_count: 0,
    ...overrides,
  };
}

function normalisedEvent(
  providerEventId: string,
  overrides: Partial<NormalisedEvent> = {},
): NormalisedEvent {
  return {
    providerEventId,
    providerEtag: null,
    providerUpdatedAt: '2026-01-01T00:00:00.000Z',
    title: 'Provider event',
    description: null,
    location: null,
    startAt: '2026-01-02T09:00:00.000Z',
    endAt: '2026-01-02T10:00:00.000Z',
    allDay: false,
    timezone: 'UTC',
    status: 'confirmed',
    recurrenceRule: null,
    alerts: [],
    recurringEventId: null,
    recurrenceOriginalStartAt: null,
    deleted: false,
    ...overrides,
  };
}
