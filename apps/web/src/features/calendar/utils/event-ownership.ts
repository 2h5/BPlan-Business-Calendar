import type { Calendar } from '@cal/schemas';

export type EventWriteRoute = 'internal' | 'provider' | 'read-only';

/** Resolve the authoritative write path before a mutation starts. */
export function eventWriteRoute(calendar: Calendar): EventWriteRoute {
  if (calendar.isReadOnly) return 'read-only';
  return calendar.sourceType === 'internal' ? 'internal' : 'provider';
}

export function assertSupportedCalendarMove(current: Calendar, target: Calendar): void {
  if (eventWriteRoute(current) === 'read-only' || eventWriteRoute(target) === 'read-only') {
    throw new Error('Read-only calendars cannot be changed.');
  }
  if (current.sourceType !== target.sourceType) {
    throw new Error('Moving events between BPlan and provider calendars is not supported.');
  }
  if (current.sourceType !== 'internal' && current.id !== target.id) {
    throw new Error('Synced events cannot be moved to another calendar here.');
  }
}
