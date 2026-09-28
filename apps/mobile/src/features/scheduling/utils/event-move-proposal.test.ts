import type { CalendarEvent } from '@cal/schemas';
import { describe, expect, it, vi } from 'vitest';

import { applyMoveProposal, isMoveProposalCurrent } from './event-move-proposal';
import type { AiEventMoveOption } from '../api/event-edit.api';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';

const event: CalendarEvent = {
  id: EVENT_ID,
  userId: '22222222-2222-4222-8222-222222222222',
  calendarId: '33333333-3333-4333-8333-333333333333',
  title: 'Dentist',
  description: null,
  location: null,
  color: null,
  // Postgres spells UTC as +00:00; the proposal carries whatever the server read.
  startAt: '2026-10-01T15:00:00+00:00',
  endAt: '2026-10-01T16:00:00+00:00',
  allDay: false,
  timezone: 'America/New_York',
  status: 'confirmed',
  recurrenceRule: null,
  alerts: [],
  sourceType: 'google',
  providerEventId: 'provider-1',
  recurringEventId: null,
  recurrenceOriginalStartAt: null,
  providerEtag: null,
  providerUpdatedAt: null,
  syncStatus: 'synced',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const option: AiEventMoveOption = {
  eventId: EVENT_ID,
  title: 'Dentist',
  calendarName: 'Work',
  allDay: false,
  before: { startAt: '2026-10-01T15:00:00.000Z', endAt: '2026-10-01T16:00:00.000Z' },
  after: { startAt: '2026-10-02T15:00:00.000Z', endAt: '2026-10-02T16:00:00.000Z' },
};

describe('isMoveProposalCurrent', () => {
  it('accepts an event still exactly where the proposal found it', () => {
    expect(isMoveProposalCurrent(event, option)).toBe(true);
  });

  it.each<[string, Partial<CalendarEvent>]>([
    ['moved elsewhere since', { startAt: '2026-10-01T17:00:00Z', endAt: '2026-10-01T18:00:00Z' }],
    ['resized since', { endAt: '2026-10-01T16:30:00Z' }],
    ['already moved to the proposed time', { ...option.after }],
    ['cancelled since', { status: 'cancelled' }],
    ['made recurring since', { recurrenceRule: 'RRULE:FREQ=WEEKLY' }],
    ['now a recurring instance', { recurringEventId: 'series-1' }],
    ['switched to all-day', { allDay: true }],
    ['a different event', { id: '44444444-4444-4444-8444-444444444444' }],
  ])('rejects a proposal for an event %s', (_label, change) => {
    expect(isMoveProposalCurrent({ ...event, ...change }, option)).toBe(false);
  });
});

describe('applyMoveProposal', () => {
  it('moves the freshly loaded event to the proposed times', async () => {
    const moveEvent = vi.fn(async () => {});
    const loadEvent = vi.fn(async () => event);

    await expect(applyMoveProposal(option, { loadEvent, moveEvent })).resolves.toBe(option);
    expect(loadEvent).toHaveBeenCalledWith(EVENT_ID);
    expect(moveEvent).toHaveBeenCalledWith({ event, ...option.after });
  });

  it('refuses, writing nothing, when the event moved after the proposal', async () => {
    const moveEvent = vi.fn(async () => {});
    const moved = { ...event, startAt: '2026-10-01T18:00:00Z', endAt: '2026-10-01T19:00:00Z' };

    await expect(
      applyMoveProposal(option, { loadEvent: async () => moved, moveEvent }),
    ).rejects.toMatchObject({ code: 'AI_PROPOSAL_STALE' });
    expect(moveEvent).not.toHaveBeenCalled();
  });

  it('refuses, writing nothing, when the event was deleted', async () => {
    const moveEvent = vi.fn(async () => {});
    const loadEvent = async () => {
      throw { code: 'NOT_FOUND', message: 'That item no longer exists.' };
    };

    await expect(applyMoveProposal(option, { loadEvent, moveEvent })).rejects.toMatchObject({
      code: 'AI_PROPOSAL_STALE',
    });
    expect(moveEvent).not.toHaveBeenCalled();
  });

  it('passes other load failures through unchanged', async () => {
    const failure = { code: 'NETWORK_UNAVAILABLE', message: 'Offline' };
    const moveEvent = vi.fn(async () => {});

    await expect(
      applyMoveProposal(option, {
        loadEvent: async () => {
          throw failure;
        },
        moveEvent,
      }),
    ).rejects.toBe(failure);
    expect(moveEvent).not.toHaveBeenCalled();
  });
});
