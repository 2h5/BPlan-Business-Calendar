import type { SandboxCheckoutLaunchRequest } from './checkout-ready';

export type CheckoutProbeBrowserErrorCode =
  | 'BROWSER_UNAVAILABLE'
  | 'BROWSER_TIMEOUT'
  | 'NAVIGATION_REJECTED'
  | 'CHECKOUT_LOAD_FAILED'
  | 'CHECKOUT_ORIGIN_MISMATCH'
  | 'SAFETY';

export class CheckoutProbeBrowserError extends Error {
  readonly code: CheckoutProbeBrowserErrorCode;

  constructor(code: CheckoutProbeBrowserErrorCode) {
    super(code);
    this.name = 'CheckoutProbeBrowserError';
    this.code = code;
  }
}

export interface CheckoutProbeObservation {
  readonly topLevelOrigin: string;
  readonly hostedCheckoutLoaded: boolean;
  readonly stableInteractive: boolean;
}

export interface CheckoutProbeSession {
  observeCheckout(): Promise<CheckoutProbeObservation>;
  close(): Promise<void>;
}

/**
 * Deliberately exposes observation-only operations. Payment actions and
 * arbitrary browser primitives are not part of this contract.
 */
export interface CheckoutProbeBrowser {
  openCheckout(request: SandboxCheckoutLaunchRequest): Promise<CheckoutProbeSession>;
  close(): Promise<void>;
}

export type CheckoutProbeBrowserFactory = () => CheckoutProbeBrowser;
