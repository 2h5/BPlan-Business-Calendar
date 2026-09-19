import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

import {
  CheckoutProbeBrowserError,
  type CheckoutProbeBrowser,
  type CheckoutProbeSession,
} from './checkout-probe-browser';
import type { SandboxCheckoutLaunchRequest } from './checkout-ready';
import { REVENUECAT_PURCHASE_LINK_ORIGIN, REVENUECAT_PURCHASE_LINK_HOST } from './contract';

export interface PlaywrightCheckoutProbeOptions {
  readonly executablePath?: string;
  readonly timeoutMs?: number;
}

function pageOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function mapPlaywrightFailure(
  error: unknown,
  browser: Browser | undefined,
  blockedOrigin: boolean,
): CheckoutProbeBrowserError {
  if (blockedOrigin) return new CheckoutProbeBrowserError('CHECKOUT_ORIGIN_MISMATCH');
  if (!browser) return new CheckoutProbeBrowserError('BROWSER_UNAVAILABLE');
  if (error instanceof Error && error.message.toLowerCase().includes('timeout')) {
    return new CheckoutProbeBrowserError('BROWSER_TIMEOUT');
  }
  return new CheckoutProbeBrowserError('CHECKOUT_LOAD_FAILED');
}

export function createPlaywrightCheckoutProbeBrowser(
  options: PlaywrightCheckoutProbeOptions = {},
): CheckoutProbeBrowser {
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  async function closeContext(): Promise<void> {
    let failed = false;
    if (context) {
      try {
        await context.close();
      } catch {
        failed = true;
      } finally {
        context = undefined;
        page = undefined;
      }
    }
    if (failed) throw new CheckoutProbeBrowserError('SAFETY');
  }

  const probeBrowser: CheckoutProbeBrowser = {
    async openCheckout(request: SandboxCheckoutLaunchRequest): Promise<CheckoutProbeSession> {
      if (
        request.targetEnvironment !== 'sandbox' ||
        request.checkoutHost !== REVENUECAT_PURCHASE_LINK_HOST ||
        pageOrigin(request.url) !== REVENUECAT_PURCHASE_LINK_ORIGIN
      ) {
        throw new CheckoutProbeBrowserError('SAFETY');
      }

      let blockedOrigin = false;
      try {
        const launchOptions = {
          headless: true,
          timeout: options.timeoutMs,
          ...(options.executablePath ? { executablePath: options.executablePath } : {}),
        };
        browser = await chromium.launch(launchOptions);
        context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' });
        page = await context.newPage();
        const activePage = page;

        await activePage.route('**/*', async (route) => {
          const requestUrl = route.request().url();
          if (
            route.request().isNavigationRequest() &&
            route.request().frame() === activePage.mainFrame() &&
            pageOrigin(requestUrl) !== REVENUECAT_PURCHASE_LINK_ORIGIN
          ) {
            blockedOrigin = true;
            await route.abort('blockedbyclient');
            return;
          }
          await route.continue();
        });

        await activePage.goto(request.url, {
          waitUntil: 'domcontentloaded',
          timeout: options.timeoutMs,
        });
        if (blockedOrigin || pageOrigin(activePage.url()) !== REVENUECAT_PURCHASE_LINK_ORIGIN) {
          throw new CheckoutProbeBrowserError('CHECKOUT_ORIGIN_MISMATCH');
        }
        await activePage.locator('body').waitFor({ state: 'visible', timeout: options.timeoutMs });

        return {
          async observeCheckout() {
            const topLevelOrigin = pageOrigin(activePage.url());
            if (!topLevelOrigin) throw new CheckoutProbeBrowserError('CHECKOUT_LOAD_FAILED');
            return {
              topLevelOrigin,
              hostedCheckoutLoaded: true,
              stableInteractive: true,
            };
          },
          close: closeContext,
        };
      } catch (error: unknown) {
        if (error instanceof CheckoutProbeBrowserError) throw error;
        throw mapPlaywrightFailure(error, browser, blockedOrigin);
      }
    },
    async close(): Promise<void> {
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
      if (failed) throw new CheckoutProbeBrowserError('SAFETY');
    },
  };

  return probeBrowser;
}
