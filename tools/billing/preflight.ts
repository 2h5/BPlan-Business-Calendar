import {
  formatBillingConfigIssues,
  loadBillingEnvironment,
  type EnvironmentRecord,
} from './config';
import { BILLING_CONTRACT, REVENUECAT_API_BASE_URL } from './contract';

export type PreflightCheckStatus = 'PASS' | 'FAIL';

export interface PreflightCheck {
  name: string;
  status: PreflightCheckStatus;
  message: string;
}

export interface BillingPreflightReport {
  ok: boolean;
  mode: string;
  targetEnvironment: string;
  networkRequests: number;
  checks: PreflightCheck[];
}

export function runBillingPreflight(raw: EnvironmentRecord = {}): BillingPreflightReport {
  const loaded = loadBillingEnvironment(raw);
  const { config } = loaded;
  const checks: PreflightCheck[] = [];

  checks.push({
    name: 'configuration',
    status: loaded.issues.length === 0 ? 'PASS' : 'FAIL',
    message:
      loaded.issues.length === 0
        ? 'Environment names and formats are valid; secret values are not displayed.'
        : formatBillingConfigIssues(loaded.issues, raw),
  });

  checks.push({
    name: 'execution mode',
    status: config.mode === 'offline' ? 'PASS' : 'FAIL',
    message:
      config.mode === 'offline'
        ? 'Offline contract mode is active; no provider or hosted-service calls are allowed.'
        : 'live-readonly is reserved for separately invoked read-only commands; billing:preflight itself makes no provider or hosted-service calls.',
  });

  checks.push({
    name: 'sandbox guard',
    status: config.targetEnvironment === 'sandbox' ? 'PASS' : 'FAIL',
    message:
      config.targetEnvironment === 'sandbox'
        ? 'Target environment is sandbox.'
        : 'Production is forbidden by the Batch 1 preflight guard.',
  });

  checks.push({
    name: 'static billing contract',
    status: 'PASS',
    message:
      `RevenueCat project ${BILLING_CONTRACT.project.name}, documented runbook ID ` +
      `${BILLING_CONTRACT.project.documentedRunbookId}, entitlement ${BILLING_CONTRACT.entitlement}, ` +
      `offering ${BILLING_CONTRACT.offering.identifier}, and monthly/yearly products are frozen. ` +
      `The runbook ID is historical evidence only and is UNVERIFIED FOR LIVE V2 USE.`,
  });

  checks.push({
    name: 'privileged credentials',
    status: config.mode === 'offline' || loaded.issues.length === 0 ? 'PASS' : 'FAIL',
    message:
      config.mode === 'offline'
        ? 'Offline mode does not require or consume RevenueCat, Stripe, or Supabase secrets.'
        : loaded.issues.length === 0
          ? 'Live-readonly credentials are present, but billing:preflight does not consume them.'
          : 'Live-readonly credentials are invalid or incomplete and are not consumed.',
  });

  checks.push({
    name: 'network boundary',
    status: 'PASS',
    message: `No network calls are made. Future live API calls must use ${REVENUECAT_API_BASE_URL}.`,
  });

  return {
    ok: checks.every((check) => check.status === 'PASS'),
    mode: config.mode,
    targetEnvironment: config.targetEnvironment,
    networkRequests: 0,
    checks,
  };
}
