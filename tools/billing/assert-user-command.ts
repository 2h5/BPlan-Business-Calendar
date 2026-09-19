import {
  formatBillingAssertUserReport,
  runBillingAssertUser,
  type BillingAssertUserOptions,
} from './assert-user';

export async function runBillingAssertUserCommand(
  options: BillingAssertUserOptions = {},
  write: (text: string) => void = (text) => process.stdout.write(`${text}\n`),
): Promise<number> {
  const report = await runBillingAssertUser(options);
  write(formatBillingAssertUserReport(report));
  return report.ok ? 0 : 1;
}
