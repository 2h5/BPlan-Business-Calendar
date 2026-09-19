import {
  formatCheckoutReadyReport,
  runCheckoutReady,
  type CheckoutReadyOptions,
} from './checkout-ready';

export function runCheckoutReadyCommand(
  options: CheckoutReadyOptions = {},
  write: (text: string) => void = (text) => process.stdout.write(`${text}\n`),
): number {
  const report = runCheckoutReady(options);
  write(formatCheckoutReadyReport(report));
  return report.ok ? 0 : 1;
}
