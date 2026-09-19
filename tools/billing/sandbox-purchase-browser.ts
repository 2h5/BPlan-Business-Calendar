import type { SandboxCheckoutLaunchRequest } from './checkout-ready';

export type SandboxPurchaseBrowserErrorCode =
  | 'BROWSER_UNAVAILABLE'
  | 'CHECKOUT_LOAD_FAILED'
  | 'PAYMENT_FORM_UNAVAILABLE'
  | 'PAYMENT_FIXTURE_FAILED'
  | 'PURCHASE_SUBMIT_FAILED'
  | 'SAFETY';

export class SandboxPurchaseBrowserError extends Error {
  readonly code: SandboxPurchaseBrowserErrorCode;

  constructor(code: SandboxPurchaseBrowserErrorCode) {
    super(code);
    this.name = 'SandboxPurchaseBrowserError';
    this.code = code;
  }
}

export type SandboxSubmissionState =
  'validation-blocked' | 'processing' | 'success' | 'rejected' | 'unknown';

export type SandboxValidationCategory =
  | 'EMAIL_REQUIRED'
  | 'REQUIRED_CHECKBOX_UNSATISFIED'
  | 'OTHER_REQUIRED_FIELD'
  | 'UNKNOWN_REQUIRED_FIELD';

export interface SandboxSubmissionObservation {
  readonly actionAttempted: boolean;
  readonly state: SandboxSubmissionState;
  readonly validationCategory?: SandboxValidationCategory;
}

export type SandboxHostedResult = 'success' | 'rejected' | 'unknown';

export interface SandboxPurchaseSession {
  observeCheckoutReady(): Promise<void>;
  enterApprovedStripeSandboxFixture(): Promise<void>;
  attemptSandboxPurchaseOnce(): Promise<SandboxSubmissionObservation>;
  observeHostedResult(): Promise<SandboxHostedResult>;
  close(): Promise<void>;
}

/** Narrow mutating seam: no selectors, arbitrary fill, evaluation, or navigation. */
export interface SandboxPurchaseBrowser {
  openIdentifiedSandboxCheckout(
    request: SandboxCheckoutLaunchRequest,
  ): Promise<SandboxPurchaseSession>;
  close(): Promise<void>;
}

export type SandboxPurchaseBrowserFactory = () => SandboxPurchaseBrowser;
