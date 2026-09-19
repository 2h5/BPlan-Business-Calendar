import type { EnvironmentRecord } from './config';
import { runBillingPreflight } from './preflight';
import { formatBillingPreflightReport } from './report';

export function runBillingPreflightCommand(
  environment: EnvironmentRecord,
  write: (text: string) => void = (text) => process.stdout.write(`${text}\n`),
): number {
  const report = runBillingPreflight(environment);
  write(formatBillingPreflightReport(report));
  return report.ok ? 0 : 1;
}
