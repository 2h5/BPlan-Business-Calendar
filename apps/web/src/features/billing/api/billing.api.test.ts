import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { requestAccessRefresh } from './billing.api';

beforeEach(() => {
  invokeMock.mockReset();
});

describe('access refresh API contract', () => {
  it('asks the server to re-read RevenueCat with no client-supplied identity', async () => {
    invokeMock.mockResolvedValue({ data: { status: 'REPAIRED' }, error: null });

    await expect(requestAccessRefresh()).resolves.toBe('REPAIRED');
    expect(invokeMock).toHaveBeenCalledWith('revenuecat-refresh', { body: {} });
  });

  it('passes through rate-limited and in-flight outcomes', async () => {
    for (const status of ['RECENTLY_VERIFIED', 'IN_PROGRESS', 'UNVERIFIED']) {
      invokeMock.mockResolvedValueOnce({ data: { status }, error: null });
      await expect(requestAccessRefresh()).resolves.toBe(status);
    }
  });

  it('rejects an unexpected server response instead of trusting it', async () => {
    invokeMock.mockResolvedValue({ data: { status: 'GRANTED', isPro: true }, error: null });

    await expect(requestAccessRefresh()).rejects.toThrow();
  });

  it('surfaces a function failure so the caller still re-reads the mirror', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('503') });

    await expect(requestAccessRefresh()).rejects.toBeTruthy();
  });
});
