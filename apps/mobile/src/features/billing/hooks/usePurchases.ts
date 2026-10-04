import { getSubscriptionStatusInfo } from '@cal/domain';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';

import { logError } from '../../../lib/logger';
import { queryKeys } from '../../../lib/query/query-client';
import { useAuth } from '../../auth';
import { fetchSubscription, requestAccessRefresh } from '../api/billing.api';
import {
  fetchManagementUrl,
  fetchStorePlans,
  forgetPurchaser,
  identifyPurchaser,
  isPurchasingSupported,
  purchaseStorePlan,
  restoreStorePurchases,
  type StorePlan,
} from '../api/purchases.api';
import { awaitServerPro, DEFAULT_AWAIT_PRO, type AwaitProResult } from '../utils/await-pro';
import { classifyPurchaseError } from '../utils/purchase-outcome';

/**
 * Keeps the store client signed in as whoever is signed in to the app.
 * Mounted once at the root.
 */
export function usePurchaserSync(): void {
  const { userId } = useAuth();

  useEffect(() => {
    const change = userId ? identifyPurchaser(userId) : forgetPurchaser();
    change.catch((error: unknown) => logError(error, { area: 'purchases.identity' }));
  }, [userId]);
}

/** The iOS plans with the store's localized prices. */
export function useStorePlans() {
  const { userId } = useAuth();
  const supported = isPurchasingSupported();

  return useQuery({
    queryKey: queryKeys.purchases.offering(),
    queryFn: () => {
      if (!userId) throw new Error('Expected an authenticated user');
      return fetchStorePlans(userId);
    },
    enabled: supported && userId !== null,
    // Prices change rarely and only in the store dashboard.
    staleTime: 60 * 60_000,
  });
}

type StoreAction = 'purchase' | 'restore';

/**
 * Where a store purchase or restore is up to, as the upgrade page shows it.
 *
 * `working` covers the store sheet and the gap between the store taking
 * payment and the server mirror saying Pro. `unconfirmed` means the store took
 * payment but the server hasn't caught up yet; the flow asks the server again
 * at `retryAt`, when its rate limit allows, and the person can ask too.
 */
export type PurchaseFlowState =
  | { phase: 'idle' }
  | { phase: 'working'; action: StoreAction | 'recheck' }
  | { phase: 'done'; action: StoreAction }
  | { phase: 'unconfirmed'; action: StoreAction; retryAt: number }
  | { phase: 'nothing-to-restore' }
  | { phase: 'failed'; message: string };

type FlowRequest =
  | { action: 'purchase'; plan: StorePlan }
  | { action: 'restore' }
  | { action: 'recheck'; of: StoreAction; retryAt: number; round: number };

type Outcome =
  | { kind: 'confirmed'; of: StoreAction }
  | { kind: 'unconfirmed'; of: StoreAction; retryAt: number; round: number }
  | { kind: 'cancelled' }
  | { kind: 'nothing-to-restore' }
  | { kind: 'failed'; message: string };

/**
 * How many times the flow re-asks the server on its own after a confirmation
 * window closes. Each waits out the server's cooldown, so three covers a few
 * minutes; after that the "Check again" button is the way on.
 */
const AUTO_RECHECKS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PurchaseFlow {
  state: PurchaseFlowState;
  /**
   * A store action is running here or anywhere else in the app (the upgrade
   * page and Settings each have a flow). Buying and restoring wait for it.
   */
  isBusy: boolean;
  purchase: (plan: StorePlan) => void;
  restore: () => void;
  /** Ask the server again after an unconfirmed payment. */
  recheck: () => void;
  /**
   * Clear a finished result. A store action in flight, or a payment the
   * server hasn't confirmed, is kept: forgetting either would unlock the buy
   * button over a charge that already happened.
   */
  reset: () => void;
}

/** Buying and restoring Pro through the store, then waiting for the server. */
export function usePurchaseFlow(): PurchaseFlow {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const isBusy = useIsMutating({ mutationKey: queryKeys.purchases.storeAction() }) > 0;

  const confirmWithServer = async (
    id: string,
    notBefore: number | null,
  ): Promise<AwaitProResult> => {
    const result = await awaitServerPro(
      {
        refresh: requestAccessRefresh,
        isPro: async () =>
          getSubscriptionStatusInfo(await fetchSubscription(id)).state === 'active',
        sleep,
        now: Date.now,
      },
      { ...DEFAULT_AWAIT_PRO, notBefore },
    );
    await queryClient.invalidateQueries({ queryKey: queryKeys.subscription() });
    return result;
  };

  const confirm = async (
    id: string,
    of: StoreAction,
    notBefore: number | null,
    round: number,
  ): Promise<Outcome> => {
    const result = await confirmWithServer(id, notBefore);
    return result.confirmed
      ? { kind: 'confirmed', of }
      : { kind: 'unconfirmed', of, retryAt: result.retryAt, round };
  };

  const run = useMutation({
    mutationKey: queryKeys.purchases.storeAction(),
    mutationFn: async (request: FlowRequest): Promise<Outcome> => {
      if (!userId) throw new Error('Expected an authenticated user');

      if (request.action === 'recheck') {
        return confirm(userId, request.of, request.retryAt, request.round);
      }

      if (request.action === 'purchase') {
        try {
          await purchaseStorePlan(userId, request.plan);
        } catch (error) {
          const failure = classifyPurchaseError(error);
          if (failure.kind === 'cancelled') return { kind: 'cancelled' };
          if (failure.kind !== 'pending') logError(error, { area: 'purchases.buy' });
          return { kind: 'failed', message: failure.message ?? 'The purchase didn’t go through.' };
        }
        return confirm(userId, 'purchase', null, 0);
      }

      let storeHasPro: boolean;
      try {
        storeHasPro = await restoreStorePurchases(userId);
      } catch (error) {
        const failure = classifyPurchaseError(error);
        if (failure.kind === 'cancelled') return { kind: 'cancelled' };
        logError(error, { area: 'purchases.restore' });
        return { kind: 'failed', message: failure.message ?? 'Couldn’t restore purchases.' };
      }
      if (!storeHasPro) return { kind: 'nothing-to-restore' };
      return confirm(userId, 'restore', null, 0);
    },
  });

  const { mutate, reset: resetMutation, data: outcome, isPending, variables } = run;

  // A result belongs to the account that produced it. The upgrade page lives
  // at the root and outlives sign-out, so without this the next account would
  // inherit the last one's "payment received" and its locked buy button.
  useEffect(() => {
    resetMutation();
  }, [userId, resetMutation]);

  // The server said when it will re-read RevenueCat again; ask then, rather
  // than leave a paid person waiting on a webhook that may never come.
  useEffect(() => {
    if (outcome?.kind !== 'unconfirmed' || outcome.round >= AUTO_RECHECKS) return;
    const { of, retryAt, round } = outcome;
    const timer = setTimeout(
      () => mutate({ action: 'recheck', of, retryAt, round: round + 1 }),
      Math.max(0, retryAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [outcome, mutate]);

  const state = toState(isPending, variables, outcome);

  return {
    state,
    isBusy,
    purchase: (plan) => {
      if (isBusy || state.phase === 'unconfirmed') return;
      mutate({ action: 'purchase', plan });
    },
    restore: () => {
      if (isBusy) return;
      mutate({ action: 'restore' });
    },
    recheck: () => {
      if (isBusy || outcome?.kind !== 'unconfirmed') return;
      // A manual ask doesn't spend an automatic round.
      mutate({ action: 'recheck', of: outcome.of, retryAt: outcome.retryAt, round: outcome.round });
    },
    reset: () => {
      if (isPending || outcome?.kind === 'unconfirmed') return;
      resetMutation();
    },
  };
}

function toState(
  isPending: boolean,
  request: FlowRequest | undefined,
  outcome: Outcome | undefined,
): PurchaseFlowState {
  if (isPending && request) return { phase: 'working', action: request.action };
  switch (outcome?.kind) {
    case 'confirmed':
      return { phase: 'done', action: outcome.of };
    case 'unconfirmed':
      return { phase: 'unconfirmed', action: outcome.of, retryAt: outcome.retryAt };
    case 'nothing-to-restore':
      return { phase: 'nothing-to-restore' };
    case 'failed':
      return { phase: 'failed', message: outcome.message };
    default:
      return { phase: 'idle' };
  }
}

/**
 * Opens wherever this subscription is managed: the App Store for an Apple
 * purchase, the web billing portal for a web one.
 */
export function useManageSubscription() {
  const { userId } = useAuth();

  return useMutation({
    mutationFn: async (): Promise<boolean> => {
      if (!userId) throw new Error('Expected an authenticated user');
      const url = await fetchManagementUrl(userId);
      if (!url) return false;
      await WebBrowser.openBrowserAsync(url);
      return true;
    },
  });
}
