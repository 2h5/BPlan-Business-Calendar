import { describe, expect, it, vi } from 'vitest';

import { awaitServerPro } from './await-pro';

const options = { attempts: 3, intervalMs: 10 };

function deps(answers: (boolean | Error)[], refresh: () => Promise<unknown> = async () => 'ok') {
  const queue = [...answers];
  return {
    refresh: vi.fn(refresh),
    isPro: vi.fn(async () => {
      const next = queue.shift() ?? false;
      if (next instanceof Error) throw next;
      return next;
    }),
    sleep: vi.fn(async () => {}),
  };
}

describe('awaitServerPro', () => {
  it('asks the server to refresh once, then returns as soon as the mirror says Pro', async () => {
    const d = deps([false, true]);
    await expect(awaitServerPro(d, options)).resolves.toBe(true);
    expect(d.refresh).toHaveBeenCalledTimes(1);
    expect(d.isPro).toHaveBeenCalledTimes(2);
    expect(d.sleep).toHaveBeenCalledTimes(1);
  });

  it('gives up after the last attempt without a trailing wait', async () => {
    const d = deps([false, false, false]);
    await expect(awaitServerPro(d, options)).resolves.toBe(false);
    expect(d.isPro).toHaveBeenCalledTimes(3);
    expect(d.sleep).toHaveBeenCalledTimes(2);
  });

  it('keeps polling when the refresh call fails', async () => {
    const d = deps([true], async () => {
      throw new Error('503');
    });
    await expect(awaitServerPro(d, options)).resolves.toBe(true);
  });

  it('treats a failed read as "not yet" rather than an answer', async () => {
    const d = deps([new Error('network'), true]);
    await expect(awaitServerPro(d, options)).resolves.toBe(true);
  });
});
