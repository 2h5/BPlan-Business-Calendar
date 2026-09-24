// Local-only integration test for the RevenueCat billing database boundary.
// Start a local Supabase stack first (CI's database job does). Each pg Client
// is an independent PostgreSQL backend session. Every overlap scenario checks
// pg_blocking_pids before it releases the transaction holding the lock, so a
// pass proves the second session really waited rather than ran afterwards.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import pg from 'pg';

// Only a loopback database is ever accepted; the port may differ between stacks.
const port = Number(process.env.BILLING_RACE_DB_PORT ?? '54322');
assert.ok(
  Number.isInteger(port) && port > 0 && port < 65536,
  'BILLING_RACE_DB_PORT must be a port.',
);
const database = {
  host: '127.0.0.1',
  port,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
  connectionTimeoutMillis: 3000,
};

const [first, second, admin] = [
  new pg.Client(database),
  new pg.Client(database),
  new pg.Client(database),
];
const users = [];
const pids = new Map();
// Event IDs are unique per run so an aborted earlier run cannot turn a race into a DUPLICATE.
const run = randomUUID().slice(0, 8);

const iso = (value) => new Date(value).toISOString();
const minutesAgo = (minutes) => iso(Date.now() - minutes * 60_000);
const daysAhead = (days) => iso(Date.now() + days * 86_400_000);

function delivery(id, type, status, eventAt, expiresAt) {
  return { id: `${id}-${run}`, type, status, eventAt, expiresAt };
}

async function processEvent(client, userId, event) {
  const result = await client.query(
    `select public.process_revenuecat_event(
      $1::text, $2::text, $3::timestamptz, 'SANDBOX', 'apply', $4::text, $4::uuid,
      $5::text, $6::timestamptz, 'local-race-test', array['pro']::text[], array[]::uuid[],
      null::text, '{}'::jsonb
    ) as outcome`,
    [event.id, event.type, event.eventAt, userId, event.status, event.expiresAt],
  );
  return result.rows[0].outcome;
}

async function claimFor(client, userId) {
  await admin.query('select public.enqueue_revenuecat_reconciliation($1::uuid, $2)', [
    userId,
    'SWEEP',
  ]);
  const result = await client.query(
    'select claimed_user_id, claimed_lease_token from public.claim_revenuecat_reconciliations(100, 60)',
  );
  const row = result.rows.find((candidate) => candidate.claimed_user_id === userId);
  assert.ok(row, 'The reconciliation request was not claimable.');
  return row.claimed_lease_token;
}

async function applySnapshot(client, userId, leaseToken, snapshotAt, active) {
  const result = await client.query(
    `select public.apply_revenuecat_snapshot(
      $1::uuid, $2::uuid, $3::timestamptz, 'SANDBOX', $4::jsonb, array[]::text[], '{}'::jsonb
    ) as outcome`,
    [userId, leaseToken, snapshotAt, active === null ? null : JSON.stringify(active)],
  );
  return result.rows[0].outcome;
}

async function waitUntilBlocked(waiter, holder) {
  // The holder is idle inside its open transaction, so it can observe; the
  // waiter cannot, because its connection is busy with the blocked statement.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await holder.query(
      'select $1::int = any(pg_blocking_pids($2::int)) as blocked',
      [pids.get(holder), pids.get(waiter)],
    );
    if (result.rows[0].blocked) return;
    await delay(25);
  }
  throw new Error('The waiting session did not reach the lock barrier.');
}

/**
 * Run holdFn inside an open transaction on `holder`, start waitFn on `waiter`,
 * prove it is blocked by `holder`, then finish the holder with `ending`.
 */
async function overlap({ holder, waiter, holdFn, waitFn, ending = 'commit' }) {
  await holder.query('begin');
  let open = true;
  let waiting;
  try {
    const held = await holdFn(holder);
    waiting = waitFn(waiter);
    // Observed below; this only stops an early rejection being reported as unhandled.
    waiting.catch(() => undefined);
    await waitUntilBlocked(waiter, holder);
    await holder.query(ending);
    open = false;
    return { held, waited: await waiting };
  } finally {
    if (open) {
      await holder.query('rollback');
      await waiting?.catch(() => undefined);
    }
  }
}

async function inspect(userId, eventIds) {
  const mirror = await admin.query(
    `select status, expires_at, last_event_at from public.subscriptions
      where user_id = $1::uuid and entitlement = 'pro'`,
    [userId],
  );
  const ledger = await admin.query(
    `select event_id, applied, skipped_reason, duplicate_deliveries, user_id
       from public.subscription_events where event_id = any($1::text[])`,
    [eventIds],
  );
  const entitlement = await admin.query(
    `select public.has_active_entitlement($1::uuid, 'pro') as active`,
    [userId],
  );
  return {
    mirrorRows: mirror.rowCount,
    status: mirror.rows[0]?.status ?? null,
    expiresAt: mirror.rows[0]?.expires_at?.toISOString() ?? null,
    lastEventAt: mirror.rows[0]?.last_event_at?.toISOString() ?? null,
    ledger: eventIds.map((eventId) => {
      const row = ledger.rows.find((candidate) => candidate.event_id === eventId);
      return row
        ? {
            applied: row.applied,
            skippedReason: row.skipped_reason,
            duplicates: row.duplicate_deliveries,
          }
        : null;
    }),
    entitled: entitlement.rows[0].active,
  };
}

function expectState(label, actual, expected) {
  process.stdout.write(`${label}: ${JSON.stringify(actual)}\n`);
  assert.deepEqual(actual, expected, `${label} violated the mirror or ledger invariant`);
}

async function newUser() {
  const userId = randomUUID();
  await admin.query(
    `insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1::uuid,
             'authenticated', 'authenticated', $2, now(), now())`,
    [userId, `billing-race-${userId}@example.invalid`],
  );
  users.push(userId);
  return userId;
}

// ---------------------------------------------------------------------------
// Webhook ordering and duplicates
// ---------------------------------------------------------------------------

async function newerRenewalBeatsStaleExpiration() {
  const userId = await newUser();
  const newer = delivery(
    'race-b-renewal',
    'RENEWAL',
    'active',
    iso('2026-09-20T00:00:00Z'),
    iso('2027-01-01T00:00:00Z'),
  );
  const stale = delivery(
    'race-b-expiration',
    'EXPIRATION',
    'expired',
    iso('2026-09-10T00:00:00Z'),
    iso('2026-09-10T00:00:00Z'),
  );
  const result = await overlap({
    holder: first,
    waiter: second,
    holdFn: (client) => processEvent(client, userId, newer),
    waitFn: (client) => processEvent(client, userId, stale),
  });
  assert.deepEqual(result, { held: 'APPLIED', waited: 'STALE' });
  expectState(
    'newer renewal versus stale expiration',
    await inspect(userId, [newer.id, stale.id]),
    {
      mirrorRows: 1,
      status: 'active',
      expiresAt: newer.expiresAt,
      lastEventAt: newer.eventAt,
      ledger: [
        { applied: true, skippedReason: null, duplicates: 0 },
        { applied: false, skippedReason: 'STALE_EVENT', duplicates: 0 },
      ],
      entitled: true,
    },
  );
}

async function newerExpirationBeatsOlderRenewal() {
  const userId = await newUser();
  const baseline = delivery(
    'race-c-baseline',
    'INITIAL_PURCHASE',
    'active',
    iso('2026-09-01T00:00:00Z'),
    iso('2026-10-01T00:00:00Z'),
  );
  const expired = delivery(
    'race-c-expiration',
    'EXPIRATION',
    'expired',
    iso('2026-09-20T00:00:00Z'),
    iso('2026-09-20T00:00:00Z'),
  );
  const renewed = delivery(
    'race-c-renewal',
    'RENEWAL',
    'active',
    iso('2026-09-10T00:00:00Z'),
    iso('2027-02-01T00:00:00Z'),
  );
  assert.equal(await processEvent(first, userId, baseline), 'APPLIED');
  const result = await overlap({
    holder: first,
    waiter: second,
    holdFn: (client) => processEvent(client, userId, expired),
    waitFn: (client) => processEvent(client, userId, renewed),
  });
  assert.deepEqual(result, { held: 'APPLIED', waited: 'STALE' });
  expectState(
    'newer expiration versus older renewal',
    await inspect(userId, [baseline.id, expired.id, renewed.id]),
    {
      mirrorRows: 1,
      status: 'expired',
      expiresAt: expired.expiresAt,
      lastEventAt: expired.eventAt,
      ledger: [
        { applied: true, skippedReason: null, duplicates: 0 },
        { applied: true, skippedReason: null, duplicates: 0 },
        { applied: false, skippedReason: 'STALE_EVENT', duplicates: 0 },
      ],
      entitled: false,
    },
  );
}

async function concurrentDuplicateIsCounted() {
  const userId = await newUser();
  const event = delivery(
    'race-a-duplicate',
    'INITIAL_PURCHASE',
    'active',
    iso('2026-09-20T00:00:00Z'),
    iso('2027-01-01T00:00:00Z'),
  );
  const result = await overlap({
    holder: first,
    waiter: second,
    holdFn: (client) => processEvent(client, userId, event),
    waitFn: (client) => processEvent(client, userId, event),
  });
  assert.deepEqual(result, { held: 'APPLIED', waited: 'DUPLICATE' });
  expectState('concurrent duplicate delivery', await inspect(userId, [event.id]), {
    mirrorRows: 1,
    status: 'active',
    expiresAt: event.expiresAt,
    lastEventAt: event.eventAt,
    ledger: [{ applied: true, skippedReason: null, duplicates: 1 }],
    entitled: true,
  });
}

async function duplicateTakesOverAfterWinnerRollsBack() {
  const userId = await newUser();
  const event = delivery(
    'race-d-rollback',
    'INITIAL_PURCHASE',
    'active',
    iso('2026-09-20T00:00:00Z'),
    iso('2027-01-01T00:00:00Z'),
  );
  const result = await overlap({
    holder: first,
    waiter: second,
    holdFn: (client) => processEvent(client, userId, event),
    waitFn: (client) => processEvent(client, userId, event),
    ending: 'rollback',
  });
  assert.deepEqual(result, { held: 'APPLIED', waited: 'APPLIED' });
  expectState(
    'duplicate after the winning delivery rolls back',
    await inspect(userId, [event.id]),
    {
      mirrorRows: 1,
      status: 'active',
      expiresAt: event.expiresAt,
      lastEventAt: event.eventAt,
      ledger: [{ applied: true, skippedReason: null, duplicates: 0 }],
      entitled: true,
    },
  );
}

// ---------------------------------------------------------------------------
// Account deletion racing a webhook
// ---------------------------------------------------------------------------

async function webhookWaitingOnDeletionBecomesTerminal() {
  const userId = await newUser();
  const event = delivery('race-e-deleted', 'RENEWAL', 'active', minutesAgo(1), daysAhead(30));
  const result = await overlap({
    holder: admin,
    waiter: first,
    holdFn: (client) => client.query('delete from auth.users where id = $1::uuid', [userId]),
    waitFn: (client) => processEvent(client, userId, event),
  });
  // The foreign-key check waited for the deletion, then found no user: a
  // terminal, audited outcome instead of a 500 that RevenueCat retries.
  assert.equal(result.waited, 'IGNORED');
  const ledger = await admin.query(
    `select applied, user_id, skipped_reason, app_user_id from public.subscription_events where event_id = $1`,
    [event.id],
  );
  expectState('webhook waiting on account deletion', ledger.rows[0], {
    applied: false,
    user_id: null,
    skipped_reason: 'UNKNOWN_APP_USER',
    app_user_id: userId,
  });
  const rows = await admin.query(
    'select count(*)::int as count from public.subscriptions where user_id = $1',
    [userId],
  );
  assert.equal(rows.rows[0].count, 0);
}

async function deletionWaitsForWebhookThenCascades() {
  const userId = await newUser();
  const event = delivery(
    'race-f-then-delete',
    'INITIAL_PURCHASE',
    'active',
    minutesAgo(1),
    daysAhead(30),
  );
  const result = await overlap({
    holder: first,
    waiter: admin,
    holdFn: (client) => processEvent(client, userId, event),
    waitFn: (client) => client.query('delete from auth.users where id = $1::uuid', [userId]),
  });
  assert.equal(result.held, 'APPLIED');
  const rows = await admin.query(
    `select (select count(*)::int from public.subscriptions where user_id = $1::uuid) as mirror,
            (select count(*)::int from public.subscription_events where user_id = $1::uuid) as ledger`,
    [userId],
  );
  expectState('account deletion after an in-flight webhook', rows.rows[0], {
    mirror: 0,
    ledger: 0,
  });
}

// ---------------------------------------------------------------------------
// Reconciliation snapshots racing webhooks, and worker leases
// ---------------------------------------------------------------------------

async function newerWebhookBeatsWaitingSnapshot() {
  const userId = await newUser();
  const purchase = delivery(
    'race-g-purchase',
    'INITIAL_PURCHASE',
    'active',
    minutesAgo(60),
    daysAhead(10),
  );
  assert.equal(await processEvent(first, userId, purchase), 'APPLIED');
  const lease = await claimFor(second, userId);
  const renewal = delivery('race-g-renewal', 'RENEWAL', 'active', minutesAgo(1), daysAhead(40));
  const result = await overlap({
    holder: first,
    waiter: second,
    holdFn: (client) => processEvent(client, userId, renewal),
    // A snapshot read before the renewal says Pro is gone.
    waitFn: (client) => applySnapshot(client, userId, lease, minutesAgo(5), []),
  });
  assert.deepEqual(result, { held: 'APPLIED', waited: 'STALE' });
  const state = await inspect(userId, [purchase.id, renewal.id]);
  expectState(
    'snapshot waiting on a newer webhook',
    { status: state.status, entitled: state.entitled },
    {
      status: 'active',
      entitled: true,
    },
  );
}

async function snapshotBeatsOlderWaitingWebhook() {
  const userId = await newUser();
  const purchase = delivery(
    'race-h-purchase',
    'INITIAL_PURCHASE',
    'active',
    minutesAgo(60),
    daysAhead(10),
  );
  assert.equal(await processEvent(first, userId, purchase), 'APPLIED');
  const lease = await claimFor(first, userId);
  const expiry = daysAhead(40);
  const late = delivery(
    'race-h-late-expiry',
    'EXPIRATION',
    'expired',
    minutesAgo(10),
    minutesAgo(10),
  );
  const result = await overlap({
    holder: first,
    waiter: second,
    holdFn: (client) =>
      applySnapshot(client, userId, lease, minutesAgo(2), [
        { entitlement: 'pro', expires_at: expiry },
      ]),
    waitFn: (client) => processEvent(client, userId, late),
  });
  assert.deepEqual(result, { held: 'REPAIRED', waited: 'STALE' });
  const state = await inspect(userId, [late.id]);
  expectState(
    'older webhook waiting on a snapshot',
    { expiresAt: state.expiresAt, entitled: state.entitled },
    {
      expiresAt: expiry,
      entitled: true,
    },
  );
}

async function concurrentWorkersClaimDisjointUsers() {
  const [one, two] = [await newUser(), await newUser()];
  await admin.query('select public.enqueue_revenuecat_reconciliation($1::uuid, $2)', [
    one,
    'SWEEP',
  ]);
  await admin.query('select public.enqueue_revenuecat_reconciliation($1::uuid, $2)', [
    two,
    'SWEEP',
  ]);
  await first.query('begin');
  try {
    const held = await first.query(
      'select claimed_user_id from public.claim_revenuecat_reconciliations(1, 60)',
    );
    // SKIP LOCKED: the second worker must not wait for, or re-claim, the first worker's row.
    const other = await second.query(
      'select claimed_user_id from public.claim_revenuecat_reconciliations(100, 60)',
    );
    const mine = held.rows.map((row) => row.claimed_user_id);
    const theirs = other.rows
      .map((row) => row.claimed_user_id)
      .filter((id) => id === one || id === two);
    assert.equal(mine.length, 1);
    assert.equal(theirs.length, 1);
    assert.notEqual(mine[0], theirs[0]);
    await first.query('commit');
    process.stdout.write('concurrent workers: disjoint claims without waiting\n');
  } catch (error) {
    await first.query('rollback');
    throw error;
  }
}

async function expiredLeaseIsFenced() {
  const userId = await newUser();
  const staleLease = await claimFor(first, userId);
  await admin.query(
    `update public.revenuecat_reconciliations set leased_until = now() - interval '1 second'
      where user_id = $1::uuid`,
    [userId],
  );
  const claimed = await second.query(
    'select claimed_lease_token from public.claim_revenuecat_reconciliations(100, 60) where claimed_user_id = $1::uuid',
    [userId],
  );
  const currentLease = claimed.rows[0]?.claimed_lease_token;
  assert.ok(currentLease, 'The expired lease was not reclaimable.');
  const grant = [{ entitlement: 'pro', expires_at: daysAhead(30) }];
  assert.equal(await applySnapshot(first, userId, staleLease, minutesAgo(1), grant), 'LEASE_LOST');
  assert.equal((await inspect(userId, [])).entitled, false);
  assert.equal(await applySnapshot(second, userId, currentLease, minutesAgo(1), grant), 'REPAIRED');
  process.stdout.write('lease fencing: the superseded worker changed nothing\n');
}

async function hintDuringSnapshotStaysPending() {
  const userId = await newUser();
  const lease = await claimFor(first, userId);
  const result = await overlap({
    holder: first,
    waiter: admin,
    holdFn: (client) => applySnapshot(client, userId, lease, minutesAgo(1), []),
    waitFn: (client) =>
      client.query('select public.enqueue_revenuecat_reconciliation($1::uuid, $2) as queued', [
        userId,
        'TRANSFER',
      ]),
  });
  assert.equal(result.held, 'CONVERGED');
  const state = await admin.query(
    `select reason, requested_at > completed_at as pending, lease_token is null as unleased
       from public.revenuecat_reconciliations where user_id = $1::uuid`,
    [userId],
  );
  expectState('hint arriving during a snapshot', state.rows[0], {
    reason: 'TRANSFER',
    pending: true,
    unleased: true,
  });
}

async function main() {
  let connected = 0;
  try {
    for (const client of [first, second, admin]) {
      await client.connect();
      connected += 1;
      await client.query("set statement_timeout = '15s'");
      pids.set(client, (await client.query('select pg_backend_pid() as pid')).rows[0].pid);
    }
    assert.equal(
      new Set(pids.values()).size,
      3,
      'Three independent database sessions are required.',
    );
    // The webhook and worker sessions use the production role boundary; the
    // admin session only sets up fixtures, deletes accounts, and inspects.
    for (const client of [first, second]) await client.query('set role service_role');
    process.stdout.write(`Three database sessions connected to local port ${port}.\n`);

    await newerRenewalBeatsStaleExpiration();
    await newerExpirationBeatsOlderRenewal();
    await concurrentDuplicateIsCounted();
    await duplicateTakesOverAfterWinnerRollsBack();
    await webhookWaitingOnDeletionBecomesTerminal();
    await deletionWaitsForWebhookThenCascades();
    await newerWebhookBeatsWaitingSnapshot();
    await snapshotBeatsOlderWaitingWebhook();
    await concurrentWorkersClaimDisjointUsers();
    await expiredLeaseIsFenced();
    await hintDuringSnapshotStaysPending();
    process.stdout.write('All RevenueCat billing race scenarios passed.\n');
  } finally {
    for (const client of [first, second, admin].slice(0, connected)) {
      await client.query('rollback').catch(() => undefined);
      await client.query('reset role').catch(() => undefined);
    }
    if (connected === 3 && users.length > 0) {
      await admin
        .query('delete from auth.users where id = any($1::uuid[])', [users])
        .catch(() => undefined);
    }
    for (const client of [first, second, admin].slice(0, connected)) await client.end();
  }
}

main().catch((error) => {
  // The state summaries above are deliberately limited to status and event facts.
  process.stderr.write(`${error instanceof Error ? error.message : 'Local race test failed.'}\n`);
  process.exitCode = 1;
});
