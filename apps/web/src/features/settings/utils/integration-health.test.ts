import type { CalendarSyncHealth } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import {
  deriveAccountHealthState,
  deriveSyncHealthState,
  lastSyncAt,
  syncHealthLabel,
} from './integration-health';

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';
const CALENDAR_ID = '22222222-2222-2222-2222-222222222222';

function health(overrides: Partial<CalendarSyncHealth> = {}): CalendarSyncHealth {
  return {
    calendarId: CALENDAR_ID,
    providerAccountId: ACCOUNT_ID,
    provider: 'google',
    accountStatus: 'active',
    lastFullSyncAt: null,
    lastIncrementalSyncAt: null,
    webhookExpiresAt: null,
    needsFullResync: false,
    hasError: false,
    retryCount: 0,
    ...overrides,
  };
}

describe('integration health derivation', () => {
  it('distinguishes waiting, healthy, resync, retry, and reconnect states', () => {
    expect(deriveSyncHealthState(health())).toBe('waiting');
    expect(deriveSyncHealthState(health({ lastFullSyncAt: '2026-09-08T12:00:00.000Z' }))).toBe(
      'synced',
    );
    expect(deriveSyncHealthState(health({ needsFullResync: true }))).toBe('full_resync');
    expect(deriveSyncHealthState(health({ hasError: true, retryCount: 1 }))).toBe('error');
    expect(deriveSyncHealthState(health({ accountStatus: 'expired' }))).toBe('reconnect');
  });

  it('aggregates imported-calendar state without treating unimported rows as health', () => {
    expect(deriveAccountHealthState('active', [])).toBeNull();
    expect(deriveAccountHealthState('active', [health({ calendarId: null })])).toBeNull();
    expect(deriveAccountHealthState('expired', [])).toBe('reconnect');
    expect(
      deriveAccountHealthState('active', [
        health({ needsFullResync: true }),
        health({ hasError: true }),
      ]),
    ).toBe('error');
  });

  it('prefers incremental time and exposes safe labels', () => {
    const entry = health({
      lastFullSyncAt: '2026-09-08T10:00:00.000Z',
      lastIncrementalSyncAt: '2026-09-08T12:00:00.000Z',
    });
    expect(lastSyncAt(entry)).toBe('2026-09-08T12:00:00.000Z');
    expect(syncHealthLabel('full_resync')).toBe('Full resync needed');
  });
});
