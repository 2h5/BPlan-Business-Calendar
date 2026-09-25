import { assertEquals, assertRejects } from 'jsr:@std/assert@^1.0.0';
import type {
  AiRankCandidateSlotsInput,
  SchedulingIntent,
  WorkingHours,
} from '@cal/schemas/scheduling';

import { EdgeError } from '../errors/index.ts';
import type { FindTimeDataSource } from './find-time.ts';
import type { AiIntentProvider } from './intent.ts';
import { generateAiFindTimeProposal, type AiFindTimeProposalResult } from './proposal.ts';
import type { AiRequestUpdate } from './proposal-repository.ts';
import type { SchedulingCalendarEvent } from '@cal/domain/scheduling';

// Monday 2026-08-31 08:00 in New York; "tomorrow" is Tuesday 2026-09-01.
const NOW = new Date('2026-08-31T12:00:00.000Z');
const ZONE = 'America/New_York';
const TUESDAY = 2;

function weekdays(startHour: number, endHour: number): WorkingHours {
  return [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startMinute: startHour * 60,
    endMinute: endHour * 60,
  }));
}

function intent(overrides: Partial<SchedulingIntent>): SchedulingIntent {
  return {
    title: 'Dinner with Andrew',
    duration: null,
    date: { type: 'tomorrow' },
    time: { type: 'unconstrained' },
    occasion: null,
    location: null,
    description: null,
    requiresClarification: false,
    clarificationQuestion: null,
    ...overrides,
  };
}

interface Run {
  result: AiFindTimeProposalResult;
  /** Every candidate the ranker was shown, or null if it was never called. */
  ranked: AiRankCandidateSlotsInput['candidates'] | null;
  updates: AiRequestUpdate[];
}

async function run(
  parsed: SchedulingIntent,
  workingHours: WorkingHours,
  events: SchedulingCalendarEvent[] = [],
): Promise<Run> {
  let ranked: Run['ranked'] = null;
  const updates: AiRequestUpdate[] = [];

  const dataSource: FindTimeDataSource = {
    loadTask: () => Promise.resolve(null),
    loadProfile: () =>
      Promise.resolve({ timezone: ZONE, workingHours, updatedAt: '2026-08-31T10:00:00.000Z' }),
    loadTargetCalendar: () =>
      Promise.resolve({
        id: '33333333-3333-3333-3333-333333333333',
        name: 'Personal',
        sourceType: 'internal' as const,
        isDefault: true,
        isReadOnly: false,
        updatedAt: '2026-08-31T10:30:00.000Z',
      }),
    loadEvents: () => Promise.resolve(events),
  };

  const intentProvider: AiIntentProvider = {
    provider: 'fixture',
    model: 'fixture-intent',
    parseSchedulingIntent: () =>
      Promise.resolve({
        intent: parsed,
        metadata: {
          provider: 'fixture',
          model: 'fixture-intent',
          responseId: null,
          promptVersion: 'find-time-intent-v2',
          latencyMs: 1,
          usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0, totalTokens: 2 },
        },
      }),
  };

  const result = await generateAiFindTimeProposal(
    { userId: '11111111-1111-1111-1111-111111111111', request: { text: 'fixture' }, now: NOW },
    {
      dataSource,
      repository: {
        claimRatedRequest: () => Promise.resolve('44444444-4444-4444-4444-444444444444'),
        updateRequest: (_userId, _requestId, patch) => {
          updates.push({ ...patch });
          return Promise.resolve();
        },
        insertSuggestions: (_requestId, rows) =>
          Promise.resolve(rows.map((row, index) => ({ ...row, id: `suggestion_${index}` }))),
      },
      createIntentProvider: () => intentProvider,
      createProvider: () => ({
        provider: 'fixture',
        model: 'fixture-ranker',
        rankCandidateSlots: (input) => {
          ranked = input.candidates;
          const first = input.candidates[0];
          if (!first) throw new Error('Ranker called without candidates.');
          return Promise.resolve({
            proposal: {
              suggestions: [{ slotId: first.id, rank: 1, score: 1, reason: 'Fixture.' }],
            },
            metadata: {
              provider: 'fixture',
              model: 'fixture-ranker',
              responseId: null,
              promptVersion: 'find-time-ranker-v1',
              latencyMs: 1,
              usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0, totalTokens: 2 },
            },
          });
        },
      }),
      candidateIdFactory: (index) => `candidate_${index + 1}`,
      clock: () => NOW,
    },
  );

  return { result, ranked, updates };
}

function localStarts(ranked: Run['ranked']): number[] {
  if (!ranked) throw new Error('Expected the ranker to be called.');
  return ranked.map((candidate) => candidate.localStartMinute);
}

function localEnds(ranked: Run['ranked']): number[] {
  if (!ranked) throw new Error('Expected the ranker to be called.');
  return ranked.map((candidate) => candidate.localEndMinute);
}

const at = (hour: number, minute = 0) => hour * 60 + minute;

Deno.test('dinner with 9-5 hours never offers a 2-4 PM slot and asks instead', async () => {
  const { result, ranked, updates } = await run(intent({ occasion: 'dinner' }), weekdays(9, 17));

  assertEquals(ranked, null);
  assertEquals(result.status, 'clarification_required');
  if (result.status !== 'clarification_required') throw new Error('Expected clarification.');
  assertEquals(
    result.clarificationQuestion,
    'Dinner usually falls between 5:00 PM and 9:30 PM, which is outside your scheduling hours. ' +
      'Name a specific day and time, or adjust your scheduling hours.',
  );

  const failed = updates.find((update) => update.errorCode === 'AI_CLARIFICATION_REQUIRED');
  assertEquals(failed?.status, 'failed');
  assertEquals(failed?.candidateCount, 0);
  // The 9-5 boundary was not silently widened to the personal day.
  const tuesdayHours = failed?.constraints?.workingHours.filter((w) => w.weekday === TUESDAY);
  assertEquals(tuesdayHours, [{ weekday: TUESDAY, startMinute: at(9), endMinute: at(17) }]);
});

Deno.test('dinner with evening-inclusive hours searches only the dinner part of them', async () => {
  const { result, ranked, updates } = await run(intent({ occasion: 'dinner' }), weekdays(9, 20));

  assertEquals(result.status, 'proposed');
  const starts = localStarts(ranked);
  assertEquals(starts[0], at(17));
  assertEquals(Math.max(...localEnds(ranked)), at(20));
  assertEquals(
    starts.every((start) => start >= at(17)),
    true,
  );

  // The snapshot revalidated at confirmation carries the same hard bounds.
  const pending = updates.find((update) => update.constraints !== undefined);
  assertEquals(pending?.constraints?.earliestMinute, at(17));
  assertEquals(pending?.constraints?.latestMinute, at(21, 30));
});

Deno.test('lunch with 9-5 hours searches the lunch portion inside those hours', async () => {
  const { ranked } = await run(intent({ occasion: 'lunch' }), weekdays(9, 17));

  const starts = localStarts(ranked);
  assertEquals(Math.min(...starts), at(11, 30));
  assertEquals(Math.max(...localEnds(ranked)), at(14));
});

Deno.test('breakfast with morning-inclusive hours searches only breakfast time', async () => {
  const { ranked } = await run(intent({ occasion: 'breakfast' }), weekdays(7, 15));

  assertEquals(Math.min(...localStarts(ranked)), at(7));
  assertEquals(Math.max(...localEnds(ranked)), at(10, 30));
});

Deno.test('a partially overlapping window keeps only the overlap', async () => {
  // Breakfast is 7:00-10:30; hours start at 9:00, so only 9:00-10:30 remains.
  const { ranked } = await run(intent({ occasion: 'breakfast' }), weekdays(9, 17));

  assertEquals(Math.min(...localStarts(ranked)), at(9));
  assertEquals(Math.max(...localEnds(ranked)), at(10, 30));
});

Deno.test('an explicit clock time beats the occasion: dinner at 3 PM means 3 PM', async () => {
  const { ranked } = await run(
    intent({ occasion: 'dinner', time: { type: 'exact_time', hour: 15, minute: 0 } }),
    weekdays(9, 17),
  );

  assertEquals(localStarts(ranked), [at(15)]);
});

Deno.test('an explicit clock time beats the occasion: breakfast meeting at 1 PM', async () => {
  const { ranked } = await run(
    intent({
      title: 'Breakfast meeting',
      occasion: 'breakfast',
      time: { type: 'exact_time', hour: 13, minute: 0 },
    }),
    weekdays(9, 17),
  );

  assertEquals(localStarts(ranked), [at(13)]);
});

Deno.test(
  'an explicit out-of-hours time keeps the existing named-day contract, not the occasion window',
  async () => {
    // "dinner tomorrow at 7 PM" with 9-5 hours: the existing rule opens a named
    // day to the personal band for an explicit hour, and the occasion adds nothing.
    const { ranked } = await run(
      intent({ occasion: 'dinner', time: { type: 'exact_time', hour: 19, minute: 0 } }),
      weekdays(9, 17),
    );

    assertEquals(localStarts(ranked), [at(19)]);
  },
);

Deno.test('dinner "around 7" keeps the dinner window as a hard bound', async () => {
  const { ranked } = await run(
    intent({ occasion: 'dinner', time: { type: 'around_time', hour: 19, minute: 0 } }),
    weekdays(9, 22),
  );

  assertEquals(Math.min(...localStarts(ranked)), at(17));
  assertEquals(Math.max(...localEnds(ranked)), at(21, 30));
});

Deno.test('a named time of day is a hard window: tomorrow morning with 9-5 hours', async () => {
  const { ranked } = await run(
    intent({ title: 'Planning', time: { type: 'time_of_day', preference: 'morning' } }),
    weekdays(9, 17),
  );

  assertEquals(Math.min(...localStarts(ranked)), at(9));
  assertEquals(Math.max(...localEnds(ranked)), at(12));
});

Deno.test('a named time of day with no overlap asks instead of offering daytime', async () => {
  const { result, ranked } = await run(
    intent({ title: 'Planning', time: { type: 'time_of_day', preference: 'evening' } }),
    weekdays(9, 17),
  );

  assertEquals(ranked, null);
  assertEquals(result.status, 'clarification_required');
});

Deno.test('drinks tonight intersects the occasion with the evening', async () => {
  const { ranked } = await run(
    intent({
      title: 'Drinks with Sam',
      date: { type: 'today' },
      occasion: 'drinks',
      time: { type: 'time_of_day', preference: 'evening' },
    }),
    weekdays(9, 23),
  );

  assertEquals(Math.min(...localStarts(ranked)), at(17));
  assertEquals(Math.max(...localEnds(ranked)), at(22));
});

Deno.test('contradictory named parts of the day are asked about, never guessed', async () => {
  const { result, ranked } = await run(
    intent({ occasion: 'breakfast', time: { type: 'time_of_day', preference: 'evening' } }),
    weekdays(7, 22),
  );

  assertEquals(ranked, null);
  assertEquals(result.status, 'clarification_required');
  if (result.status !== 'clarification_required') throw new Error('Expected clarification.');
  assertEquals(
    result.clarificationQuestion,
    "Breakfast (evening) doesn't fit that part of the day. What time would you like?",
  );
});

Deno.test('a fully booked dinner window stays an ordinary no-slot result', async () => {
  const error = await assertRejects(
    () =>
      run(intent({ occasion: 'dinner' }), weekdays(9, 22), [
        {
          calendarId: '33333333-3333-3333-3333-333333333333',
          // Tuesday 16:00-22:00 New York.
          startAt: '2026-09-01T20:00:00.000Z',
          endAt: '2026-09-02T02:00:00.000Z',
          timezone: ZONE,
          status: 'confirmed',
          recurrenceRule: null,
          sourceType: 'internal',
          providerEventId: null,
          recurringEventId: null,
          recurrenceOriginalStartAt: null,
        },
      ]),
    EdgeError,
  );

  assertEquals(error.code, 'AI_NO_VALID_SLOT');
});
