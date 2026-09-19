import type { BillingUserAssertionReport } from './assert-user';
import { buildSandboxCheckoutRequest, parseCheckoutReadyPlan } from './checkout-ready';
import { loadBillingEnvironment, redactSecrets, type EnvironmentRecord } from './config';
import type { BillingPlan } from './contract';
import {
  SandboxPurchaseBrowserError,
  type SandboxPurchaseBrowser,
  type SandboxPurchaseBrowserFactory,
  type SandboxPurchaseSession,
  type SandboxValidationCategory,
} from './sandbox-purchase-browser';

const DEFAULT_CONVERGENCE_TIMEOUT_MS = 120_000;
const DEFAULT_CONVERGENCE_INTERVAL_MS = 2_000;

export type SandboxPurchaseErrorCode =
  | 'CONFIGURATION_INVALID'
  | 'PRODUCTION_TARGET_FORBIDDEN'
  | 'FREE_BASELINE_FAILED'
  | 'BROWSER_UNAVAILABLE'
  | 'CHECKOUT_LOAD_FAILED'
  | 'PAYMENT_FORM_UNAVAILABLE'
  | 'PAYMENT_FIXTURE_FAILED'
  | 'PURCHASE_SUBMIT_FAILED'
  | 'CHECKOUT_VALIDATION_BLOCKED'
  | 'PURCHASE_NOT_COMPLETED'
  | 'PURCHASE_STATE_UNKNOWN'
  | 'PURCHASE_REJECTED'
  | 'REVENUECAT_CONVERGENCE_TIMEOUT'
  | 'SUPABASE_CONVERGENCE_TIMEOUT'
  | 'SERVER_AUTHORIZATION_TIMEOUT'
  | 'SAFETY';

export type SandboxPurchaseStatus = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT RUN';

export type SandboxBrowserSubmission =
  'CONFIRMED' | 'VALIDATION BLOCKED' | 'REJECTED' | 'UNKNOWN' | 'NOT RUN';

export type SandboxAuthorityReconciliation = 'PASS' | 'FREE' | 'INCONSISTENT' | 'NOT RUN';

export type SandboxPurchaseConfirmation = 'YES' | 'NO' | 'UNKNOWN';

export interface SandboxPurchaseReport {
  readonly ok: boolean;
  readonly targetEnvironment: 'sandbox' | 'production' | 'not validated';
  readonly plan?: BillingPlan;
  readonly freeBaseline: SandboxPurchaseStatus;
  readonly browser: SandboxPurchaseStatus;
  readonly hostedCheckout: SandboxPurchaseStatus;
  readonly sandboxPayment: SandboxPurchaseStatus;
  readonly submitActionAttempted: 'YES' | 'NO';
  readonly browserSubmission: SandboxBrowserSubmission;
  /** @deprecated Use browserSubmission; retained for existing report consumers. */
  readonly providerSubmission: SandboxBrowserSubmission;
  readonly purchaseSubmitted: 'YES' | 'NO' | 'UNKNOWN';
  readonly retryDisposition: 'SAFE AFTER FIX' | 'DO NOT RETRY' | 'NOT APPLICABLE';
  readonly validationCategory: SandboxValidationCategory | 'NOT OBSERVED';
  readonly hostedSuccess: SandboxPurchaseStatus;
  readonly authorityReconciliation: SandboxAuthorityReconciliation;
  readonly purchaseConfirmed: SandboxPurchaseConfirmation;
  readonly revenueCatPro: SandboxPurchaseStatus;
  readonly supabaseMirror: SandboxPurchaseStatus;
  readonly serverAuthorization: SandboxPurchaseStatus;
  readonly failure?: { readonly code: SandboxPurchaseErrorCode; readonly message: string };
}

export interface SandboxPurchaseOptions {
  readonly environment?: EnvironmentRecord;
  readonly argv?: readonly string[];
  readonly browserFactory: SandboxPurchaseBrowserFactory;
  readonly browserExecutableIsValid: (path: string) => boolean;
  readonly assertUser: (
    expectedState: 'free' | 'active-pro',
  ) => Promise<BillingUserAssertionReport>;
  readonly convergenceTimeoutMs?: number;
  readonly convergenceIntervalMs?: number;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

function initialReport(environment: EnvironmentRecord, plan?: BillingPlan): SandboxPurchaseReport {
  const rawTarget = environment.BILLING_AUTOMATION_ENV;
  return {
    ok: false,
    targetEnvironment:
      rawTarget === 'sandbox' || rawTarget === 'production' ? rawTarget : 'not validated',
    ...(plan ? { plan } : {}),
    freeBaseline: 'NOT RUN',
    browser: 'NOT RUN',
    hostedCheckout: 'NOT RUN',
    sandboxPayment: 'NOT RUN',
    submitActionAttempted: 'NO',
    browserSubmission: 'NOT RUN',
    providerSubmission: 'NOT RUN',
    purchaseSubmitted: 'NO',
    retryDisposition: 'NOT APPLICABLE',
    validationCategory: 'NOT OBSERVED',
    hostedSuccess: 'NOT RUN',
    authorityReconciliation: 'NOT RUN',
    purchaseConfirmed: 'NO',
    revenueCatPro: 'NOT RUN',
    supabaseMirror: 'NOT RUN',
    serverAuthorization: 'NOT RUN',
  };
}

function fail(
  report: SandboxPurchaseReport,
  code: SandboxPurchaseErrorCode,
  message: string,
  environment: EnvironmentRecord,
): SandboxPurchaseReport {
  return { ...report, ok: false, failure: { code, message: redactSecrets(message, environment) } };
}

function browserFailureCode(error: unknown): SandboxPurchaseErrorCode {
  return error instanceof SandboxPurchaseBrowserError ? error.code : 'SAFETY';
}

function assertionTimeoutCode(report: BillingUserAssertionReport): SandboxPurchaseErrorCode {
  switch (report.failure?.category) {
    case 'SUPABASE_MIRROR':
    case 'SUBSCRIPTION_LEDGER':
      return 'SUPABASE_CONVERGENCE_TIMEOUT';
    case 'SERVER_AUTHORIZATION':
      return 'SERVER_AUTHORIZATION_TIMEOUT';
    default:
      return 'REVENUECAT_CONVERGENCE_TIMEOUT';
  }
}

function applyConvergenceProgress(
  report: SandboxPurchaseReport,
  assertion: BillingUserAssertionReport,
): SandboxPurchaseReport {
  const passed = new Set(
    assertion.checks.filter((check) => check.status === 'PASS').map((check) => check.category),
  );
  const revenueCatPassed =
    passed.has('REVENUECAT_CUSTOMER') &&
    passed.has('REVENUECAT_ENTITLEMENT') &&
    passed.has('REVENUECAT_SUBSCRIPTION');
  const supabasePassed = passed.has('SUPABASE_MIRROR') && passed.has('SUBSCRIPTION_LEDGER');
  return {
    ...report,
    revenueCatPro: revenueCatPassed ? 'PASS' : 'FAIL',
    supabaseMirror: supabasePassed ? 'PASS' : 'FAIL',
    serverAuthorization: passed.has('SERVER_AUTHORIZATION') ? 'PASS' : 'FAIL',
  };
}

function withBrowserSubmission(
  report: SandboxPurchaseReport,
  browserSubmission: SandboxBrowserSubmission,
): SandboxPurchaseReport {
  return { ...report, browserSubmission, providerSubmission: browserSubmission };
}

type AuthorityReconciliationResult =
  | { readonly kind: 'active-pro'; readonly report: SandboxPurchaseReport }
  | { readonly kind: 'free'; readonly report: SandboxPurchaseReport }
  | {
      readonly kind: 'inconsistent';
      readonly report: SandboxPurchaseReport;
      readonly timeoutCode?: SandboxPurchaseErrorCode;
    };

function convergenceSettings(options: SandboxPurchaseOptions) {
  const timeout = options.convergenceTimeoutMs ?? DEFAULT_CONVERGENCE_TIMEOUT_MS;
  const interval = options.convergenceIntervalMs ?? DEFAULT_CONVERGENCE_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  return { timeout, interval, now, sleep };
}

async function reconcileActivePro(
  report: SandboxPurchaseReport,
  options: SandboxPurchaseOptions,
): Promise<AuthorityReconciliationResult> {
  const { timeout, interval, now, sleep } = convergenceSettings(options);
  const startedAt = now();
  let lastAssertion: BillingUserAssertionReport | undefined;

  while (true) {
    lastAssertion = await options.assertUser('active-pro');
    report = applyConvergenceProgress(report, lastAssertion);
    if (lastAssertion.ok) return { kind: 'active-pro', report };

    if (now() - startedAt >= timeout) {
      return {
        kind: 'inconsistent',
        report,
        timeoutCode: lastAssertion ? assertionTimeoutCode(lastAssertion) : undefined,
      };
    }
    await sleep(interval);
  }
}

async function reconcileAmbiguousSubmission(
  report: SandboxPurchaseReport,
  options: SandboxPurchaseOptions,
): Promise<AuthorityReconciliationResult> {
  const { timeout, interval, now, sleep } = convergenceSettings(options);
  const startedAt = now();
  let freeWindowCoherent = true;
  let freeSamples = 0;

  while (true) {
    const activeProAssertion = await options.assertUser('active-pro');
    report = applyConvergenceProgress(report, activeProAssertion);
    if (activeProAssertion.ok) return { kind: 'active-pro', report };

    const freeAssertion = await options.assertUser('free');
    if (freeAssertion.ok) {
      freeSamples += 1;
    } else {
      freeWindowCoherent = false;
    }

    if (now() - startedAt >= timeout) {
      return freeWindowCoherent && freeSamples > 0
        ? { kind: 'free', report }
        : { kind: 'inconsistent', report };
    }
    await sleep(interval);
  }
}

async function resolveAmbiguousSubmission(
  report: SandboxPurchaseReport,
  options: SandboxPurchaseOptions,
  environment: EnvironmentRecord,
): Promise<SandboxPurchaseReport> {
  const reconciliation = await reconcileAmbiguousSubmission(report, options);
  if (reconciliation.kind === 'active-pro') {
    return {
      ...reconciliation.report,
      ok: true,
      authorityReconciliation: 'PASS',
      purchaseConfirmed: 'YES',
    };
  }
  if (reconciliation.kind === 'free') {
    return fail(
      {
        ...reconciliation.report,
        authorityReconciliation: 'FREE',
        purchaseConfirmed: 'NO',
      },
      'PURCHASE_NOT_COMPLETED',
      'Billing authorities remained coherently free for the bounded observation window; no completed billing transition was observed. Do not retry automatically.',
      environment,
    );
  }
  return fail(
    {
      ...reconciliation.report,
      authorityReconciliation: 'INCONSISTENT',
      purchaseConfirmed: 'UNKNOWN',
    },
    'PURCHASE_STATE_UNKNOWN',
    'The browser result was ambiguous and billing authorities did not converge to active Pro or remain coherently free for the bounded observation window. Do not retry automatically.',
    environment,
  );
}

export async function runSandboxPurchase(
  options: SandboxPurchaseOptions,
): Promise<SandboxPurchaseReport> {
  const environment = options.environment ?? process.env;
  const parsed = parseCheckoutReadyPlan(options.argv ?? process.argv.slice(2));
  if (!parsed.ok) {
    return fail(
      initialReport(environment),
      'CONFIGURATION_INVALID',
      parsed.error.message,
      environment,
    );
  }
  let report = initialReport(environment, parsed.plan);
  if (environment.BILLING_AUTOMATION_MODE !== 'sandbox-purchase') {
    return fail(
      report,
      'CONFIGURATION_INVALID',
      'BILLING_AUTOMATION_MODE must be sandbox-purchase.',
      environment,
    );
  }
  if (environment.BILLING_AUTOMATION_ENV === 'production') {
    return fail(
      report,
      'PRODUCTION_TARGET_FORBIDDEN',
      'Production purchase is forbidden.',
      environment,
    );
  }

  const loaded = loadBillingEnvironment(environment);
  if (loaded.issues.length > 0) {
    return fail(
      report,
      'CONFIGURATION_INVALID',
      loaded.issues.map((issue) => issue.message).join(' '),
      environment,
    );
  }
  const userId = environment.BILLING_TEST_USER_ID?.trim() ?? '';
  const checkout = buildSandboxCheckoutRequest({
    userId,
    plan: parsed.plan,
    purchaseLinkBaseUrl: environment.BILLING_REVENUECAT_SANDBOX_PURCHASE_URL ?? '',
    targetEnvironment: environment.BILLING_AUTOMATION_ENV ?? '',
  });
  if (!checkout.ok) {
    const code =
      checkout.error.code === 'PRODUCTION_TARGET_FORBIDDEN'
        ? 'PRODUCTION_TARGET_FORBIDDEN'
        : 'CONFIGURATION_INVALID';
    return fail(report, code, checkout.error.message, environment);
  }

  const executablePath = environment.BILLING_PLAYWRIGHT_EXECUTABLE_PATH?.trim() ?? '';
  if (!executablePath || !options.browserExecutableIsValid(executablePath)) {
    return fail(
      report,
      'BROWSER_UNAVAILABLE',
      'The configured browser is unavailable.',
      environment,
    );
  }

  const baseline = await options.assertUser('free');
  if (!baseline.ok) {
    return fail(
      { ...report, freeBaseline: 'FAIL' },
      'FREE_BASELINE_FAILED',
      'The read-only free baseline did not pass.',
      environment,
    );
  }
  report = { ...report, freeBaseline: 'PASS' };

  let browser: SandboxPurchaseBrowser | undefined;
  let session: SandboxPurchaseSession | undefined;
  let submitted = false;
  let stateUncertain = false;
  let authorityReconciliationStarted = false;
  let cleanupFailed = false;
  let outcome: SandboxPurchaseReport | undefined;
  try {
    browser = options.browserFactory();
    report = { ...report, browser: 'FAIL' };
    session = await browser.openIdentifiedSandboxCheckout(checkout.request);
    report = { ...report, browser: 'PASS', hostedCheckout: 'FAIL' };
    await session.observeCheckoutReady();
    report = { ...report, hostedCheckout: 'PASS', sandboxPayment: 'FAIL' };
    await session.enterApprovedStripeSandboxFixture();
    report = { ...report, sandboxPayment: 'PASS' };
    const submission = await session.attemptSandboxPurchaseOnce();
    report = {
      ...report,
      submitActionAttempted: submission.actionAttempted ? 'YES' : 'NO',
    };
    if (submission.state === 'validation-blocked') {
      outcome = fail(
        withBrowserSubmission(
          {
            ...report,
            purchaseSubmitted: 'NO',
            retryDisposition: 'SAFE AFTER FIX',
            validationCategory: submission.validationCategory ?? 'UNKNOWN_REQUIRED_FIELD',
          },
          'VALIDATION BLOCKED',
        ),
        'CHECKOUT_VALIDATION_BLOCKED',
        'Hosted checkout validation blocked submission before provider confirmation.',
        environment,
      );
    } else if (submission.state === 'unknown') {
      stateUncertain = true;
      report = withBrowserSubmission(
        {
          ...report,
          purchaseSubmitted: 'UNKNOWN',
          retryDisposition: 'DO NOT RETRY',
          hostedSuccess: 'UNKNOWN',
        },
        'UNKNOWN',
      );
      authorityReconciliationStarted = true;
      outcome = await resolveAmbiguousSubmission(report, options, environment);
    } else if (submission.state === 'rejected') {
      submitted = true;
      outcome = fail(
        withBrowserSubmission(
          {
            ...report,
            purchaseSubmitted: 'YES',
            retryDisposition: 'DO NOT RETRY',
          },
          'REJECTED',
        ),
        'PURCHASE_REJECTED',
        'The provider confirmed and rejected the sandbox purchase.',
        environment,
      );
    } else {
      submitted = true;
      report = withBrowserSubmission(
        {
          ...report,
          purchaseSubmitted: 'YES',
          retryDisposition: 'DO NOT RETRY',
          hostedSuccess: submission.state === 'success' ? 'PASS' : 'FAIL',
        },
        'CONFIRMED',
      );
      if (submission.state === 'processing') {
        const hostedResult = await session.observeHostedResult();
        if (hostedResult === 'rejected') {
          outcome = fail(
            withBrowserSubmission({ ...report }, 'REJECTED'),
            'PURCHASE_REJECTED',
            'The provider confirmed and rejected the sandbox purchase.',
            environment,
          );
        } else if (hostedResult === 'unknown') {
          stateUncertain = true;
          authorityReconciliationStarted = true;
          outcome = await resolveAmbiguousSubmission(
            { ...report, hostedSuccess: 'UNKNOWN' },
            options,
            environment,
          );
        } else {
          report = { ...report, hostedSuccess: 'PASS' };
        }
      }
    }

    if (!outcome) {
      authorityReconciliationStarted = true;
      const reconciliation = await reconcileActivePro(report, options);
      if (reconciliation.kind === 'active-pro') {
        outcome = {
          ...reconciliation.report,
          ok: true,
          authorityReconciliation: 'PASS',
          purchaseConfirmed: 'YES',
        };
      } else {
        outcome = fail(
          {
            ...reconciliation.report,
            authorityReconciliation: 'INCONSISTENT',
            purchaseConfirmed: 'UNKNOWN',
          },
          reconciliation.kind === 'inconsistent' && reconciliation.timeoutCode
            ? reconciliation.timeoutCode
            : 'REVENUECAT_CONVERGENCE_TIMEOUT',
          'Read-only billing authorities did not converge before the timeout.',
          environment,
        );
      }
    }
  } catch (error: unknown) {
    const explicitBrowserCode =
      error instanceof SandboxPurchaseBrowserError ? error.code : undefined;
    if ((submitted || stateUncertain) && !authorityReconciliationStarted) {
      authorityReconciliationStarted = true;
      try {
        outcome = await resolveAmbiguousSubmission(
          { ...report, hostedSuccess: 'UNKNOWN' },
          options,
          environment,
        );
      } catch {
        outcome = fail(
          {
            ...report,
            hostedSuccess: 'UNKNOWN',
            authorityReconciliation: 'INCONSISTENT',
            purchaseConfirmed: 'UNKNOWN',
          },
          'PURCHASE_STATE_UNKNOWN',
          'The purchase was submitted once, but its final state is unknown. Do not retry automatically.',
          environment,
        );
      }
    } else {
      const code =
        submitted || stateUncertain ? 'PURCHASE_STATE_UNKNOWN' : browserFailureCode(error);
      outcome = fail(
        submitted || stateUncertain
          ? {
              ...report,
              hostedSuccess: 'UNKNOWN',
              authorityReconciliation: 'INCONSISTENT',
              purchaseConfirmed: 'UNKNOWN',
            }
          : report,
        code,
        submitted || stateUncertain
          ? 'The purchase was submitted once, but its final state is unknown. Do not retry automatically.'
          : explicitBrowserCode === 'PURCHASE_SUBMIT_FAILED'
            ? 'The sandbox purchase action could not be attempted.'
            : 'The sandbox purchase browser failed closed.',
        environment,
      );
    }
  } finally {
    if (session) {
      try {
        await session.close();
      } catch {
        cleanupFailed = true;
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch {
        cleanupFailed = true;
      }
    }
  }

  if (cleanupFailed) {
    return fail(
      outcome ?? report,
      submitted || stateUncertain ? 'PURCHASE_STATE_UNKNOWN' : 'SAFETY',
      submitted || stateUncertain
        ? 'Browser cleanup failed after submission; purchase state is unknown. Do not retry automatically.'
        : 'Browser cleanup failed closed.',
      environment,
    );
  }
  return outcome ?? fail(report, 'SAFETY', 'The sandbox purchase failed closed.', environment);
}

function dotted(label: string, value: string): string {
  return `${label}${'.'.repeat(Math.max(1, 31 - label.length))} ${value}`;
}

export function formatSandboxPurchaseReport(report: SandboxPurchaseReport): string {
  const lines = [
    'RevenueCat sandbox billing E2E',
    '',
    dotted('Target', report.targetEnvironment),
    dotted('Plan', report.plan ?? 'not validated'),
    dotted('Free baseline', report.freeBaseline),
    dotted('Browser', report.browser),
    dotted('Hosted checkout', report.hostedCheckout),
    dotted('Sandbox payment', report.sandboxPayment),
    dotted('Submit action attempted', report.submitActionAttempted),
    dotted('Browser submission', report.browserSubmission),
    dotted('Authority reconciliation', report.authorityReconciliation),
    dotted('Purchase submitted', report.purchaseSubmitted),
    dotted('Purchase confirmed', report.purchaseConfirmed),
    dotted('Retry disposition', report.retryDisposition),
    dotted('Validation category', report.validationCategory),
    dotted('Hosted success', report.hostedSuccess),
    dotted('RevenueCat Pro', report.revenueCatPro),
    dotted('Supabase mirror', report.supabaseMirror),
    dotted('Server authorization', report.serverAuthorization),
  ];
  if (report.failure) lines.push('', `Failure: ${report.failure.code}: ${report.failure.message}`);
  lines.push('', `Result: ${report.ok ? 'PASS' : 'FAIL'}`);
  return lines.join('\n');
}
