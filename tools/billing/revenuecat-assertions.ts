import { z } from 'zod';

import { assertionFailure, type BillingAssertionResult } from './assertion-types';
import { BILLING_CONTRACT } from './contract';
import {
  checkRevenueCatCliVersion,
  discoverBPlanProject,
  runRevenueCatCli,
  type RevenueCatCliErrorInfo,
  type RevenueCatCliRunner,
  type RevenueCatProjectId,
} from './revenuecat-cli';

const identifierSchema = z.string().min(1);
const epochMillisSchema = z.number().int().nonnegative();
const nullableEpochMillisSchema = epochMillisSchema.nullable();

const entitlementSchema = z.object({
  id: identifierSchema,
  lookup_key: identifierSchema,
});

const entitlementListSchema = z.object({
  items: z.array(entitlementSchema),
  next_page: z.string().nullable().optional(),
});

const customerEntitlementSchema = z.object({
  entitlement_id: identifierSchema,
  expires_at: nullableEpochMillisSchema,
});

const customerSchema = z.object({
  id: identifierSchema,
  project_id: identifierSchema,
  active_entitlements: z.object({
    items: z.array(customerEntitlementSchema),
    next_page: z.string().nullable().optional(),
  }),
});

const subscriptionSchema = z.object({
  id: identifierSchema,
  customer_id: identifierSchema,
  original_customer_id: identifierSchema,
  product_id: identifierSchema.nullable(),
  store: identifierSchema,
  environment: identifierSchema,
  status: identifierSchema,
  gives_access: z.boolean(),
  current_period_starts_at: epochMillisSchema.optional(),
  current_period_ends_at: nullableEpochMillisSchema,
  ends_at: nullableEpochMillisSchema.optional(),
  auto_renewal_status: identifierSchema.optional(),
  entitlements: entitlementListSchema,
});

const purchaseSchema = z.object({
  id: identifierSchema,
  customer_id: identifierSchema,
  original_customer_id: identifierSchema,
  product_id: identifierSchema,
  store: identifierSchema,
  environment: identifierSchema,
  status: identifierSchema,
  purchased_at: epochMillisSchema,
  entitlements: entitlementListSchema,
});

const listEnvelope = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.object({
      items: z.array(item),
      next_page: z.string().nullable().optional(),
    }),
  });

const customerProfileEnvelopeSchema = z.object({
  data: z.object({
    customer: customerSchema,
    subscriptions: z.object({
      items: z.array(subscriptionSchema),
      next_page: z.string().nullable().optional(),
    }),
    purchases: z.object({
      items: z.array(purchaseSchema),
      next_page: z.string().nullable().optional(),
    }),
    subscriptions_error: z.string().optional(),
    purchases_error: z.string().optional(),
  }),
});

const subscriptionEnvelopeSchema = z.object({ data: subscriptionSchema });
const purchaseEnvelopeSchema = z.object({ data: purchaseSchema });
const productEnvelopeSchema = z.object({
  data: z.object({
    id: identifierSchema,
    object: z.literal('product'),
    store_identifier: identifierSchema,
  }),
});

export interface RevenueCatSubscriptionEvidence {
  readonly id: string;
  /** RevenueCat Product resource ID, as returned by subscription.product_id. */
  readonly productId: string | null;
  readonly storeIdentifier: string | null;
  readonly store: string;
  readonly environment: 'sandbox';
  readonly status: string;
  readonly givesAccess: boolean;
  readonly currentPeriodStartsAt: number | null;
  readonly currentPeriodEndsAt: number | null;
  readonly endsAt: number | null;
  readonly autoRenewalStatus: string | null;
  readonly grantsPro: boolean;
}

export interface RevenueCatPurchaseEvidence {
  readonly id: string;
  /** RevenueCat Product resource ID, as returned by purchase.product_id. */
  readonly productId: string;
  readonly storeIdentifier: string;
  readonly store: string;
  readonly environment: 'sandbox';
  readonly status: string;
  readonly purchasedAt: number;
  readonly grantsPro: boolean;
}

export interface RevenueCatUserSnapshot {
  readonly projectId: string;
  readonly customerExists: boolean;
  readonly customerId: string;
  readonly activePro: boolean;
  readonly subscriptions: readonly RevenueCatSubscriptionEvidence[];
  readonly purchases: readonly RevenueCatPurchaseEvidence[];
}

export interface RevenueCatAssertionAdapter {
  readUser(userId: string): Promise<BillingAssertionResult<RevenueCatUserSnapshot>>;
}

export interface RevenueCatAssertionAdapterOptions {
  readonly apiKey: string;
  readonly runner?: RevenueCatCliRunner;
  readonly parentEnvironment?: Readonly<Record<string, string | undefined>>;
  readonly now?: () => Date;
}

function cliFailure<T>(
  category:
    | 'CLI_VERSION'
    | 'REVENUECAT_PROJECT'
    | 'REVENUECAT_CUSTOMER'
    | 'REVENUECAT_ENTITLEMENT'
    | 'REVENUECAT_SUBSCRIPTION',
  error: RevenueCatCliErrorInfo,
): BillingAssertionResult<T> {
  return assertionFailure(category, error.code, error.message);
}

function malformed<T>(
  category: 'REVENUECAT_ENTITLEMENT' | 'REVENUECAT_CUSTOMER' | 'REVENUECAT_SUBSCRIPTION',
  resource: string,
): BillingAssertionResult<T> {
  return assertionFailure(
    category,
    'REVENUECAT_RESPONSE_MALFORMED',
    `RevenueCat ${resource} output was malformed.`,
  );
}

function hasNextPage(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.length > 0;
}

function assertCompletePage<T>(
  category: 'REVENUECAT_ENTITLEMENT' | 'REVENUECAT_CUSTOMER' | 'REVENUECAT_SUBSCRIPTION',
  nextPage: string | null | undefined,
  resource: string,
): BillingAssertionResult<T> | undefined {
  return hasNextPage(nextPage)
    ? assertionFailure(
        category,
        'REVENUECAT_PAGINATION_UNSUPPORTED',
        `RevenueCat ${resource} output requires pagination that the approved named command does not expose.`,
      )
    : undefined;
}

function isSandbox(value: string): boolean {
  return value.toLowerCase() === 'sandbox';
}

function grantsEntitlement(
  entitlements: z.infer<typeof entitlementListSchema>,
  entitlementId: string,
): boolean {
  return entitlements.items.some(
    (entitlement) =>
      entitlement.id === entitlementId && entitlement.lookup_key === BILLING_CONTRACT.entitlement,
  );
}

function sameSubscription(
  left: z.infer<typeof subscriptionSchema>,
  right: z.infer<typeof subscriptionSchema>,
): boolean {
  return (
    left.id === right.id &&
    left.customer_id === right.customer_id &&
    left.environment === right.environment &&
    left.status === right.status &&
    left.gives_access === right.gives_access &&
    left.product_id === right.product_id
  );
}

function samePurchase(
  left: z.infer<typeof purchaseSchema>,
  right: z.infer<typeof purchaseSchema>,
): boolean {
  return (
    left.id === right.id &&
    left.customer_id === right.customer_id &&
    left.environment === right.environment &&
    left.status === right.status &&
    left.product_id === right.product_id
  );
}

async function readCli(
  operation: Parameters<typeof runRevenueCatCli>[0],
  options: RevenueCatAssertionAdapterOptions,
) {
  return runRevenueCatCli(operation, {
    apiKey: options.apiKey,
    runner: options.runner,
    parentEnvironment: options.parentEnvironment,
  });
}

async function readEntitlementId(
  projectId: RevenueCatProjectId,
  options: RevenueCatAssertionAdapterOptions,
): Promise<BillingAssertionResult<string>> {
  const result = await readCli({ kind: 'entitlements-list', projectId }, options);
  if (!result.ok) return cliFailure('REVENUECAT_ENTITLEMENT', result.error);
  const parsed = listEnvelope(entitlementSchema).safeParse(result.data);
  if (!parsed.success) return malformed('REVENUECAT_ENTITLEMENT', 'entitlement-list');
  const pageFailure = assertCompletePage<string>(
    'REVENUECAT_ENTITLEMENT',
    parsed.data.data.next_page,
    'entitlement-list',
  );
  if (pageFailure) return pageFailure;

  const matches = parsed.data.data.items.filter(
    (entitlement) => entitlement.lookup_key === BILLING_CONTRACT.entitlement,
  );
  if (matches.length !== 1) {
    return assertionFailure(
      'REVENUECAT_ENTITLEMENT',
      matches.length === 0
        ? 'REVENUECAT_PRO_ENTITLEMENT_NOT_FOUND'
        : 'REVENUECAT_PRO_ENTITLEMENT_DUPLICATE',
      `RevenueCat must contain exactly one ${BILLING_CONTRACT.entitlement} entitlement.`,
    );
  }
  return { ok: true, data: matches[0]?.id ?? '' };
}

async function followSubscriptions(
  projectId: RevenueCatProjectId,
  userId: string,
  embedded: readonly z.infer<typeof subscriptionSchema>[],
  proEntitlementId: string,
  options: RevenueCatAssertionAdapterOptions,
): Promise<BillingAssertionResult<readonly RevenueCatSubscriptionEvidence[]>> {
  const evidence: RevenueCatSubscriptionEvidence[] = [];
  for (const item of embedded) {
    const result = await readCli(
      { kind: 'subscriptions-show', projectId, subscriptionId: item.id },
      options,
    );
    if (!result.ok) return cliFailure('REVENUECAT_SUBSCRIPTION', result.error);
    const parsed = subscriptionEnvelopeSchema.safeParse(result.data);
    if (!parsed.success) return malformed('REVENUECAT_SUBSCRIPTION', 'subscription');
    const subscription = parsed.data.data;
    if (!sameSubscription(item, subscription) || subscription.customer_id !== userId) {
      return assertionFailure(
        'REVENUECAT_SUBSCRIPTION',
        'REVENUECAT_SUBSCRIPTION_IDENTITY_MISMATCH',
        'RevenueCat subscription identity changed between reads.',
      );
    }
    const pageFailure = assertCompletePage<readonly RevenueCatSubscriptionEvidence[]>(
      'REVENUECAT_SUBSCRIPTION',
      subscription.entitlements.next_page,
      'subscription-entitlements',
    );
    if (pageFailure) return pageFailure;
    if (!isSandbox(subscription.environment)) {
      return assertionFailure(
        'SAFETY',
        'REVENUECAT_PRODUCTION_STATE',
        'RevenueCat returned production subscription state for the sandbox assertion.',
      );
    }
    evidence.push({
      id: subscription.id,
      productId: subscription.product_id,
      storeIdentifier: null,
      store: subscription.store,
      environment: 'sandbox',
      status: subscription.status,
      givesAccess: subscription.gives_access,
      currentPeriodStartsAt: subscription.current_period_starts_at ?? null,
      currentPeriodEndsAt: subscription.current_period_ends_at,
      endsAt: subscription.ends_at ?? null,
      autoRenewalStatus: subscription.auto_renewal_status ?? null,
      grantsPro: grantsEntitlement(subscription.entitlements, proEntitlementId),
    });
  }
  return { ok: true, data: evidence };
}

async function followPurchases(
  projectId: RevenueCatProjectId,
  userId: string,
  embedded: readonly z.infer<typeof purchaseSchema>[],
  proEntitlementId: string,
  options: RevenueCatAssertionAdapterOptions,
): Promise<BillingAssertionResult<readonly RevenueCatPurchaseEvidence[]>> {
  const evidence: RevenueCatPurchaseEvidence[] = [];
  for (const item of embedded) {
    const result = await readCli(
      { kind: 'purchases-show', projectId, purchaseId: item.id },
      options,
    );
    if (!result.ok) return cliFailure('REVENUECAT_SUBSCRIPTION', result.error);
    const parsed = purchaseEnvelopeSchema.safeParse(result.data);
    if (!parsed.success) return malformed('REVENUECAT_SUBSCRIPTION', 'purchase');
    const purchase = parsed.data.data;
    if (!samePurchase(item, purchase) || purchase.customer_id !== userId) {
      return assertionFailure(
        'REVENUECAT_SUBSCRIPTION',
        'REVENUECAT_PURCHASE_IDENTITY_MISMATCH',
        'RevenueCat purchase identity changed between reads.',
      );
    }
    const pageFailure = assertCompletePage<readonly RevenueCatPurchaseEvidence[]>(
      'REVENUECAT_SUBSCRIPTION',
      purchase.entitlements.next_page,
      'purchase-entitlements',
    );
    if (pageFailure) return pageFailure;
    if (!isSandbox(purchase.environment)) {
      return assertionFailure(
        'SAFETY',
        'REVENUECAT_PRODUCTION_STATE',
        'RevenueCat returned production purchase state for the sandbox assertion.',
      );
    }
    evidence.push({
      id: purchase.id,
      productId: purchase.product_id,
      storeIdentifier: '',
      store: purchase.store,
      environment: 'sandbox',
      status: purchase.status,
      purchasedAt: purchase.purchased_at,
      grantsPro: grantsEntitlement(purchase.entitlements, proEntitlementId),
    });
  }
  return { ok: true, data: evidence };
}

async function resolveProducts(
  projectId: RevenueCatProjectId,
  subscriptions: readonly RevenueCatSubscriptionEvidence[],
  purchases: readonly RevenueCatPurchaseEvidence[],
  options: RevenueCatAssertionAdapterOptions,
): Promise<
  BillingAssertionResult<{
    subscriptions: readonly RevenueCatSubscriptionEvidence[];
    purchases: readonly RevenueCatPurchaseEvidence[];
  }>
> {
  const ids = new Set<string>();
  for (const item of subscriptions) if (item.productId !== null) ids.add(item.productId);
  for (const item of purchases) ids.add(item.productId);
  const storeById = new Map<string, string>();
  const idByStore = new Map<string, string>();
  for (const productId of ids) {
    const result = await readCli({ kind: 'products-show', projectId, productId }, options);
    if (!result.ok) return cliFailure('REVENUECAT_SUBSCRIPTION', result.error);
    const parsed = productEnvelopeSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.data.id !== productId) {
      return malformed('REVENUECAT_SUBSCRIPTION', 'product');
    }
    const storeIdentifier = parsed.data.data.store_identifier;
    const existingId = idByStore.get(storeIdentifier);
    if (existingId !== undefined && existingId !== productId) {
      return assertionFailure(
        'REVENUECAT_SUBSCRIPTION',
        'REVENUECAT_PRODUCT_MAPPING_AMBIGUOUS',
        'RevenueCat returned multiple Product resources for one store identifier.',
      );
    }
    storeById.set(productId, storeIdentifier);
    idByStore.set(storeIdentifier, productId);
  }
  return {
    ok: true,
    data: {
      subscriptions: subscriptions.map((item) => ({
        ...item,
        storeIdentifier: item.productId === null ? null : (storeById.get(item.productId) ?? null),
      })),
      purchases: purchases.map((item) => ({
        ...item,
        storeIdentifier: storeById.get(item.productId) ?? '',
      })),
    },
  };
}

export function createRevenueCatAssertionAdapter(
  options: RevenueCatAssertionAdapterOptions,
): RevenueCatAssertionAdapter {
  return {
    async readUser(userId) {
      const version = await checkRevenueCatCliVersion({
        runner: options.runner,
        parentEnvironment: options.parentEnvironment,
      });
      if (!version.ok) return cliFailure('CLI_VERSION', version.error);

      const projects = await readCli({ kind: 'projects-list' }, options);
      if (!projects.ok) return cliFailure('REVENUECAT_PROJECT', projects.error);
      const discovery = discoverBPlanProject(projects.data);
      if (!discovery.ok) return cliFailure('REVENUECAT_PROJECT', discovery.error);
      const projectId = discovery.project.id;

      const entitlementId = await readEntitlementId(projectId, options);
      if (!entitlementId.ok) return entitlementId;

      const customerResult = await readCli(
        { kind: 'customers-show', projectId, customerId: userId },
        options,
      );
      if (!customerResult.ok) {
        if (customerResult.error.code === 'CLI_RESOURCE_NOT_FOUND') {
          return {
            ok: true,
            data: {
              projectId,
              customerExists: false,
              customerId: userId,
              activePro: false,
              subscriptions: [],
              purchases: [],
            },
          };
        }
        return cliFailure('REVENUECAT_CUSTOMER', customerResult.error);
      }

      const parsed = customerProfileEnvelopeSchema.safeParse(customerResult.data);
      if (!parsed.success) return malformed('REVENUECAT_CUSTOMER', 'customer');
      const profile = parsed.data.data;
      if (profile.subscriptions_error || profile.purchases_error) {
        return assertionFailure(
          'REVENUECAT_CUSTOMER',
          'REVENUECAT_CUSTOMER_PARTIAL',
          'RevenueCat returned an incomplete customer profile.',
        );
      }
      if (profile.customer.id !== userId || profile.customer.project_id !== projectId) {
        return assertionFailure(
          'REVENUECAT_CUSTOMER',
          'REVENUECAT_CUSTOMER_IDENTITY_MISMATCH',
          'RevenueCat customer identity did not match the explicit user and discovered project.',
        );
      }
      for (const [nextPage, resource] of [
        [profile.customer.active_entitlements.next_page, 'active-entitlements'],
        [profile.subscriptions.next_page, 'customer-subscriptions'],
        [profile.purchases.next_page, 'customer-purchases'],
      ] as const) {
        const pageFailure = assertCompletePage<RevenueCatUserSnapshot>(
          'REVENUECAT_CUSTOMER',
          nextPage,
          resource,
        );
        if (pageFailure) return pageFailure;
      }

      const subscriptions = await followSubscriptions(
        projectId,
        userId,
        profile.subscriptions.items,
        entitlementId.data,
        options,
      );
      if (!subscriptions.ok) return subscriptions;
      const purchases = await followPurchases(
        projectId,
        userId,
        profile.purchases.items,
        entitlementId.data,
        options,
      );
      if (!purchases.ok) return purchases;
      const products = await resolveProducts(
        projectId,
        subscriptions.data,
        purchases.data,
        options,
      );
      if (!products.ok) return products;

      const nowMillis = (options.now ?? (() => new Date()))().getTime();
      const activePro = profile.customer.active_entitlements.items.some(
        (entitlement) =>
          entitlement.entitlement_id === entitlementId.data &&
          (entitlement.expires_at === null || entitlement.expires_at > nowMillis),
      );

      return {
        ok: true,
        data: {
          projectId,
          customerExists: true,
          customerId: profile.customer.id,
          activePro,
          subscriptions: products.data.subscriptions,
          purchases: products.data.purchases,
        },
      };
    },
  };
}
