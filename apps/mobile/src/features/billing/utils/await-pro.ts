/**
 * After the store says "paid", wait for the server to agree.
 *
 * The app never grants Pro itself: the mirror row written by the server is the
 * only answer. The SDK knows about a purchase a few seconds before the webhook
 * lands, so this asks the server to re-read RevenueCat once (in case the
 * webhook is slow or lost) and then re-reads the mirror until it says Pro or
 * the time runs out.
 */

export interface AwaitProDeps {
  /** Ask the server to re-read RevenueCat. Failures are tolerated. */
  refresh: () => Promise<unknown>;
  /** Read whether the mirror says Pro now. */
  isPro: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
}

export interface AwaitProOptions {
  attempts: number;
  intervalMs: number;
}

export const DEFAULT_AWAIT_PRO: AwaitProOptions = { attempts: 10, intervalMs: 2_000 };

/** True when the server confirmed Pro within the window; false otherwise. */
export async function awaitServerPro(
  deps: AwaitProDeps,
  options: AwaitProOptions = DEFAULT_AWAIT_PRO,
): Promise<boolean> {
  try {
    await deps.refresh();
  } catch {
    // The webhook may still deliver; keep polling the mirror.
  }

  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    try {
      if (await deps.isPro()) return true;
    } catch {
      // One failed read is not an answer; try again.
    }
    if (attempt < options.attempts - 1) await deps.sleep(options.intervalMs);
  }
  return false;
}
