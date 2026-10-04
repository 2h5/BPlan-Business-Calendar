import { describe, expect, it, vi } from 'vitest';

import { awaitServerPro, type RefreshAnswer } from './await-pro';

const options = { budgetMs: 10_000, pollMs: 2_000, retryMs: 5_000 };
const repaired: RefreshAnswer = { status: 'REPAIRED', retryAfterSeconds: null };

/** A clock that only moves when the code under test sleeps. */
function deps(
  answers: (boolean | Error)[],
  refresh: () => Promise<RefreshAnswer> = async () => repaired,
) {
  const queue = [...answers];
  let clock = 0;
  return {
    refresh: vi.fn(refresh),
    isPro: vi.fn(async () => {
      const next = queue.shift() ?? false;
      if (next instanceof Error) throw next;
      return next;
    }),
    sleep: vi.fn(async (ms: number) => {
      clock += ms;
    }),
    now: () => clock,
  };
}

describe('awaitServerPro', () => {
  it('asks the server to refresh, then returns as soon as the mirror says Pro', async () => {
    const d = deps([false, true]);
    await expect(awaitServerPro(d, options)).resolves.toEqual({ confirmed: true });
    expect(d.refresh).toHaveBeenCalledTimes(1);
    expect(d.isPro).toHaveBeenCalledTimes(2);
    expect(d.sleep).toHaveBeenCalledTimes(1);
  });

  it('gives up when the budget is spent, without a trailing wait', async () => {
    const d = deps([]);
    const result = await awaitServerPro(d, options);
    expect(result.confirmed).toBe(false);
    // Reads at 0, 2, 4, 6, 8, 10 s; sleeps only between them.
    expect(d.isPro).toHaveBeenCalledTimes(6);
    expect(d.sleep).toHaveBeenCalledTimes(5);
  });

  it('never asks again before the server’s retryAfterSeconds', async () => {
    const d = deps([], async () => ({ status: 'RECENTLY_VERIFIED', retryAfterSeconds: 60 }));
    const result = await awaitServerPro(d, options);
    expect(d.refresh).toHaveBeenCalledTimes(1);
    // The caller learns when the server will take a refresh again.
    expect(result).toEqual({ confirmed: false, retryAt: 60_000 });
  });

  it('asks again inside the window once a short cooldown lapses', async () => {
    const answers: RefreshAnswer[] = [
      { status: 'IN_PROGRESS', retryAfterSeconds: 4 },
      { status: 'REPAIRED', retryAfterSeconds: null },
    ];
    const d = deps([false, false, false, true], async () => answers.shift() ?? repaired);
    await expect(awaitServerPro(d, options)).resolves.toEqual({ confirmed: true });
    expect(d.refresh).toHaveBeenCalledTimes(2);
  });

  it('waits for an earlier cooldown before the first refresh', async () => {
    const d = deps([]);
    const result = await awaitServerPro(d, { ...options, notBefore: 30_000 });
    expect(d.refresh).not.toHaveBeenCalled();
    expect(result).toEqual({ confirmed: false, retryAt: 30_000 });
  });

  it('keeps polling and retries later when the refresh call fails', async () => {
    const d = deps([false, false, false, true], async () => {
      throw new Error('503');
    });
    await expect(awaitServerPro(d, options)).resolves.toEqual({ confirmed: true });
    // Once at 0 s, again at 6 s (retryMs after the failure).
    expect(d.refresh).toHaveBeenCalledTimes(2);
  });

  it('treats a failed read as "not yet" rather than an answer', async () => {
    const d = deps([new Error('network'), true]);
    await expect(awaitServerPro(d, options)).resolves.toEqual({ confirmed: true });
  });
});
