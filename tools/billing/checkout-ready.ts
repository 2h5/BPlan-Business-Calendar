import { z } from 'zod';

import { isBillingUserId, type EnvironmentRecord } from './config';
import {
  BILLING_CONTRACT,
  REVENUECAT_PURCHASE_LINK_HOST,
  REVENUECAT_SANDBOX_PURCHASE_LINK_PATH,
  type BillingPlan,
} from './contract';

const billingPlanSchema = z.enum(['monthly', 'annual']);
const billingUserIdSchema = z.string().refine(isBillingUserId);
const sandboxTargetSchema = z.literal('sandbox');
const purchaseLinkUrlSchema = z.string().url();

/** Fixed, non-deliverable identity hint for RevenueCat sandbox checkout only. */
export const SANDBOX_CHECKOUT_TEST_EMAIL = 'bcalai-billing-sandbox@example.com';

export type CheckoutReadyErrorCode =
  | 'ARGUMENT_INVALID'
  | 'PLAN_INVALID'
  | 'PRODUCTION_TARGET_FORBIDDEN'
  | 'PURCHASE_URL_INVALID'
  | 'PURCHASE_URL_MISSING'
  | 'TARGET_INVALID'
  | 'USER_ID_INVALID'
  | 'USER_ID_MISSING';

export interface CheckoutReadyError {
  readonly code: CheckoutReadyErrorCode;
  readonly message: string;
}

/** Internal handoff contract for the separately reviewed Phase 3B browser runner. */
export interface SandboxCheckoutLaunchRequest {
  readonly targetEnvironment: 'sandbox';
  readonly userId: string;
  readonly plan: BillingPlan;
  readonly productId: string;
  readonly packageId: string;
  readonly checkoutHost: typeof REVENUECAT_PURCHASE_LINK_HOST;
  readonly url: string;
}

export type CheckoutReadyBuildResult =
  | { readonly ok: true; readonly request: SandboxCheckoutLaunchRequest }
  | { readonly ok: false; readonly error: CheckoutReadyError };

export interface CheckoutReadyReport {
  readonly ok: boolean;
  readonly plan?: BillingPlan;
  readonly packageId?: string;
  readonly checkoutHost?: string;
  readonly failure?: CheckoutReadyError;
}

export interface CheckoutReadyOptions {
  readonly environment?: EnvironmentRecord;
  readonly argv?: readonly string[];
}

function failure(code: CheckoutReadyErrorCode, message: string): CheckoutReadyBuildResult {
  return { ok: false, error: { code, message } };
}

export function parseCheckoutReadyPlan(
  argv: readonly string[],
):
  | { readonly ok: true; readonly plan: BillingPlan }
  | { readonly ok: false; readonly error: CheckoutReadyError } {
  if (argv.length !== 2 || argv[0] !== '--plan') {
    return {
      ok: false,
      error: {
        code: 'ARGUMENT_INVALID',
        message: 'Use exactly --plan monthly or --plan annual.',
      },
    };
  }

  const parsed = billingPlanSchema.safeParse(argv[1]);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'PLAN_INVALID', message: 'Plan must be monthly or annual.' },
    };
  }
  return { ok: true, plan: parsed.data };
}

export function buildSandboxCheckoutRequest(input: {
  readonly userId: string;
  readonly plan: BillingPlan;
  readonly purchaseLinkBaseUrl: string;
  readonly targetEnvironment: string;
}): CheckoutReadyBuildResult {
  if (input.targetEnvironment === 'production') {
    return failure('PRODUCTION_TARGET_FORBIDDEN', 'Checkout readiness is sandbox-only.');
  }
  if (!sandboxTargetSchema.safeParse(input.targetEnvironment).success) {
    return failure('TARGET_INVALID', 'BILLING_AUTOMATION_ENV must be explicitly set to sandbox.');
  }
  if (!billingUserIdSchema.safeParse(input.userId).success) {
    return failure('USER_ID_INVALID', 'BILLING_TEST_USER_ID must be a UUID.');
  }
  if (!input.purchaseLinkBaseUrl.trim()) {
    return failure('PURCHASE_URL_MISSING', 'BILLING_REVENUECAT_SANDBOX_PURCHASE_URL is required.');
  }

  const parsedUrl = purchaseLinkUrlSchema.safeParse(input.purchaseLinkBaseUrl);
  if (!parsedUrl.success) {
    return failure('PURCHASE_URL_INVALID', 'The sandbox purchase URL is malformed.');
  }
  const url = new URL(parsedUrl.data);

  const pathSegments = url.pathname.split('/');
  const hasSingleTrailingSlash = pathSegments.length === 4 && pathSegments[3] === '';
  const normalizedPathSegments = hasSingleTrailingSlash ? pathSegments.slice(0, -1) : pathSegments;
  const hasAmbiguousPathSeparator =
    url.pathname.includes('\\') ||
    pathSegments.some((segment) => {
      try {
        const decodedSegment = decodeURIComponent(segment);
        return decodedSegment.includes('/') || decodedSegment.includes('\\');
      } catch {
        return true;
      }
    });
  const baseContainsUserId = pathSegments.some((segment) => {
    try {
      return decodeURIComponent(segment).toLowerCase().includes(input.userId.toLowerCase());
    } catch {
      return false;
    }
  });
  if (
    url.protocol !== 'https:' ||
    url.hostname !== REVENUECAT_PURCHASE_LINK_HOST ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    url.search !== '' ||
    normalizedPathSegments.length !== 3 ||
    normalizedPathSegments[0] !== '' ||
    normalizedPathSegments[1] !== REVENUECAT_SANDBOX_PURCHASE_LINK_PATH ||
    normalizedPathSegments[2] === '' ||
    hasAmbiguousPathSeparator ||
    baseContainsUserId
  ) {
    return failure(
      'PURCHASE_URL_INVALID',
      `The sandbox purchase URL must use the approved ${REVENUECAT_PURCHASE_LINK_HOST} sandbox link shape.`,
    );
  }

  const packageId = BILLING_CONTRACT.offering.packages[input.plan];
  const productId = BILLING_CONTRACT.products[input.plan].id;
  url.pathname = `${normalizedPathSegments.join('/')}/${encodeURIComponent(input.userId)}`;
  url.searchParams.set('package_id', packageId);
  url.searchParams.set('email', SANDBOX_CHECKOUT_TEST_EMAIL);

  return {
    ok: true,
    request: {
      targetEnvironment: 'sandbox',
      userId: input.userId,
      plan: input.plan,
      productId,
      packageId,
      checkoutHost: REVENUECAT_PURCHASE_LINK_HOST,
      url: url.toString(),
    },
  };
}

export function runCheckoutReady(options: CheckoutReadyOptions = {}): CheckoutReadyReport {
  const environment = options.environment ?? process.env;
  const parsedPlan = parseCheckoutReadyPlan(options.argv ?? process.argv.slice(2));
  if (!parsedPlan.ok) return { ok: false, failure: parsedPlan.error };

  const userId = environment.BILLING_TEST_USER_ID?.trim();
  if (!userId) {
    return {
      ok: false,
      plan: parsedPlan.plan,
      failure: { code: 'USER_ID_MISSING', message: 'BILLING_TEST_USER_ID is required.' },
    };
  }

  const result = buildSandboxCheckoutRequest({
    userId,
    plan: parsedPlan.plan,
    purchaseLinkBaseUrl: environment.BILLING_REVENUECAT_SANDBOX_PURCHASE_URL ?? '',
    targetEnvironment: environment.BILLING_AUTOMATION_ENV ?? '',
  });
  if (!result.ok) return { ok: false, plan: parsedPlan.plan, failure: result.error };

  return {
    ok: true,
    plan: result.request.plan,
    packageId: result.request.packageId,
    checkoutHost: result.request.checkoutHost,
  };
}

export function formatCheckoutReadyReport(report: CheckoutReadyReport): string {
  const lines = ['RevenueCat sandbox checkout readiness', ''];
  lines.push(`User UUID.................. ${report.ok ? 'valid' : 'not ready'}`);
  lines.push('Target..................... sandbox');
  if (report.plan) lines.push(`Plan........................ ${report.plan}`);
  if (report.packageId) lines.push(`Package..................... ${report.packageId}`);
  if (report.checkoutHost) lines.push(`Checkout host............... PASS (${report.checkoutHost})`);
  lines.push(`Identified checkout......... ${report.ok ? 'PASS' : 'FAIL'}`);
  if (report.failure)
    lines.push(`Failure..................... ${report.failure.code}: ${report.failure.message}`);
  lines.push('');
  lines.push(`Result: ${report.ok ? 'READY' : 'FAIL'}`);
  return lines.join('\n');
}
