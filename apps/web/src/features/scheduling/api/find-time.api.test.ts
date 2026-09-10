import { describe, expect, it, vi } from 'vitest';

// Pure schema contract tests. Isolate supabase client to prevent env validation error in CI.
vi.mock('../../../lib/supabase/client', () => ({ supabase: {} }));

import { clarificationSchema, readbackSchema } from './find-time.api';

describe('Find Time API contracts', () => {
  it('parses valid clarification responses', () => {
    const parsed = clarificationSchema.parse({
      status: 'clarification_required',
      requestId: 'req-12345',
      clarificationQuestion: 'What time on Friday do you prefer?',
      intent: {
        title: 'catchup',
        duration: null,
        date: { type: 'unconstrained' },
        time: { type: 'unconstrained' },
        location: null,
        description: null,
        requiresClarification: true,
        clarificationQuestion: 'What time on Friday do you prefer?',
      },
    });

    expect(parsed.status).toBe('clarification_required');
    expect(parsed.clarificationQuestion).toBe('What time on Friday do you prefer?');
  });

  it('parses structured readback metadata', () => {
    const parsed = readbackSchema.parse({
      title: 'meeting with Andrew',
      durationMinutes: 15,
      durationLabel: '15 min',
      dateLabel: 'Friday',
      timeLabel: 'After 4:00 PM',
      location: 'Paramus office',
    });

    expect(parsed.title).toBe('meeting with Andrew');
    expect(parsed.durationMinutes).toBe(15);
    expect(parsed.durationLabel).toBe('15 min');
    expect(parsed.location).toBe('Paramus office');
  });

  it('rejects malformed clarification without question', () => {
    expect(() =>
      clarificationSchema.parse({
        status: 'clarification_required',
        requestId: 'req-12345',
        clarificationQuestion: '',
      }),
    ).toThrow();
  });
});
