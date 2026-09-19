import {
  chromium,
  type Browser,
  type BrowserContext,
  type Frame,
  type Locator,
  type Page,
} from 'playwright-core';

import type { SandboxCheckoutLaunchRequest } from './checkout-ready';
import {
  REVENUECAT_PURCHASE_LINK_HOST,
  REVENUECAT_PURCHASE_LINK_ORIGIN,
  STRIPE_PAYMENT_FRAME_HOSTS,
} from './contract';
import { STRIPE_SANDBOX_PAYMENT_FIXTURE } from './sandbox-payment-fixture';
import {
  SandboxPurchaseBrowserError,
  type SandboxPurchaseBrowser,
  type SandboxSubmissionObservation,
  type SandboxSubmissionState,
  type SandboxPurchaseSession,
  type SandboxValidationCategory,
} from './sandbox-purchase-browser';

export interface PlaywrightSandboxPurchaseOptions {
  readonly executablePath: string;
  readonly timeoutMs?: number;
}

function origin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function isStripeFrame(frame: Frame): boolean {
  try {
    const url = new URL(frame.url());
    return (
      url.protocol === 'https:' &&
      STRIPE_PAYMENT_FRAME_HOSTS.some((allowed) => url.hostname === allowed)
    );
  } catch {
    return false;
  }
}

async function firstVisible(locators: readonly Locator[]): Promise<Locator | undefined> {
  for (const locator of locators) {
    if ((await locator.count()) > 0 && (await locator.first().isVisible())) return locator.first();
  }
  return undefined;
}

async function isVisible(locator: Locator): Promise<boolean> {
  try {
    return (await locator.count()) > 0 && (await locator.first().isVisible());
  } catch {
    return false;
  }
}

async function hasUncheckedVisible(locators: readonly Locator[]): Promise<boolean> {
  for (const locator of locators) {
    try {
      if ((await locator.count()) > 0 && (await locator.first().isVisible())) {
        if (!(await locator.first().isChecked())) return true;
      }
    } catch {
      // Unsupported checkbox semantics are handled by the remaining safe signals.
    }
  }
  return false;
}

export interface HostedSemanticSignals {
  readonly validationBlocked: boolean;
  readonly processing: boolean;
  readonly success: boolean;
  readonly rejected: boolean;
}

export interface TopLevelRequirementSignals {
  readonly emailRequired: boolean;
  readonly requiredCheckboxUnsatisfied: boolean;
  readonly otherRequiredField: boolean;
}

export function classifyTopLevelRequirement(
  signals: TopLevelRequirementSignals,
): SandboxValidationCategory {
  if (signals.emailRequired) return 'EMAIL_REQUIRED';
  if (signals.requiredCheckboxUnsatisfied) return 'REQUIRED_CHECKBOX_UNSATISFIED';
  if (signals.otherRequiredField) return 'OTHER_REQUIRED_FIELD';
  return 'UNKNOWN_REQUIRED_FIELD';
}

export function classifyHostedSemanticSignals(
  signals: HostedSemanticSignals,
): SandboxSubmissionState {
  if (signals.success) return 'success';
  if (signals.rejected) return 'rejected';
  if (signals.validationBlocked && signals.processing) return 'unknown';
  if (signals.validationBlocked) return 'validation-blocked';
  if (signals.processing) return 'processing';
  return 'unknown';
}

async function readHostedSemanticSignals(page: Page): Promise<HostedSemanticSignals> {
  const stripeFrames = page.frames().filter(isStripeFrame);
  const pageValidation = [
    page.locator('input:invalid, select:invalid, textarea:invalid'),
    page.locator('[aria-invalid="true"]'),
    page
      .getByRole('alert')
      .filter({ hasText: /required|missing|invalid|incomplete|agree|accept|check/i }),
  ];
  const stripeValidation = stripeFrames.flatMap((frame) => [
    frame.locator('input:invalid, select:invalid, textarea:invalid'),
    frame.locator('[aria-invalid="true"]'),
    frame.getByRole('alert').filter({ hasText: /required|missing|invalid|incomplete/i }),
  ]);
  const success = page
    .getByRole('heading', { name: /success|subscription.*active|thank you/i })
    .or(page.getByRole('status').filter({ hasText: /success|subscription.*active|thank you/i }))
    .or(
      page
        .locator('[aria-live="polite"], [aria-live="assertive"]')
        .filter({ hasText: /success|subscription.*active|thank you/i }),
    );
  const rejected = page
    .getByRole('alert')
    .filter({ hasText: /declined|payment.*failed|purchase.*failed|not completed/i })
    .or(
      page
        .locator('[aria-live="polite"], [aria-live="assertive"]')
        .filter({ hasText: /declined|payment.*failed|purchase.*failed|not completed/i }),
    );
  const processing = page
    .getByRole('progressbar')
    .or(page.locator('[aria-busy="true"]'))
    .or(page.getByRole('status').filter({ hasText: /processing|confirming|submitting/i }))
    .or(page.getByRole('button', { name: /processing|confirming|submitting/i }));

  return {
    validationBlocked: await anyVisible([...pageValidation, ...stripeValidation]),
    processing: await isVisible(processing),
    success: await isVisible(success),
    rejected: await isVisible(rejected),
  };
}

async function readTopLevelValidationCategory(page: Page): Promise<SandboxValidationCategory> {
  const emailRequired = await anyVisible([
    page.locator('input[type="email"]:invalid'),
    page.locator('input[autocomplete="email"]:invalid'),
    page.getByRole('alert').filter({ hasText: /email.*(?:required|missing|invalid)/i }),
  ]);
  const requiredCheckboxUnsatisfied =
    (await hasUncheckedVisible([
      page.locator('input[type="checkbox"]:required'),
      page.locator('[role="checkbox"][aria-required="true"]'),
      page.getByRole('checkbox', { name: /agree|accept|terms|privacy/i }),
    ])) ||
    (await isVisible(
      page
        .getByRole('alert')
        .filter({ hasText: /(?:agree|accept|check).*(?:required|terms|privacy)/i }),
    ));
  const otherRequiredField = await anyVisible([
    page.locator(
      'input:invalid:not([type="email"]):not([type="checkbox"]), select:invalid, textarea:invalid',
    ),
    page.locator('[aria-invalid="true"]:not([type="email"])'),
    page.getByRole('alert').filter({ hasText: /required|missing|invalid|incomplete/i }),
  ]);
  return classifyTopLevelRequirement({
    emailRequired,
    requiredCheckboxUnsatisfied,
    otherRequiredField,
  });
}

async function anyVisible(locators: readonly Locator[]): Promise<boolean> {
  for (const locator of locators) {
    if (await isVisible(locator)) return true;
  }
  return false;
}

async function observeSubmissionState(
  page: Page,
  timeoutMs: number,
  stopOnProcessing: boolean,
): Promise<SandboxSubmissionState> {
  const deadline = Date.now() + timeoutMs;
  do {
    assertRevenueCatTopLevel(page);
    const state = classifyHostedSemanticSignals(await readHostedSemanticSignals(page));
    if (
      state === 'success' ||
      state === 'rejected' ||
      state === 'validation-blocked' ||
      (stopOnProcessing && state === 'processing')
    ) {
      return state;
    }
    await page.waitForTimeout(100);
  } while (Date.now() < deadline);
  return 'unknown';
}

async function paymentField(
  frames: readonly Frame[],
  labels: readonly RegExp[],
  inputNames: readonly string[],
): Promise<Locator | undefined> {
  for (const frame of frames.filter(isStripeFrame)) {
    const candidates = [
      ...labels.map((label) => frame.getByLabel(label)),
      ...inputNames.map((name) => frame.locator(`input[name="${name}"]`)),
    ];
    const located = await firstVisible(candidates);
    if (located) return located;
  }
  return undefined;
}

async function waitForPaymentFields(
  page: Page,
  timeoutMs: number,
): Promise<readonly [Locator, Locator, Locator]> {
  const deadline = Date.now() + timeoutMs;
  do {
    const frames = page.frames();
    const number = await paymentField(frames, [/card number/i], ['number', 'cardnumber']);
    const expiry = await paymentField(
      frames,
      [/expiration date/i, /expiry/i],
      ['expiry', 'exp-date'],
    );
    const cvc = await paymentField(frames, [/security code/i, /cvc/i], ['cvc']);
    if (number && expiry && cvc) return [number, expiry, cvc];
    await page.waitForTimeout(100);
  } while (Date.now() < deadline);
  throw new SandboxPurchaseBrowserError('PAYMENT_FORM_UNAVAILABLE');
}

function assertRevenueCatTopLevel(page: Page): void {
  if (origin(page.url()) !== REVENUECAT_PURCHASE_LINK_ORIGIN) {
    throw new SandboxPurchaseBrowserError('SAFETY');
  }
}

export function createPlaywrightSandboxPurchaseBrowser(
  options: PlaywrightSandboxPurchaseOptions,
): SandboxPurchaseBrowser {
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let actionAttempted = false;
  let submissionConfirmed = false;

  async function closeContext(): Promise<void> {
    if (!context) return;
    try {
      await context.close();
    } catch {
      throw new SandboxPurchaseBrowserError('SAFETY');
    } finally {
      context = undefined;
      page = undefined;
    }
  }

  return {
    async openIdentifiedSandboxCheckout(
      request: SandboxCheckoutLaunchRequest,
    ): Promise<SandboxPurchaseSession> {
      if (
        request.targetEnvironment !== 'sandbox' ||
        request.checkoutHost !== REVENUECAT_PURCHASE_LINK_HOST ||
        origin(request.url) !== REVENUECAT_PURCHASE_LINK_ORIGIN
      ) {
        throw new SandboxPurchaseBrowserError('SAFETY');
      }

      try {
        browser = await chromium.launch({
          executablePath: options.executablePath,
          headless: true,
          timeout: options.timeoutMs,
        });
        context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' });
        page = await context.newPage();
        const activePage = page;
        await activePage.route('**/*', async (route) => {
          const requestUrl = route.request().url();
          if (
            route.request().isNavigationRequest() &&
            route.request().frame() === activePage.mainFrame() &&
            origin(requestUrl) !== REVENUECAT_PURCHASE_LINK_ORIGIN
          ) {
            await route.abort('blockedbyclient');
            return;
          }
          await route.continue();
        });
        await activePage.goto(request.url, {
          waitUntil: 'domcontentloaded',
          timeout: options.timeoutMs,
        });
        assertRevenueCatTopLevel(activePage);
      } catch (error: unknown) {
        if (error instanceof SandboxPurchaseBrowserError) throw error;
        throw new SandboxPurchaseBrowserError(
          browser ? 'CHECKOUT_LOAD_FAILED' : 'BROWSER_UNAVAILABLE',
        );
      }

      return {
        async observeCheckoutReady() {
          if (!page) throw new SandboxPurchaseBrowserError('CHECKOUT_LOAD_FAILED');
          assertRevenueCatTopLevel(page);
          await page.locator('body').waitFor({ state: 'visible', timeout: options.timeoutMs });
        },
        async enterApprovedStripeSandboxFixture() {
          if (!page || actionAttempted) throw new SandboxPurchaseBrowserError('SAFETY');
          assertRevenueCatTopLevel(page);
          const [number, expiry, cvc] = await waitForPaymentFields(
            page,
            options.timeoutMs ?? 30_000,
          );
          try {
            await number.fill(STRIPE_SANDBOX_PAYMENT_FIXTURE.cardNumber);
            await expiry.fill(STRIPE_SANDBOX_PAYMENT_FIXTURE.expiry);
            await cvc.fill(STRIPE_SANDBOX_PAYMENT_FIXTURE.cvc);
            const frames = page.frames();
            const postal = await paymentField(
              frames,
              [/zip/i, /postal code/i],
              ['postalCode', 'postal'],
            );
            if (postal) await postal.fill(STRIPE_SANDBOX_PAYMENT_FIXTURE.postalCode);
            const name = await paymentField(
              frames,
              [/name on card/i, /cardholder name/i],
              ['name'],
            );
            if (name) await name.fill(STRIPE_SANDBOX_PAYMENT_FIXTURE.name);
          } catch {
            throw new SandboxPurchaseBrowserError('PAYMENT_FIXTURE_FAILED');
          }
        },
        async attemptSandboxPurchaseOnce(): Promise<SandboxSubmissionObservation> {
          if (!page || actionAttempted) throw new SandboxPurchaseBrowserError('SAFETY');
          assertRevenueCatTopLevel(page);
          const submit = await firstVisible([
            page.getByRole('button', { name: /subscribe/i }),
            page.getByRole('button', { name: /purchase/i }),
            page.getByRole('button', { name: /pay/i }),
          ]);
          if (!submit) throw new SandboxPurchaseBrowserError('PURCHASE_SUBMIT_FAILED');
          if (await submit.isDisabled()) {
            return {
              actionAttempted: false,
              state: 'validation-blocked',
              validationCategory: await readTopLevelValidationCategory(page),
            };
          }
          actionAttempted = true;
          try {
            await submit.click({ timeout: options.timeoutMs });
            const state = await observeSubmissionState(page, options.timeoutMs ?? 30_000, true);
            submissionConfirmed =
              state === 'processing' || state === 'success' || state === 'rejected';
            return { actionAttempted: true, state };
          } catch {
            try {
              const state = classifyHostedSemanticSignals(await readHostedSemanticSignals(page));
              if (state === 'validation-blocked') {
                return {
                  actionAttempted: true,
                  state,
                  validationCategory: await readTopLevelValidationCategory(page),
                };
              }
            } catch {
              // Once a click was attempted, loss of page state is inherently ambiguous.
            }
            return { actionAttempted: true, state: 'unknown' };
          }
        },
        async observeHostedResult() {
          if (!page || !submissionConfirmed) throw new SandboxPurchaseBrowserError('SAFETY');
          const state = await observeSubmissionState(page, options.timeoutMs ?? 30_000, false);
          return state === 'success' || state === 'rejected' ? state : 'unknown';
        },
        close: closeContext,
      };
    },
    async close() {
      let failed = false;
      try {
        await closeContext();
      } catch {
        failed = true;
      }
      if (browser) {
        try {
          await browser.close();
        } catch {
          failed = true;
        } finally {
          browser = undefined;
        }
      }
      if (failed) throw new SandboxPurchaseBrowserError('SAFETY');
    },
  };
}
