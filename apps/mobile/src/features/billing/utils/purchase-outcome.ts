/**
 * What a store purchase or restore attempt came to, in the app's own words.
 *
 * RevenueCat reports failures as numeric-string codes. Only a few deserve
 * their own message; the rest are "the store said no", and saying more would
 * be guessing. Kept free of the SDK import so it can be unit-tested.
 */

/** RevenueCat's `PURCHASES_ERROR_CODE` values this app treats specially. */
const CANCELLED = '1';
const STORE_PROBLEM = '2';
const NOT_ALLOWED = '3';
const PRODUCT_UNAVAILABLE = '5';
const NETWORK = '10';
const IN_PROGRESS = '15';
const PAYMENT_PENDING = '20';
const CONFIGURATION = '23';
const OFFLINE = '35';

export type PurchaseFailureKind =
  /** The person closed the payment sheet. Not an error. */
  | 'cancelled'
  /** Ask to Buy or a delayed payment: the store will finish it later. */
  | 'pending'
  | 'offline'
  | 'not-allowed'
  | 'unavailable'
  | 'in-progress'
  | 'failed';

export interface PurchaseFailure {
  kind: PurchaseFailureKind;
  /** Safe to show. Null for a cancellation, which needs no message. */
  message: string | null;
}

export function classifyPurchaseError(error: unknown): PurchaseFailure {
  const code = readCode(error);
  if (readUserCancelled(error) || code === CANCELLED) return { kind: 'cancelled', message: null };

  switch (code) {
    case PAYMENT_PENDING:
      return {
        kind: 'pending',
        message: 'Your purchase is waiting for approval. Pro switches on once it goes through.',
      };
    case NETWORK:
    case OFFLINE:
      return {
        kind: 'offline',
        message: 'You appear to be offline. Connect and try again.',
      };
    case NOT_ALLOWED:
      return {
        kind: 'not-allowed',
        message: 'Purchases aren’t allowed on this device. Check Screen Time restrictions.',
      };
    case PRODUCT_UNAVAILABLE:
    case STORE_PROBLEM:
    case CONFIGURATION:
      return {
        kind: 'unavailable',
        message: 'The App Store isn’t available right now. Please try again later.',
      };
    case IN_PROGRESS:
      return { kind: 'in-progress', message: 'A purchase is already in progress.' };
    default:
      return { kind: 'failed', message: 'The purchase didn’t go through. You weren’t charged.' };
  }
}

function readCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { code: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function readUserCancelled(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { userCancelled?: unknown }).userCancelled === true;
}
