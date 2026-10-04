import { uuidSchema } from '@cal/schemas';
import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';
import { z } from 'zod';

import { env, isDevelopment } from '../../../lib/env';

/**
 * The only file that talks to the RevenueCat SDK.
 *
 * The SDK is a store client, not an authority: what it says about the
 * customer is used to drive the purchase sheet and for display, while Pro
 * itself is decided by the server's mirror (see `billing.api.ts`).
 */

/** The offering this app sells from; the web sells from `bplan_web`. */
export const IOS_OFFERING_ID = 'bplan_ios';
/** The entitlement the server gates on. */
const PRO_ENTITLEMENT = 'pro';

/** Serialises identity changes so a purchase never runs mid-switch. */
let identity: Promise<void> = Promise.resolve();

/** Whether this build can sell at all: iOS, with a RevenueCat key. */
export function isPurchasingSupported(): boolean {
  return Platform.OS === 'ios' && env.revenueCatIosKey !== undefined;
}

/**
 * Point RevenueCat at the signed-in account. The app user ID must be the
 * Supabase user ID — the same one web checkout uses — or the webhook cannot
 * attach the purchase to the account. Safe to call repeatedly.
 */
export function identifyPurchaser(userId: string): Promise<void> {
  const appUserID = uuidSchema.parse(userId);
  identity = identity.catch(() => undefined).then(() => switchTo(appUserID));
  return identity;
}

async function switchTo(appUserID: string): Promise<void> {
  const apiKey = env.revenueCatIosKey;
  if (!isPurchasingSupported() || apiKey === undefined) return;

  // Asks the SDK rather than a module flag: a JS reload resets module state,
  // but the native SDK stays configured.
  if (!(await Purchases.isConfigured())) {
    if (isDevelopment) void Purchases.setLogLevel(LOG_LEVEL.WARN);
    // Configuring with the ID up front avoids creating an anonymous customer
    // that would then have to be merged.
    Purchases.configure({ apiKey, appUserID });
    return;
  }
  if ((await Purchases.getAppUserID()) !== appUserID) await Purchases.logIn(appUserID);
}

/** Detach the store client from the account that just signed out. */
export function forgetPurchaser(): Promise<void> {
  identity = identity
    .catch(() => undefined)
    .then(async () => {
      if (!(await Purchases.isConfigured()) || (await Purchases.isAnonymous())) return;
      await Purchases.logOut();
    });
  return identity;
}

const storeProductSchema = z.object({
  identifier: z.string().min(1),
  price: z.number().nonnegative(),
  priceString: z.string().min(1),
  currencyCode: z.string().length(3),
});

/** One plan as the store sells it, with its price in the buyer's currency. */
export interface StorePlan {
  productId: string;
  price: number;
  priceString: string;
  currencyCode: string;
  /** The SDK's own object, handed back unchanged to buy this plan. */
  sdkPackage: PurchasesPackage;
}

export interface StorePlans {
  monthly: StorePlan | null;
  annual: StorePlan | null;
}

/** The iOS plans, or null when the offering is missing from RevenueCat. */
export async function fetchStorePlans(userId: string): Promise<StorePlans | null> {
  await identifyPurchaser(userId);
  if (!isPurchasingSupported()) return null;
  const offerings = await Purchases.getOfferings();
  // Asked for by name: the project's "current" offering is a leftover default
  // whose products unlock a different entitlement.
  const offering = offerings.all[IOS_OFFERING_ID];
  if (!offering) return null;
  return {
    monthly: offering.monthly ? toStorePlan(offering.monthly) : null,
    annual: offering.annual ? toStorePlan(offering.annual) : null,
  };
}

function toStorePlan(sdkPackage: PurchasesPackage): StorePlan {
  const product = storeProductSchema.parse(sdkPackage.product);
  return {
    productId: product.identifier,
    price: product.price,
    priceString: product.priceString,
    currencyCode: product.currencyCode,
    sdkPackage,
  };
}

/**
 * Open the store's payment sheet. Resolves when the store takes payment;
 * rejects with the SDK's error otherwise (see `classifyPurchaseError`).
 */
export async function purchaseStorePlan(userId: string, plan: StorePlan): Promise<void> {
  await identifyPurchaser(userId);
  await Purchases.purchasePackage(plan.sdkPackage);
}

/**
 * Ask the store for anything this Apple ID already bought. True when the
 * store reports Pro afterwards — a hint for the message shown, not access.
 */
export async function restoreStorePurchases(userId: string): Promise<boolean> {
  await identifyPurchaser(userId);
  if (!isPurchasingSupported()) return false;
  const info = await Purchases.restorePurchases();
  return hasStorePro(info);
}

/**
 * Where to manage the subscription: the App Store for an Apple purchase, the
 * web billing portal for a web one. Null when there is nothing to manage.
 */
export async function fetchManagementUrl(userId: string): Promise<string | null> {
  await identifyPurchaser(userId);
  if (!isPurchasingSupported()) return null;
  const info = await Purchases.getCustomerInfo();
  return z.string().url().nullable().catch(null).parse(info.managementURL);
}

function hasStorePro(info: CustomerInfo): boolean {
  return info.entitlements.active[PRO_ENTITLEMENT]?.isActive === true;
}
