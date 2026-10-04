import { getSubscriptionStatusInfo } from '@cal/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { awaitServerPro } from '../utils/await-pro';
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

/**
 * Where a store purchase or restore is up to, as the upgrade page shows it.
 *
 * `confirming` covers the gap between the store taking payment and the server
 * mirror saying Pro. `unconfirmed` means the store took payment but the server
 * hasn't caught up yet; Pro will appear once the webhook lands.
 */
export type PurchaseFlowState =
  | { phase: 'idle' }
  | { phase: 'working'; action: 'purchase' | 'restore' }
  | { phase: 'done'; action: 'purchase' | 'restore' }
  | { phase: 'unconfirmed' }
  | { phase: 'nothing-to-restore' }
  | { phase: 'failed'; message: string };

type Outcome =
  | { kind: 'confirmed' }
  | { kind: 'unconfirmed' }
  | { kind: 'cancelled' }
  | { kind: 'nothing-to-restore' }
  | { kind: 'failed'; message: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PurchaseFlow {
  state: PurchaseFlowState;
  purchase: (plan: StorePlan) => void;
  restore: () => void;
  reset: () => void;
}

/** Buying and restoring Pro through the store, then waiting for the server. */
export function usePurchaseFlow(): PurchaseFlow {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  const confirmWithServer = async (id: string): Promise<boolean> => {
    const confirmed = await awaitServerPro({
      refresh: requestAccessRefresh,
      isPro: async () => getSubscriptionStatusInfo(await fetchSubscription(id)).state === 'active',
      sleep,
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.subscription() });
    return confirmed;
  };

  const purchase = useMutation({
    mutationFn: async (plan: StorePlan): Promise<Outcome> => {
      if (!userId) throw new Error('Expected an authenticated user');
      try {
        await purchaseStorePlan(userId, plan);
      } catch (error) {
        const failure = classifyPurchaseError(error);
        if (failure.kind === 'cancelled') return { kind: 'cancelled' };
        if (failure.kind !== 'pending') logError(error, { area: 'purchases.buy' });
        return { kind: 'failed', message: failure.message ?? 'The purchase didn’t go through.' };
      }
      return (await confirmWithServer(userId)) ? { kind: 'confirmed' } : { kind: 'unconfirmed' };
    },
  });

  const restore = useMutation({
    mutationFn: async (): Promise<Outcome> => {
      if (!userId) throw new Error('Expected an authenticated user');
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
      return (await confirmWithServer(userId)) ? { kind: 'confirmed' } : { kind: 'unconfirmed' };
    },
  });

  const active = purchase.isPending || purchase.data ? purchase : restore;
  const action = active === purchase ? 'purchase' : 'restore';

  return {
    state: toState(active.isPending, active.data, action),
    purchase: (plan) => {
      restore.reset();
      purchase.mutate(plan);
    },
    restore: () => {
      purchase.reset();
      restore.mutate();
    },
    reset: () => {
      purchase.reset();
      restore.reset();
    },
  };
}

function toState(
  isPending: boolean,
  outcome: Outcome | undefined,
  action: 'purchase' | 'restore',
): PurchaseFlowState {
  if (isPending) return { phase: 'working', action };
  switch (outcome?.kind) {
    case 'confirmed':
      return { phase: 'done', action };
    case 'unconfirmed':
      return { phase: 'unconfirmed' };
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
