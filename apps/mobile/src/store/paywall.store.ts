import { create } from 'zustand';

interface PaywallState {
  /** Whether the upgrade page is showing. */
  isOpen: boolean;

  open: () => void;
  close: () => void;
}

export const usePaywallStore = create<PaywallState>((set) => ({
  isOpen: false,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
