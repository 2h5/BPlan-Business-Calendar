import {
  formatCheckoutProbeReport,
  runCheckoutProbe,
  type CheckoutProbeOptions,
} from './checkout-probe';
import { createPlaywrightCheckoutProbeBrowser } from './playwright-checkout-probe';

export function runCheckoutProbeCommand(
  options: Omit<CheckoutProbeOptions, 'browserFactory'>,
  write: (text: string) => void = (text) => process.stdout.write(`${text}\n`),
): Promise<number> {
  return runCheckoutProbe({
    ...options,
    browserFactory: () =>
      createPlaywrightCheckoutProbeBrowser({
        executablePath: options.environment?.BILLING_PLAYWRIGHT_EXECUTABLE_PATH,
      }),
  }).then((report) => {
    write(formatCheckoutProbeReport(report));
    return report.ok ? 0 : 1;
  });
}
