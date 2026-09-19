import { existsSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import { runBillingAssertUser } from './assert-user';
import { parseCheckoutReadyPlan } from './checkout-ready';
import { createPlaywrightSandboxPurchaseBrowser } from './playwright-sandbox-purchase';
import {
  formatSandboxPurchaseReport,
  runSandboxPurchase,
  type SandboxPurchaseOptions,
} from './sandbox-purchase';

function executableIsValid(path: string): boolean {
  try {
    return isAbsolute(path) && existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

export async function runSandboxPurchaseCommand(
  options: Partial<
    Omit<SandboxPurchaseOptions, 'browserFactory' | 'browserExecutableIsValid' | 'assertUser'>
  > = {},
  write: (text: string) => void = (text) => process.stdout.write(`${text}\n`),
): Promise<number> {
  const environment = options.environment ?? process.env;
  const parsedPlan = parseCheckoutReadyPlan(options.argv ?? process.argv.slice(2));
  const report = await runSandboxPurchase({
    ...options,
    environment,
    browserExecutableIsValid: executableIsValid,
    browserFactory: () =>
      createPlaywrightSandboxPurchaseBrowser({
        executablePath: environment.BILLING_PLAYWRIGHT_EXECUTABLE_PATH ?? '',
      }),
    assertUser: (expectedState) =>
      runBillingAssertUser({
        environment,
        argv: ['--expect', expectedState],
        requiredMode: 'sandbox-purchase',
        expectedPlan: expectedState === 'active-pro' && parsedPlan.ok ? parsedPlan.plan : undefined,
      }),
  });
  write(formatSandboxPurchaseReport(report));
  return report.ok ? 0 : 1;
}
