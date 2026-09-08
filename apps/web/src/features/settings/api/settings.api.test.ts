import { describe, expect, it } from 'vitest';

import { profileUpdatePayload, providerAccountRowSchema } from './settings-mappers';

describe('settings API contracts', () => {
  it('keeps provider secrets out of the parsed client-safe account', () => {
    const account = providerAccountRowSchema.parse({
      id: 'a0000000-0000-0000-0000-000000000001',
      user_id: '11111111-1111-1111-1111-111111111111',
      provider: 'google',
      email: 'dev@example.com',
      status: 'active',
      scopes: null,
      connected_at: '2026-09-01T10:00:00.000Z',
      last_sync_at: null,
    });
    expect(account).toMatchObject({ provider: 'google', scopes: [] });
    expect(account).not.toHaveProperty('secretReferenceId');
  });

  it('maps only provided profile fields to database columns', () => {
    expect(profileUpdatePayload({ timezone: 'America/New_York', defaultTaskMinutes: 45 })).toEqual({
      timezone: 'America/New_York',
      default_task_minutes: 45,
    });
  });
});
