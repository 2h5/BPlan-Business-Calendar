import {
  CheckoutProbeBrowserError,
  type CheckoutProbeBrowser,
  type CheckoutProbeBrowserFactory,
  type CheckoutProbeObservation,
  type CheckoutProbeSession,
} from './checkout-probe-browser';
import {
  buildSandboxCheckoutRequest,
  parseCheckoutReadyPlan,
  type CheckoutReadyErrorCode,
  type SandboxCheckoutLaunchRequest,
} from './checkout-ready';
import { loadBillingEnvironment, type EnvironmentRecord } from './config';
import { REVENUECAT_PURCHASE_LINK_HOST, REVENUECAT_PURCHASE_LINK_ORIGIN } from './contract';

const DEFAULT_CHECKOUT_PROBE_TIMEOUT_MS = 30_000;

export type CheckoutProbeErrorCode =
  | CheckoutReadyErrorCode
  | 'CONFIGURATION_INVALID'
  | 'BROWSER_UNAVAILABLE'
  | 'BROWSER_TIMEOUT'
  | 'NAVIGATION_REJECTED'
  | 'CHECKOUT_LOAD_FAILED'
  | 'CHECKOUT_ORIGIN_MISMATCH'
  | 'SAFETY';

export interface CheckoutProbeError {
  readonly code: CheckoutProbeErrorCode;
  readonly message: string;
}

export type CheckoutProbeStatus = 'PASS' | 'FAIL' | 'NOT RUN';

export interface CheckoutProbeReport {
  readonly ok: boolean;
  readonly targetEnvironment: 'sandbox' | 'production' | 'not validated';
  readonly plan?: SandboxCheckoutLaunchRequest['plan'];
  readonly packageId?: string;
  readonly checkoutHost?: string;
  readonly browser: CheckoutProbeStatus;
  readonly hostedCheckout: CheckoutProbeStatus;
  readonly paymentAttempted: 'NO';
  readonly failure?: CheckoutProbeError;
}

export interface CheckoutProbeOptions {
  readonly environment?: EnvironmentRecord;
  readonly argv?: readonly string[];
  readonly browserFactory: CheckoutProbeBrowserFactory;
  readonly timeoutMs?: number;
}

function targetEnvironment(value: string | undefined): CheckoutProbeReport['targetEnvironment'] {
  if (value === 'sandbox' || value === 'production') return value;
  return 'not validated';
}

function reportBase(
  environment: EnvironmentRecord,
  plan?: SandboxCheckoutLaunchRequest['plan'],
): CheckoutProbeReport {
  return {
    ok: false,
    targetEnvironment: targetEnvironment(environment.BILLING_AUTOMATION_ENV),
    ...(plan ? { plan } : {}),
    browser: 'NOT RUN',
    hostedCheckout: 'NOT RUN',
    paymentAttempted: 'NO',
  };
}

function configurationFailure(
  report: CheckoutProbeReport,
  code: CheckoutProbeErrorCode,
  message: string,
): CheckoutProbeReport {
  return { ...report, failure: { code, message } };
}

function browserFailure(
  report: CheckoutProbeReport,
  error: CheckoutProbeError,
): CheckoutProbeReport {
  return { ...report, failure: error };
}

function timeoutMilliseconds(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_CHECKOUT_PROBE_TIMEOUT_MS;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new CheckoutProbeBrowserError('BROWSER_TIMEOUT'));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function toProbeError(error: unknown): CheckoutProbeError {
  if (error instanceof CheckoutProbeBrowserError) {
    return { code: error.code, message: error.code };
  }
  return {
    code: 'SAFETY',
    message: 'The browser probe failed closed.',
  };
}

function observationIsSafe(observation: CheckoutProbeObservation): boolean {
  return (
    observation.topLevelOrigin === REVENUECAT_PURCHASE_LINK_ORIGIN &&
    observation.hostedCheckoutLoaded &&
    observation.stableInteractive
  );
}

export async function runCheckoutProbe(
  options: CheckoutProbeOptions,
): Promise<CheckoutProbeReport> {
  const environment = options.environment ?? process.env;
  const initial = reportBase(environment);
  const parsedPlan = parseCheckoutReadyPlan(options.argv ?? process.argv.slice(2));
  if (!parsedPlan.ok) {
    return configurationFailure(initial, parsedPlan.error.code, parsedPlan.error.message);
  }

  const report = reportBase(environment, parsedPlan.plan);
  if (environment.BILLING_AUTOMATION_MODE !== 'sandbox-checkout-probe') {
    return configurationFailure(
      report,
      'CONFIGURATION_INVALID',
      'BILLING_AUTOMATION_MODE must be sandbox-checkout-probe.',
    );
  }

  const loaded = loadBillingEnvironment(environment);
  if (loaded.issues.length > 0) {
    const issue = loaded.issues[0];
    return configurationFailure(
      report,
      'CONFIGURATION_INVALID',
      issue?.message ?? 'Billing configuration is invalid.',
    );
  }

  const userId = environment.BILLING_TEST_USER_ID?.trim();
  if (!userId) {
    return configurationFailure(report, 'USER_ID_MISSING', 'BILLING_TEST_USER_ID is required.');
  }

  const requestResult = buildSandboxCheckoutRequest({
    userId,
    plan: parsedPlan.plan,
    purchaseLinkBaseUrl: environment.BILLING_REVENUECAT_SANDBOX_PURCHASE_URL ?? '',
    targetEnvironment: environment.BILLING_AUTOMATION_ENV ?? '',
  });
  if (!requestResult.ok) {
    return configurationFailure(report, requestResult.error.code, requestResult.error.message);
  }

  let browser: CheckoutProbeBrowser | undefined;
  let session: CheckoutProbeSession | undefined;
  let result = report;
  let cleanupFailed = false;

  try {
    browser = options.browserFactory();
    result = {
      ...report,
      packageId: requestResult.request.packageId,
      checkoutHost: REVENUECAT_PURCHASE_LINK_HOST,
      browser: 'FAIL',
    };

    const observation = await withTimeout(
      (async () => {
        session = await browser.openCheckout(requestResult.request);
        result = { ...result, browser: 'PASS', hostedCheckout: 'FAIL' };
        return session.observeCheckout();
      })(),
      timeoutMilliseconds(options.timeoutMs),
    );

    if (!observationIsSafe(observation)) {
      throw new CheckoutProbeBrowserError(
        observation.topLevelOrigin === REVENUECAT_PURCHASE_LINK_ORIGIN
          ? 'CHECKOUT_LOAD_FAILED'
          : 'CHECKOUT_ORIGIN_MISMATCH',
      );
    }

    result = { ...result, ok: true, hostedCheckout: 'PASS' };
  } catch (error: unknown) {
    result = browserFailure(result ?? report, toProbeError(error));
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
    return browserFailure(
      { ...result, ok: false },
      { code: 'SAFETY', message: 'The browser probe cleanup failed closed.' },
    );
  }

  return result;
}

export function formatCheckoutProbeReport(report: CheckoutProbeReport): string {
  const lines = [
    'RevenueCat sandbox checkout probe',
    '',
    `Target....................... ${report.targetEnvironment}`,
    `Plan......................... ${report.plan ?? 'not validated'}`,
    `Package...................... ${report.packageId ?? 'not validated'}`,
    `Checkout host................ ${report.checkoutHost ? `PASS (${report.checkoutHost})` : 'NOT RUN'}`,
    `Browser...................... ${report.browser}`,
    `Hosted checkout.............. ${report.hostedCheckout}`,
    'Payment attempted............ NO',
  ];

  if (report.failure) {
    lines.push(`Failure....................... ${report.failure.code}: ${report.failure.message}`);
  }
  lines.push('', `Result: ${report.ok ? 'PASS' : 'FAIL'}`);
  return lines.join('\n');
}
