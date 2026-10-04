import { usePurchaserSync } from '../hooks/usePurchases';

/** Signs the store client in and out with the app. Renders nothing. */
export function PurchasesSync() {
  usePurchaserSync();
  return null;
}
