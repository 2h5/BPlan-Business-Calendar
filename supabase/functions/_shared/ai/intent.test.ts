import { assertEquals, assertThrows } from 'jsr:@std/assert@^1.0.0';

import { EdgeError } from '../errors/index.ts';
import { validateAiSchedulingIntent } from './intent.ts';

Deno.test('validateAiSchedulingIntent: parses valid structured intent', () => {
  const parsed = validateAiSchedulingIntent({
    title: 'Meeting with Andrew',
    duration: { type: 'exact', minutes: 15 },
    date: { type: 'weekday', weekday: 'friday', modifier: 'this', preference: null, date: null },
    time: {
      type: 'after_time',
      hour: 16,
      minute: 0,
      startHour: null,
      startMinute: null,
      endHour: null,
      endMinute: null,
      preference: null,
    },
    occasion: null,
    location: 'Paramus office',
    description: null,
    requiresClarification: false,
    clarificationQuestion: null,
  });

  assertEquals(parsed.title, 'Meeting with Andrew');
  assertEquals(parsed.duration, { type: 'exact', minutes: 15 });
  assertEquals(parsed.date, { type: 'weekday', weekday: 'friday', modifier: 'this' });
  assertEquals(parsed.time, { type: 'after_time', hour: 16, minute: 0 });
  assertEquals(parsed.location, 'Paramus office');
});

Deno.test('validateAiSchedulingIntent: fails closed on malformed weekday date intent', () => {
  assertThrows(
    () => {
      validateAiSchedulingIntent({
        title: 'Meeting',
        duration: null,
        date: { type: 'weekday', weekday: null, modifier: 'this', preference: null, date: null },
        time: { type: 'unconstrained' },
        occasion: null,
        location: null,
        description: null,
        requiresClarification: false,
        clarificationQuestion: null,
      });
    },
    EdgeError,
    'Weekday date intent requires a valid weekday name',
  );
});

Deno.test('validateAiSchedulingIntent: fails closed on malformed exact_time intent', () => {
  assertThrows(
    () => {
      validateAiSchedulingIntent({
        title: 'Meeting',
        duration: null,
        date: { type: 'unconstrained' },
        time: {
          type: 'exact_time',
          hour: null,
          minute: null,
          startHour: null,
          startMinute: null,
          endHour: null,
          endMinute: null,
          preference: null,
        },
        occasion: null,
        location: null,
        description: null,
        requiresClarification: false,
        clarificationQuestion: null,
      });
    },
    EdgeError,
    'Exact time requires valid hour',
  );
});

Deno.test('validateAiSchedulingIntent: fails closed on malformed duration exact intent', () => {
  assertThrows(
    () => {
      validateAiSchedulingIntent({
        title: 'Meeting',
        duration: { type: 'exact', minutes: null, minMinutes: null, maxMinutes: null },
        date: { type: 'unconstrained' },
        time: { type: 'unconstrained' },
        occasion: null,
        location: null,
        description: null,
        requiresClarification: false,
        clarificationQuestion: null,
      });
    },
    EdgeError,
    'Exact duration requires valid minutes',
  );
});

Deno.test('validateAiSchedulingIntent: fails closed on invalid duration range', () => {
  assertThrows(
    () => {
      validateAiSchedulingIntent({
        title: 'Meeting',
        duration: { type: 'range', minutes: null, minMinutes: 60, maxMinutes: 30 },
        date: { type: 'unconstrained' },
        time: { type: 'unconstrained' },
        occasion: null,
        location: null,
        description: null,
        requiresClarification: false,
        clarificationQuestion: null,
      });
    },
    EdgeError,
    'Duration range requires valid minMinutes and maxMinutes (max > min)',
  );
});

function intentWithDate(
  date: Record<string, unknown>,
  clarification: { requiresClarification: boolean; clarificationQuestion: string | null } = {
    requiresClarification: false,
    clarificationQuestion: null,
  },
) {
  return {
    title: 'Meeting with Andrew',
    duration: null,
    date: { weekday: null, modifier: null, preference: null, ...date },
    time: { type: 'unconstrained' },
    occasion: null,
    location: null,
    description: null,
    ...clarification,
  };
}

Deno.test('validateAiSchedulingIntent: turns impossible calendar dates into clarification', () => {
  for (const date of [
    { type: 'explicit_date', date: '2026-02-30' },
    { type: 'explicit_date', date: '2026-04-31' },
    { type: 'week_of', date: '2026-02-30' },
  ]) {
    const parsed = validateAiSchedulingIntent(intentWithDate(date));
    assertEquals(parsed.requiresClarification, true);
    assertEquals(parsed.date, { type: 'unconstrained' });
    assertEquals(parsed.clarificationQuestion, "That date doesn't exist. Which date did you mean?");
  }

  // A clarification question the model already wrote is kept.
  const asked = validateAiSchedulingIntent(
    intentWithDate(
      { type: 'explicit_date', date: '2026-02-30' },
      {
        requiresClarification: true,
        clarificationQuestion: 'February has no 30th. Did you mean March 2?',
      },
    ),
  );
  assertEquals(asked.clarificationQuestion, 'February has no 30th. Did you mean March 2?');
});

Deno.test('validateAiSchedulingIntent: still fails closed on malformed date strings', () => {
  for (const date of [
    { type: 'explicit_date', date: null },
    { type: 'explicit_date', date: 'February 30' },
  ]) {
    assertThrows(() => validateAiSchedulingIntent(intentWithDate(date)), EdgeError);
  }
});

Deno.test('validateAiSchedulingIntent: an hour-only time resolves to minute zero', () => {
  const nullTime = {
    hour: null,
    minute: null,
    startHour: null,
    startMinute: null,
    endHour: null,
    endMinute: null,
    preference: null,
  };
  const parse = (time: Record<string, unknown>) =>
    validateAiSchedulingIntent({
      ...intentWithDate({ type: 'unconstrained' }),
      time: { ...nullTime, ...time },
    }).time;

  assertEquals(parse({ type: 'after_time', hour: 16 }), {
    type: 'after_time',
    hour: 16,
    minute: 0,
  });
  assertEquals(parse({ type: 'before_time', hour: 12 }), {
    type: 'before_time',
    hour: 12,
    minute: 0,
  });
  assertEquals(parse({ type: 'exact_time', hour: 15 }), {
    type: 'exact_time',
    hour: 15,
    minute: 0,
  });
  assertEquals(parse({ type: 'around_time', hour: 14 }), {
    type: 'around_time',
    hour: 14,
    minute: 0,
  });
  assertEquals(parse({ type: 'between_times', startHour: 13, endHour: 15, endMinute: 30 }), {
    type: 'between_times',
    startHour: 13,
    startMinute: 0,
    endHour: 15,
    endMinute: 30,
  });
  // An explicit minute is never overwritten, and a missing hour still fails closed.
  assertEquals(parse({ type: 'after_time', hour: 16, minute: 30 }), {
    type: 'after_time',
    hour: 16,
    minute: 30,
  });
  assertThrows(
    () => parse({ type: 'after_time', hour: null, minute: 0 }),
    EdgeError,
    'After time requires',
  );
});

Deno.test(
  'validateAiSchedulingIntent: fails closed when clarification is required without question',
  () => {
    assertThrows(
      () => {
        validateAiSchedulingIntent({
          title: 'Meeting',
          duration: null,
          date: { type: 'unconstrained' },
          time: { type: 'unconstrained' },
          occasion: null,
          location: null,
          description: null,
          requiresClarification: true,
          clarificationQuestion: '',
        });
      },
      EdgeError,
      'A non-empty clarification question is required',
    );
  },
);

Deno.test('validateAiSchedulingIntent: parses relative_week and weekend with preferences', () => {
  const parsedWeek = validateAiSchedulingIntent({
    title: 'Quarterly review',
    duration: null,
    date: {
      type: 'relative_week',
      modifier: 'next',
      preference: 'late',
      weekday: null,
      date: null,
    },
    time: { type: 'unconstrained' },
    occasion: null,
    location: null,
    description: null,
    requiresClarification: false,
    clarificationQuestion: null,
  });

  assertEquals(parsedWeek.date, {
    type: 'relative_week',
    modifier: 'next',
    preference: 'late',
  });

  const parsedWeekend = validateAiSchedulingIntent({
    title: 'Hike',
    duration: null,
    date: {
      type: 'weekend',
      modifier: 'this',
      preference: 'late',
      weekday: null,
      date: null,
    },
    time: { type: 'unconstrained' },
    occasion: null,
    location: null,
    description: null,
    requiresClarification: false,
    clarificationQuestion: null,
  });

  assertEquals(parsedWeekend.date, {
    type: 'weekend',
    modifier: 'this',
    preference: 'late',
  });
});

Deno.test(
  'validateAiSchedulingIntent: rejects schema-invalid fields instead of dropping them',
  () => {
    const valid = () => ({
      title: 'Meeting',
      duration: null,
      date: { type: 'unconstrained' },
      time: { type: 'unconstrained' },
      occasion: null,
      location: null,
      description: null,
      requiresClarification: false,
      clarificationQuestion: null,
    });

    const missingDuration: Record<string, unknown> = valid();
    delete missingDuration.duration;

    const invalidValues: unknown[] = [
      { ...valid(), requestId: 'not-a-request-field' },
      { ...valid(), duration: undefined },
      missingDuration,
      { ...valid(), requiresClarification: 'false' },
      { ...valid(), location: 123 },
      { ...valid(), date: { type: 'unconstrained', date: '2026-03-08T07:30:00Z' } },
      { ...valid(), time: { type: 'unconstrained', hour: 24 } },
      {
        ...valid(),
        date: { type: 'weekday', weekday: 'friday', modifier: 'later' },
      },
    ];

    for (const value of invalidValues) {
      const error = assertThrows(() => validateAiSchedulingIntent(value), EdgeError);
      assertEquals(error.code, 'AI_INVALID_OUTPUT');
    }
  },
);

Deno.test('validateAiSchedulingIntent: accepts a named occasion alongside an explicit time', () => {
  const parsed = validateAiSchedulingIntent({
    title: 'Dinner with Andrew',
    duration: null,
    date: { type: 'tomorrow', weekday: null, modifier: null, preference: null, date: null },
    time: {
      type: 'exact_time',
      hour: 15,
      minute: 0,
      startHour: null,
      startMinute: null,
      endHour: null,
      endMinute: null,
      preference: null,
    },
    occasion: 'dinner',
    location: null,
    description: null,
    requiresClarification: false,
    clarificationQuestion: null,
  });

  assertEquals(parsed.occasion, 'dinner');
  // The explicit time is kept exactly; the occasion never rewrites it.
  assertEquals(parsed.time, { type: 'exact_time', hour: 15, minute: 0 });
});

Deno.test('validateAiSchedulingIntent: fails closed on a missing or unknown occasion', () => {
  const valid = () => ({
    title: 'Coffee',
    duration: null,
    date: { type: 'unconstrained' },
    time: { type: 'unconstrained' },
    occasion: null as unknown,
    location: null,
    description: null,
    requiresClarification: false,
    clarificationQuestion: null,
  });

  const missing: Record<string, unknown> = valid();
  delete missing.occasion;

  for (const value of [missing, { ...valid(), occasion: 'coffee' }, { ...valid(), occasion: 1 }]) {
    const error = assertThrows(() => validateAiSchedulingIntent(value), EdgeError);
    assertEquals(error.code, 'AI_INVALID_OUTPUT');
  }
});
