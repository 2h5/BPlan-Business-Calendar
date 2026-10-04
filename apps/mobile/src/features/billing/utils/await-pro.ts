/**
 * After the store says "paid", wait for the server to agree.
 *
 * The app never grants Pro itself: the mirror row written by the server is the
 * only answer. The SDK knows about a purchase a few seconds before the webhook
 * lands, so this asks the server to re-read RevenueCat (in case the webhook is
 * slow or lost) and re-reads the mirror until it says Pro or the time runs out.
 *
 * The server rate-limits re-reads — once a minute per user, longer while it is
 * backing off — and says when to ask again (`retryAfterSeconds`). This never
 * asks before then. When the window closes with the cooldown still running,
 * the caller gets the time the server will accept a refresh again, so it can
 * check once more instead of leaving a paid user waiting for a webhook.
 */

/** What the server said about one refresh request. */
export interface RefreshAnswer {
  status: string;
  retryAfterSeconds: number | null;
}

export interface AwaitProDeps {
  /** Ask the server to re-read RevenueCat. Failures are tolerated. */
  refresh: () => Promise<RefreshAnswer>;
  /** Read whether the mirror says Pro now. */
  isPro: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface AwaitProOptions {
  /** How long to keep the person waiting before reporting "not yet". */
  budgetMs: number;
  /** How often to re-read the mirror. */
  pollMs: number;
  /** When to ask again after a refresh that gave no `retryAfterSeconds`. */
  retryMs: number;
  /** No refresh before this time (epoch ms), e.g. a cooldown from an earlier round. */
  notBefore?: number | null;
}

export const DEFAULT_AWAIT_PRO: AwaitProOptions = {
  budgetMs: 20_000,
  pollMs: 2_000,
  retryMs: 5_000,
};

export type AwaitProResult =
  | { confirmed: true }
  /** `retryAt` is when the server will accept another refresh (epoch ms). */
  | { confirmed: false; retryAt: number };

export async function awaitServerPro(
  deps: AwaitProDeps,
  options: AwaitProOptions = DEFAULT_AWAIT_PRO,
): Promise<AwaitProResult> {
  const deadline = deps.now() + options.budgetMs;
  let nextRefreshAt = options.notBefore ?? deps.now();

  for (;;) {
    if (deps.now() >= nextRefreshAt) {
      try {
        const answer = await deps.refresh();
        // Every cooldown answer carries the wait; without one, ask again soon —
        // a too-early ask is answered with the exact wait, so this never spins.
        nextRefreshAt =
          deps.now() +
          (answer.retryAfterSeconds !== null ? answer.retryAfterSeconds * 1000 : options.retryMs);
      } catch {
        // The webhook may still deliver; keep polling the mirror.
        nextRefreshAt = deps.now() + options.retryMs;
      }
    }

    try {
      if (await deps.isPro()) return { confirmed: true };
    } catch {
      // One failed read is not an answer; try again.
    }

    const remaining = deadline - deps.now();
    if (remaining <= 0) return { confirmed: false, retryAt: nextRefreshAt };
    await deps.sleep(Math.min(options.pollMs, remaining));
  }
}
