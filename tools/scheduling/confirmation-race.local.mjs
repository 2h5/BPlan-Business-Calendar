// Local-only integration test for concurrent Find Time confirmations.
// Start a local Supabase stack first (CI's database job does). pgTAP runs in a
// single session, so it can only prove that a repeated confirmation is
// idempotent; these scenarios drive two real PostgreSQL sessions at once. Each
// one checks pg_blocking_pids before releasing the transaction holding the
// lock, so a pass proves the second confirmation really waited rather than
// ran afterwards.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import pg from 'pg';

// Only a loopback database is ever accepted; the port may differ between stacks.
const port = Number(process.env.SCHEDULING_RACE_DB_PORT ?? '54322');
assert.ok(
  Number.isInteger(port) && port > 0 && port < 65536,
  'SCHEDULING_RACE_DB_PORT must be a port.',
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

async function confirm(client, userId, suggestionId) {
  const result = await client.query(
    'select status, event_id from public.confirm_ai_schedule_suggestion($1::uuid, $2::uuid)',
    [userId, suggestionId],
  );
  return { status: result.rows[0].status, eventId: result.rows[0].event_id };
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
async function overlap({ holdFn, waitFn, ending = 'commit' }) {
  const [holder, waiter] = [first, second];
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

async function newUser() {
  const userId = randomUUID();
  await admin.query(
    `insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1::uuid,
             'authenticated', 'authenticated', $2, now(), now())`,
    [userId, `confirm-race-${userId}@example.invalid`],
  );
  users.push(userId);
  return userId;
}

/**
 * One open flexible task with a proposed request and one suggestion per slot,
 * shaped exactly as `ai-find-time` persists them. Slots are far in the future
 * so the scenarios never depend on the wall clock.
 */
async function proposal(userId, slots) {
  const taskId = randomUUID();
  const requestId = randomUUID();
  await admin.query(
    `insert into public.tasks (id, user_id, title, estimated_minutes, due_at, has_due_time)
     values ($1::uuid, $2::uuid, 'Race confirmation task', 60, now() + interval '7 days', true)`,
    [taskId, userId],
  );
  await admin.query(
    `insert into public.ai_schedule_requests (
       id, user_id, task_id, status, constraints, target_calendar_id,
       task_version, profile_version, target_calendar_version, candidate_count)
     select $1::uuid, $2::uuid, t.id, 'proposed', '{}'::jsonb, c.id,
            t.updated_at, p.updated_at, c.updated_at, $4::int
       from public.tasks t
       join public.profiles p on p.id = t.user_id
       join public.calendars c on c.user_id = t.user_id and c.is_default
      where t.id = $3::uuid`,
    [requestId, userId, taskId, slots.length],
  );
  const suggestionIds = [];
  for (const [index, startAt] of slots.entries()) {
    const suggestionId = randomUUID();
    await admin.query(
      `insert into public.ai_schedule_suggestions
         (id, request_id, slot_id, start_at, end_at, score, reason, rank)
       values ($1::uuid, $2::uuid, $3, $4::timestamptz,
               $4::timestamptz + interval '1 hour', 0.9, 'Race slot.', $5::int)`,
      [suggestionId, requestId, `race-slot-${index + 1}`, startAt, index + 1],
    );
    suggestionIds.push(suggestionId);
  }
  return { taskId, requestId, suggestionIds };
}

async function inspect(userId, requestIds) {
  const events = await admin.query(
    'select id from public.events where user_id = $1::uuid order by start_at',
    [userId],
  );
  const requests = await admin.query(
    `select id, status, accepted_event_id from public.ai_schedule_requests
      where id = any($1::uuid[])`,
    [requestIds],
  );
  const tasks = await admin.query(
    'select status, scheduled_event_id from public.tasks where user_id = $1::uuid order by id',
    [userId],
  );
  return {
    eventIds: events.rows.map((row) => row.id),
    requests: requestIds.map((id) => {
      const row = requests.rows.find((candidate) => candidate.id === id);
      return { status: row.status, acceptedEventId: row.accepted_event_id };
    }),
    tasks: tasks.rows.map((row) => ({
      status: row.status,
      scheduledEventId: row.scheduled_event_id,
    })),
  };
}

function report(label, value) {
  process.stdout.write(`${label}: ${JSON.stringify(value)}\n`);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

/** A double tap: both sessions confirm the same suggestion at once. */
async function doubleTapCreatesOneEvent() {
  const userId = await newUser();
  const { requestId, suggestionIds } = await proposal(userId, ['2099-03-02T14:00:00Z']);
  const [suggestionId] = suggestionIds;

  const { held, waited } = await overlap({
    holdFn: (client) => confirm(client, userId, suggestionId),
    waitFn: (client) => confirm(client, userId, suggestionId),
  });
  const state = await inspect(userId, [requestId]);
  report('double tap', { held: held.status, waited: waited.status });

  assert.equal(held.status, 'accepted');
  assert.equal(waited.status, 'accepted', 'the second tap must replay the acceptance');
  assert.equal(waited.eventId, held.eventId, 'both taps must return the same event');
  assert.deepEqual(state.eventIds, [held.eventId], 'exactly one event is created');
  assert.deepEqual(state.requests, [{ status: 'accepted', acceptedEventId: held.eventId }]);
  assert.deepEqual(state.tasks, [{ status: 'scheduled', scheduledEventId: held.eventId }]);
}

/** The first confirmation fails and rolls back; the waiting one must still book. */
async function waiterBooksAfterHolderRollsBack() {
  const userId = await newUser();
  const { requestId, suggestionIds } = await proposal(userId, ['2099-03-03T14:00:00Z']);
  const [suggestionId] = suggestionIds;

  const { held, waited } = await overlap({
    holdFn: (client) => confirm(client, userId, suggestionId),
    waitFn: (client) => confirm(client, userId, suggestionId),
    ending: 'rollback',
  });
  const state = await inspect(userId, [requestId]);
  report('holder rollback', { held: held.status, waited: waited.status });

  assert.equal(waited.status, 'accepted', 'a rolled-back attempt must not block the retry');
  assert.deepEqual(state.eventIds, [waited.eventId], 'only the surviving booking exists');
  assert.deepEqual(state.requests, [{ status: 'accepted', acceptedEventId: waited.eventId }]);
  assert.deepEqual(state.tasks, [{ status: 'scheduled', scheduledEventId: waited.eventId }]);
}

/** Two different slots from one proposal: only one may be booked. */
async function twoSlotsOfOneProposalBookOnce() {
  const userId = await newUser();
  const { requestId, suggestionIds } = await proposal(userId, [
    '2099-03-04T14:00:00Z',
    '2099-03-04T16:00:00Z',
  ]);

  const { held, waited } = await overlap({
    holdFn: (client) => confirm(client, userId, suggestionIds[0]),
    waitFn: (client) => confirm(client, userId, suggestionIds[1]),
  });
  const state = await inspect(userId, [requestId]);
  report('two slots, one proposal', { held: held.status, waited: waited.status });

  assert.equal(held.status, 'accepted');
  assert.equal(waited.status, 'stale', 'the other slot of an accepted proposal is stale');
  assert.deepEqual(state.eventIds, [held.eventId], 'the task is booked exactly once');
  assert.deepEqual(state.tasks, [{ status: 'scheduled', scheduledEventId: held.eventId }]);
}

/**
 * Two proposals for different tasks offered the same hour. Each was free when
 * proposed; whichever confirms second must see the first booking and refuse,
 * never double-book the user.
 */
async function overlappingProposalsNeverDoubleBook() {
  const userId = await newUser();
  const one = await proposal(userId, ['2099-03-05T14:00:00Z']);
  const two = await proposal(userId, ['2099-03-05T14:30:00Z']);

  const { held, waited } = await overlap({
    holdFn: (client) => confirm(client, userId, one.suggestionIds[0]),
    waitFn: (client) => confirm(client, userId, two.suggestionIds[0]),
  });
  const state = await inspect(userId, [one.requestId, two.requestId]);
  report('overlapping proposals', { held: held.status, waited: waited.status });

  assert.equal(held.status, 'accepted');
  assert.equal(waited.status, 'stale', 'a slot taken by a concurrent booking is stale');
  assert.deepEqual(state.eventIds, [held.eventId], 'the user is never double-booked');
  assert.equal(state.requests[0].status, 'accepted');
  assert.notEqual(state.requests[1].status, 'accepted');
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
    // ai-confirm-time calls the function with the service role; the admin
    // session only sets up fixtures, deletes accounts, and inspects.
    for (const client of [first, second]) await client.query('set role service_role');
    process.stdout.write(`Three database sessions connected to local port ${port}.\n`);

    await doubleTapCreatesOneEvent();
    await waiterBooksAfterHolderRollsBack();
    await twoSlotsOfOneProposalBookOnce();
    await overlappingProposalsNeverDoubleBook();
    process.stdout.write('All Find Time confirmation race scenarios passed.\n');
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
  process.stderr.write(`${error instanceof Error ? error.message : 'Local race test failed.'}\n`);
  process.exitCode = 1;
});
