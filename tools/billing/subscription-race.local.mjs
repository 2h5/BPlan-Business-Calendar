// Local-only integration test. Start the approved local Supabase stack first.
// Two pg Clients are two independent PostgreSQL backend sessions; the barrier
// checks pg_blocking_pids before releasing the transaction holding the row lock.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import pg from 'pg';

const database = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
  connectionTimeoutMillis: 3000,
};

const clients = [new pg.Client(database), new pg.Client(database)];
const users = [randomUUID(), randomUUID(), randomUUID()];

function event(id, type, status, eventAt, expiresAt) {
  return {
    id,
    type,
    status,
    eventAt: new Date(eventAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

async function processEvent(client, userId, delivery) {
  const result = await client.query(
    `select public.process_revenuecat_event(
      $1::text, $2::uuid, $3::text, $4::timestamptz,
      $5::text, $6::timestamptz, 'local-race-test',
      array['pro']::text[], array[]::uuid[], null::text, '{}'::jsonb
    ) as outcome`,
    [delivery.id, userId, delivery.type, delivery.eventAt, delivery.status, delivery.expiresAt],
  );
  return result.rows[0].outcome;
}

async function waitUntilBlocked(observer, waitingPid, holdingPid) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await observer.query(
      'select $1::int = any(pg_blocking_pids($2::int)) as blocked',
      [holdingPid, waitingPid],
    );
    if (result.rows[0].blocked) return;
    await delay(25);
  }
  throw new Error('The second database session did not reach the lock barrier.');
}

async function overlap(userId, first, second, firstClient, secondClient, pids) {
  await firstClient.query('begin');
  let inTransaction = true;
  let secondCall;
  try {
    const firstOutcome = await processEvent(firstClient, userId, first);
    secondCall = processEvent(secondClient, userId, second);
    await waitUntilBlocked(firstClient, pids[1], pids[0]);
    await firstClient.query('commit');
    inTransaction = false;
    const secondOutcome = await secondCall;
    return { firstOutcome, secondOutcome };
  } finally {
    if (inTransaction) {
      await firstClient.query('rollback');
      await secondCall?.catch(() => undefined);
    }
  }
}

async function inspect(client, userId, events) {
  const mirror = await client.query(
    `select status, expires_at, last_event_at
     from public.subscriptions where user_id = $1::uuid and entitlement = 'pro'`,
    [userId],
  );
  const ledger = await client.query(
    `select event_id, applied, skipped_reason
     from public.subscription_events where event_id = any($1::text[])`,
    [events.map((item) => item.id)],
  );
  const entitlement = await client.query(
    `select public.has_active_entitlement($1::uuid, 'pro') as active`,
    [userId],
  );
  return {
    mirrorRows: mirror.rowCount,
    status: mirror.rows[0]?.status ?? null,
    expiresAt: mirror.rows[0]?.expires_at?.toISOString() ?? null,
    lastEventAt: mirror.rows[0]?.last_event_at?.toISOString() ?? null,
    ledgerRows: ledger.rowCount,
    ledger: events.map((item) => {
      const row = ledger.rows.find((candidate) => candidate.event_id === item.id);
      return { applied: row?.applied ?? null, skippedReason: row?.skipped_reason ?? null };
    }),
    entitled: entitlement.rows[0].active,
  };
}

function expectState(label, actual, expected) {
  process.stdout.write(`${label}: ${JSON.stringify(actual)}\n`);
  assert.deepEqual(actual, expected, `${label} violated the mirror or ledger invariant`);
}

async function main() {
  const [firstClient, secondClient] = clients;
  let connected = 0;
  try {
    for (const client of clients) {
      await client.connect();
      connected += 1;
      await client.query("set statement_timeout = '15s'");
    }
    const pids = [];
    for (const client of clients) {
      pids.push((await client.query('select pg_backend_pid() as pid')).rows[0].pid);
    }
    assert.notEqual(pids[0], pids[1], 'Two independent database sessions are required.');

    for (const userId of users) {
      await firstClient.query(
        `insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
         values ('00000000-0000-0000-0000-000000000000', $1::uuid,
                 'authenticated', 'authenticated', $2, now(), now())`,
        [userId, `billing-race-${userId}@example.invalid`],
      );
    }
    for (const client of clients) await client.query('set role service_role');
    process.stdout.write('Two service-role database sessions connected to local port 54322.\n');

    // B: the newer renewal holds the row while the older expiration waits.
    const newer = event(
      'race-b-renewal',
      'RENEWAL',
      'active',
      '2026-09-20T00:00:00Z',
      '2027-01-01T00:00:00Z',
    );
    const stale = event(
      'race-b-expiration',
      'EXPIRATION',
      'expired',
      '2026-09-10T00:00:00Z',
      '2026-09-10T00:00:00Z',
    );
    const b = await overlap(users[0], newer, stale, firstClient, secondClient, pids);
    assert.deepEqual(b, { firstOutcome: 'APPLIED', secondOutcome: 'STALE' });
    expectState(
      'B newer renewal versus stale expiration',
      await inspect(firstClient, users[0], [newer, stale]),
      {
        mirrorRows: 1,
        status: 'active',
        expiresAt: newer.expiresAt,
        lastEventAt: newer.eventAt,
        ledgerRows: 2,
        ledger: [
          { applied: true, skippedReason: null },
          { applied: false, skippedReason: 'STALE_EVENT' },
        ],
        entitled: true,
      },
    );

    // C: newer expiration commits first; an older renewal finishes later but
    // must not restore entitlement merely because its connection completed last.
    const baseline = event(
      'race-c-baseline',
      'INITIAL_PURCHASE',
      'active',
      '2026-09-01T00:00:00Z',
      '2026-10-01T00:00:00Z',
    );
    const expired = event(
      'race-c-expiration',
      'EXPIRATION',
      'expired',
      '2026-09-20T00:00:00Z',
      '2026-09-20T00:00:00Z',
    );
    const renewed = event(
      'race-c-renewal',
      'RENEWAL',
      'active',
      '2026-09-10T00:00:00Z',
      '2027-02-01T00:00:00Z',
    );
    assert.equal(await processEvent(firstClient, users[1], baseline), 'APPLIED');
    const c = await overlap(users[1], expired, renewed, firstClient, secondClient, pids);
    assert.deepEqual(c, { firstOutcome: 'APPLIED', secondOutcome: 'STALE' });
    expectState(
      'C expiration versus renewal',
      await inspect(firstClient, users[1], [baseline, expired, renewed]),
      {
        mirrorRows: 1,
        status: 'expired',
        expiresAt: expired.expiresAt,
        lastEventAt: expired.eventAt,
        ledgerRows: 3,
        ledger: [
          { applied: true, skippedReason: null },
          { applied: true, skippedReason: null },
          { applied: false, skippedReason: 'STALE_EVENT' },
        ],
        entitled: false,
      },
    );

    // A: both deliveries carry one event ID. The second session waits for the
    // winning claim, then observes DUPLICATE and preserves the first result.
    const duplicate = event(
      'race-a-duplicate',
      'INITIAL_PURCHASE',
      'active',
      '2026-09-20T00:00:00Z',
      '2027-01-01T00:00:00Z',
    );
    const a = await overlap(users[2], duplicate, duplicate, firstClient, secondClient, pids);
    assert.deepEqual(a, { firstOutcome: 'APPLIED', secondOutcome: 'DUPLICATE' });
    expectState(
      'A concurrent duplicate delivery',
      await inspect(firstClient, users[2], [duplicate]),
      {
        mirrorRows: 1,
        status: 'active',
        expiresAt: duplicate.expiresAt,
        lastEventAt: duplicate.eventAt,
        ledgerRows: 1,
        ledger: [{ applied: true, skippedReason: null }],
        entitled: true,
      },
    );
  } finally {
    for (let index = 0; index < connected; index += 1) {
      await clients[index].query('rollback').catch(() => undefined);
      await clients[index].query('reset role').catch(() => undefined);
    }
    if (connected > 0) {
      await firstClient
        .query('delete from auth.users where id = any($1::uuid[])', [users])
        .catch(() => undefined);
    }
    for (let index = 0; index < connected; index += 1) await clients[index].end();
  }
}

main().catch((error) => {
  // The state summary above is deliberately limited to status and event facts.
  process.stderr.write(`${error instanceof Error ? error.message : 'Local race test failed.'}\n`);
  process.exitCode = 1;
});
