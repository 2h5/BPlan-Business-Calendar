import type { Calendar } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import { assertSupportedCalendarMove, eventWriteRoute } from './event-ownership';

const base: Calendar = {
  id: 'a0000000-0000-0000-0000-000000000001',
  userId: '11111111-1111-1111-1111-111111111111',
  name: 'Calendar',
  color: '#8AA4FF',
  sourceType: 'internal',
  providerAccountId: null,
  providerCalendarId: null,
  isVisible: true,
  isDefault: false,
  isReadOnly: false,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

describe('event ownership routing', () => {
  it('routes internal and provider writes to their authorities', () => {
    expect(eventWriteRoute(base)).toBe('internal');
    expect(eventWriteRoute({ ...base, sourceType: 'google' })).toBe('provider');
    expect(eventWriteRoute({ ...base, sourceType: 'microsoft', isReadOnly: true })).toBe(
      'read-only',
    );
  });

  it('rejects cross-authority and cross-provider-calendar moves', () => {
    const google: Calendar = {
      ...base,
      id: 'b0000000-0000-0000-0000-000000000001',
      sourceType: 'google',
    };
    expect(() => assertSupportedCalendarMove(base, google)).toThrow('between BPlan and provider');
    expect(() => assertSupportedCalendarMove(google, { ...google, id: base.id })).toThrow(
      'another calendar',
    );
  });
});
