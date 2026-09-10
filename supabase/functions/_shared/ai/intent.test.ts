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

Deno.test('validateAiSchedulingIntent: fails closed on impossible calendar dates', () => {
  // February 30th
  assertThrows(
    () => {
      validateAiSchedulingIntent({
        title: 'Meeting',
        duration: null,
        date: {
          type: 'explicit_date',
          date: '2026-02-30',
          weekday: null,
          modifier: null,
          preference: null,
        },
        time: { type: 'unconstrained' },
        location: null,
        description: null,
        requiresClarification: false,
        clarificationQuestion: null,
      });
    },
    EdgeError,
    'Explicit date intent requires a valid calendar date',
  );

  // April 31st
  assertThrows(
    () => {
      validateAiSchedulingIntent({
        title: 'Meeting',
        duration: null,
        date: {
          type: 'explicit_date',
          date: '2026-04-31',
          weekday: null,
          modifier: null,
          preference: null,
        },
        time: { type: 'unconstrained' },
        location: null,
        description: null,
        requiresClarification: false,
        clarificationQuestion: null,
      });
    },
    EdgeError,
    'Explicit date intent requires a valid calendar date',
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
