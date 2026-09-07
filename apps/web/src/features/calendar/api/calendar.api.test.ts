import { createCalendarSchema, createEventSchema } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import { calendarRowSchema, eventRowSchema } from './calendar-mappers';

describe('calendar API contracts', () => {
  it('maps calendar ownership and read-only flags at the API boundary', () => {
    const calendar = calendarRowSchema.parse({
      id: 'b0000000-0000-0000-0000-000000000001',
      user_id: '11111111-1111-1111-1111-111111111111',
      name: 'Google work',
      color: '#4285F4',
      source_type: 'google',
      provider_account_id: 'c0000000-0000-0000-0000-000000000001',
      provider_calendar_id: 'primary',
      is_visible: true,
      is_default: false,
      is_read_only: true,
      created_at: '2026-09-01T10:00:00.000Z',
      updated_at: '2026-09-01T10:00:00.000Z',
    });
    expect(calendar).toMatchObject({ sourceType: 'google', isReadOnly: true, isVisible: true });
  });

  it('maps recurrence exception identity without losing provider state', () => {
    const event = eventRowSchema.parse({
      id: 'a0000000-0000-0000-0000-000000000001',
      user_id: '11111111-1111-1111-1111-111111111111',
      calendar_id: 'b0000000-0000-0000-0000-000000000001',
      title: 'Moved occurrence',
      description: null,
      location: null,
      start_at: '2026-09-08T15:00:00.000Z',
      end_at: '2026-09-08T16:00:00.000Z',
      all_day: false,
      timezone: 'America/New_York',
      status: 'confirmed',
      recurrence_rule: null,
      alerts: [],
      source_type: 'microsoft',
      provider_event_id: 'provider-instance',
      provider_etag: 'etag',
      recurring_event_id: 'provider-series',
      recurrence_original_start_at: '2026-09-08T14:00:00.000Z',
      provider_updated_at: '2026-09-07T12:00:00.000Z',
      sync_status: 'conflict',
      created_at: '2026-09-01T10:00:00.000Z',
      updated_at: '2026-09-07T12:00:00.000Z',
    });
    expect(event).toMatchObject({
      recurringEventId: 'provider-series',
      recurrenceOriginalStartAt: '2026-09-08T14:00:00.000Z',
      syncStatus: 'conflict',
    });
  });

  it('validates create inputs before internal or provider mutations', () => {
    expect(() => createCalendarSchema.parse({ name: '', color: '#8AA4FF' })).toThrow();
    expect(() =>
      createEventSchema.parse({
        calendarId: 'b0000000-0000-0000-0000-000000000001',
        title: 'Invalid range',
        startAt: '2026-09-07T12:00:00.000Z',
        endAt: '2026-09-07T11:00:00.000Z',
        timezone: 'America/New_York',
      }),
    ).toThrow();
  });
});
