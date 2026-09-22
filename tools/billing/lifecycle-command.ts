import { isBillingUserId, loadBillingEnvironment, type EnvironmentRecord } from './config';
import { formatLifecycleReport, inspectAnnualLifecycle } from './lifecycle';
import { createRevenueCatAssertionAdapter } from './revenuecat-assertions';
import { createSupabaseAssertionAdapter } from './supabase-assertions';

export async function runBillingLifecycleReadOnly(
  environment: EnvironmentRecord = process.env,
  write: (value: string) => void = (value) => process.stdout.write(`${value}\n`),
): Promise<number> {
  const loaded = loadBillingEnvironment(environment);
  const config = loaded.config;
  if (
    loaded.issues.length > 0 ||
    config.mode !== 'live-readonly' ||
    config.targetEnvironment !== 'sandbox' ||
    !config.testUserId ||
    !isBillingUserId(config.testUserId) ||
    !config.revenueCatApiKey ||
    !config.supabaseUrl ||
    !config.supabaseServiceRoleKey
  ) {
    write('RevenueCat annual lifecycle (read-only)\nResult: FAIL\nFailure: CONFIGURATION');
    return 1;
  }

  const provider = await createRevenueCatAssertionAdapter({
    apiKey: config.revenueCatApiKey,
  }).readUser(config.testUserId);
  if (!provider.ok) {
    write(`RevenueCat annual lifecycle (read-only)\nResult: FAIL\nFailure: ${provider.error.code}`);
    return 1;
  }
  const supabase = await createSupabaseAssertionAdapter({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
  }).readUser(config.testUserId);
  if (!supabase.ok) {
    write(`RevenueCat annual lifecycle (read-only)\nResult: FAIL\nFailure: ${supabase.error.code}`);
    return 1;
  }
  const report = inspectAnnualLifecycle(provider.data, supabase.data, new Date());
  write(formatLifecycleReport(report));
  return report.ok ? 0 : 1;
}
