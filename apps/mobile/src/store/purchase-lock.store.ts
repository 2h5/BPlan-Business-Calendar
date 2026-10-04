import { create } from 'zustand';

import type { PurchaseLock } from '../features/billing/utils/purchase-gate';

interface PurchaseLockState {
  /**
   * A payment the server hasn't confirmed yet. Client-only knowledge — the
   * server's mirror is still the Pro authority; this only stops the app from
   * selling again while it waits.
   */
  lock: PurchaseLock | null;

  setLock: (lock: PurchaseLock | null) => void;
}

export const usePurchaseLockStore = create<PurchaseLockState>((set) => ({
  lock: null,

  setLock: (lock) => set({ lock }),
}));
