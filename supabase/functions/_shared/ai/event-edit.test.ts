import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@^1.0.0';
import type { EventEditIntent } from '@cal/schemas/scheduling';

import { EdgeError } from '../errors/index.ts';
import { generateAiEventEditProposal } from './event-edit.ts';
import { type AiEventEditIntentProvider, validateAiEventEditIntent } from './event-edit-intent.ts';
import type { EditableEvent, EventEditDataSource } from './event-edit-repository.ts';
import type { AiRequestUpdate, AiScheduleRepository } from './proposal-repository.ts';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const REQUEST_ID = '44444444-4444-4444-4444-444444444444';
// Thursday 24 September 2026, 9:00 in New York.
const NOW = new Date('2026-09-24T13:00:00.000Z');
const TZ = 'America/New_York';

const VERMONT: EditableEvent = {
  id: '55555555-5555-5555-5555-555555555555',
  title: 'Weekend in Vermont',
  startAt: '2026-09-25T04:00:00.000Z',
  endAt: '2026-09-28T04:00:00.000Z',
  allDay: true,
  timezone: TZ,
  calendarName: 'Personal',
};
const DENTIST_FRIDAY: EditableEvent = {
  id: '66666666-6666-6666-6666-666666666666',
  title: 'Dentist',
  startAt: '2026-09-25T14:00:00.000Z',
  endAt: '2026-09-25T15:00:00.000Z',
  allDay: false,
  timezone: TZ,
  calendarName: 'Personal',
};
const DENTIST_MONDAY: EditableEvent = {
  ...DENTIST_FRIDAY,
  id: '77777777-7777-7777-7777-777777777777',
  startAt: '2026-09-28T14:00:00.000Z',
  endAt: '2026-09-28T15:00:00.000Z',
};

const SATURDAY = {
  type: 'weekday',
  weekday: 'saturday',
  modifier: 'this',
} as const;

function intent(overrides: Partial<EventEditIntent> = {}): EventEditIntent {
  return {
    eventQuery: 'weekend in Vermont',
    currentDate: null,
    newDate: SATURDAY,
    newTime: null,
    requiresClarification: false,
    clarificationQuestion: null,
    ...overrides,
  };
}

function harness(options: {
  intent?: EventEditIntent;
  events?: EditableEvent[];
  rateLimited?: boolean;
}) {
  const updates: AiRequestUpdate[] = [];
  let intentCalls = 0;
  let searchedWords: readonly string[] = [];

  const repository: AiScheduleRepository = {
    claimRatedRequest: () => Promise.resolve(options.rateLimited ? null : REQUEST_ID),
    updateRequest: (_userId, _requestId, patch) => {
      updates.push(patch);
      return Promise.resolve();
    },
    insertSuggestions: () => Promise.reject(new Error('edits never persist suggestions')),
  };
  const dataSource: EventEditDataSource = {
    loadTimezone: () => Promise.resolve(TZ),
    findCandidateEvents: (_userId, words) => {
      searchedWords = words;
      return Promise.resolve(options.events ?? [VERMONT, DENTIST_FRIDAY, DENTIST_MONDAY]);
    },
  };
  const provider: AiEventEditIntentProvider = {
    provider: 'test',
    model: 'test-model',
    parseEventEditIntent: () => {
      intentCalls += 1;
      return Promise.resolve({
        intent: options.intent ?? intent(),
        metadata: {
          provider: 'test',
          model: 'test-model',
          responseId: null,
          promptVersion: 'event-edit-intent-v1',
          latencyMs: 5,
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            reasoningTokens: 0,
            totalTokens: 2,
          },
        },
      });
    },
  };

  return {
    run: (text = 'Change my weekend in Vermont Friday to Saturday') =>
      generateAiEventEditProposal(
        { userId: USER_ID, text },
        {
          dataSource,
          repository,
          createIntentProvider: () => provider,
          clock: () => NOW,
        },
      ),
    updates,
    intentCalls: () => intentCalls,
    searchedWords: () => searchedWords,
  };
}

Deno.test('proposes shifting a multi-day all-day event whole', async () => {
  const h = harness({
    intent: intent({
      currentDate: { type: 'weekday', weekday: 'friday', modifier: 'this' },
    }),
  });
  const result = await h.run();

  assertEquals(result, {
    status: 'proposed',
    requestId: REQUEST_ID,
    options: [
      {
        eventId: VERMONT.id,
        title: 'Weekend in Vermont',
        calendarName: 'Personal',
        allDay: true,
        before: { startAt: VERMONT.startAt, endAt: VERMONT.endAt },
        after: {
          startAt: '2026-09-26T04:00:00.000Z',
          endAt: '2026-09-29T04:00:00.000Z',
        },
      },
    ],
  });
  assertEquals(h.searchedWords(), ['weekend', 'vermont']);
  const last = h.updates.at(-1);
  assertEquals(last?.status, 'proposed');
  assertEquals(last?.requestKind, 'move_event');
  assertEquals(last?.rawText, null);
  assertEquals(last?.candidateCount, 1);
});

Deno.test('narrows same-titled events to the current day the user named', async () => {
  const h = harness({
    intent: intent({
      eventQuery: 'dentist',
      currentDate: { type: 'weekday', weekday: 'friday', modifier: 'this' },
      newDate: null,
      newTime: { type: 'exact_time', hour: 16, minute: 0 },
    }),
  });
  const result = await h.run('Move my Friday dentist to 4pm');

  assertEquals(result.status, 'proposed');
  if (result.status !== 'proposed') return;
  assertEquals(
    result.options.map((option) => option.eventId),
    [DENTIST_FRIDAY.id],
  );
  assertEquals(result.options[0]?.after, {
    startAt: '2026-09-25T20:00:00.000Z',
    endAt: '2026-09-25T21:00:00.000Z',
  });
});

Deno.test('offers every match when the phrase is ambiguous', async () => {
  const h = harness({
    intent: intent({
      eventQuery: 'dentist',
      newDate: null,
      newTime: { type: 'exact_time', hour: 16, minute: 0 },
    }),
  });
  const result = await h.run('Move the dentist to 4pm');

  assertEquals(result.status, 'proposed');
  if (result.status !== 'proposed') return;
  assertEquals(
    result.options.map((option) => option.eventId),
    [DENTIST_FRIDAY.id, DENTIST_MONDAY.id],
  );
});

Deno.test('asks rather than guesses when the new day is a span', async () => {
  const h = harness({
    intent: intent({
      newDate: { type: 'relative_week', modifier: 'next', preference: 'any' },
    }),
  });
  const result = await h.run('Move Vermont to next week');

  assertEquals(result, {
    status: 'clarification_required',
    requestId: REQUEST_ID,
    clarificationQuestion: 'Which day should “Weekend in Vermont” move to?',
  });
  assertEquals(h.updates.at(-1)?.errorCode, 'AI_CLARIFICATION_REQUIRED');
});

Deno.test('passes the model’s own clarification through', async () => {
  const h = harness({
    intent: intent({
      requiresClarification: true,
      clarificationQuestion: 'Which event?',
    }),
  });
  const result = await h.run('Move it');

  assertEquals(result, {
    status: 'clarification_required',
    requestId: REQUEST_ID,
    clarificationQuestion: 'Which event?',
  });
});

Deno.test('reports no match and records the failure', async () => {
  const h = harness({ intent: intent({ eventQuery: 'yoga class' }) });
  const error = await assertRejects(() => h.run('Move yoga class to Saturday'), EdgeError);

  assertEquals(error.code, 'AI_EVENT_NOT_FOUND');
  assertEquals(h.updates.at(-1)?.status, 'failed');
  assertEquals(h.updates.at(-1)?.errorCode, 'AI_EVENT_NOT_FOUND');
  assertEquals(h.updates.at(-1)?.requestKind, 'move_event');
});

Deno.test('does not call the model once the hourly limit is used', async () => {
  const h = harness({ rateLimited: true });
  const error = await assertRejects(() => h.run(), EdgeError);

  assertEquals(error.code, 'AI_RATE_LIMITED');
  assertEquals(h.intentCalls(), 0);
});

Deno.test('validates the model output, converting strict-mode nulls', () => {
  const parsed = validateAiEventEditIntent({
    eventQuery: ' weekend in Vermont ',
    currentDate: {
      type: 'weekday',
      weekday: 'friday',
      modifier: 'this',
      preference: null,
      date: null,
    },
    newDate: {
      type: 'weekday',
      weekday: 'saturday',
      modifier: 'this',
      preference: null,
      date: null,
    },
    newTime: null,
    requiresClarification: false,
    clarificationQuestion: null,
  });

  assertEquals(parsed.eventQuery, 'weekend in Vermont');
  assertEquals(parsed.newDate, SATURDAY);
  assertEquals(parsed.newTime, null);
});

Deno.test('rejects model output with extra or missing fields', () => {
  const base = {
    eventQuery: 'dentist',
    currentDate: null,
    newDate: null,
    newTime: null,
    requiresClarification: false,
    clarificationQuestion: null,
  };
  const extra = assertThrows(
    () => validateAiEventEditIntent({ ...base, startAt: 'now' }),
    EdgeError,
  );
  assertEquals(extra.code, 'AI_INVALID_OUTPUT');

  const { eventQuery: _dropped, ...missing } = base;
  const absent = assertThrows(() => validateAiEventEditIntent(missing), EdgeError);
  assertEquals(absent.code, 'AI_INVALID_OUTPUT');
});
