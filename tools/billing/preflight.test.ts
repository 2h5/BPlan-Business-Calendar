import { describe, expect, it, vi } from 'vitest';

import { runBillingPreflightCommand } from './command';
import {
  formatBillingConfigIssues,
  isBillingUserId,
  loadBillingEnvironment,
  redactSecrets,
} from './config';
import {
  BILLING_CONTRACT,
  PRIVILEGED_ENVIRONMENT_VARIABLES,
  REVENUECAT_API_BASE_URL,
  REVENUECAT_CLI_APPROVED_VERSION,
  REVENUECAT_CLI_COMMAND,
} from './contract';
import { runBillingPreflight } from './preflight';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const FUTURE_LIVE_READONLY_ENV = {
  BILLING_AUTOMATION_MODE: 'live-readonly',
  BILLING_AUTOMATION_ENV: 'sandbox',
  REVENUECAT_API_KEY: 'secret-value',
  BILLING_SUPABASE_URL: 'https://example.supabase.co',
  BILLING_SUPABASE_SERVICE_ROLE_KEY: 'service-value',
} as const;

describe('billing preflight foundation', () => {
  it('freezes the documented sandbox billing contract', () => {
    expect(BILLING_CONTRACT.project.documentedRunbookId).toBe('d455e7e9');
    expect(BILLING_CONTRACT.webConfig.id).toBe('app48a77253da');
    expect(BILLING_CONTRACT.entitlement).toBe('pro');
    expect(BILLING_CONTRACT.offering.identifier).toBe('bplan_web');
    expect(BILLING_CONTRACT.offering.id).toBe('ofrng560c7ad85b');
    expect(BILLING_CONTRACT.products.monthly.id).toBe('bplan_pro_monthly');
    expect(BILLING_CONTRACT.products.annual.id).toBe('bplan_pro_yearly');
    expect(REVENUECAT_API_BASE_URL).toBe('https://api.revenuecat.com/v2');
    expect(REVENUECAT_CLI_COMMAND).toBe('rc');
    expect(REVENUECAT_CLI_APPROVED_VERSION).toBe('0.1.1');
    expect(BILLING_CONTRACT.project.idVerification).toBe('unverified-for-live-v2');
  });

  it('passes offline defaults without making a network request', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const report = runBillingPreflight();

    expect(report.ok).toBe(true);
    expect(report.mode).toBe('offline');
    expect(report.targetEnvironment).toBe('sandbox');
    expect(report.networkRequests).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('reports required future live configuration by variable name only', () => {
    const loaded = loadBillingEnvironment({ BILLING_AUTOMATION_MODE: 'live-readonly' });
    const message = formatBillingConfigIssues(loaded.issues);

    expect(loaded.issues.map((issue) => issue.variable)).toEqual(
      expect.arrayContaining([
        'REVENUECAT_API_KEY',
        'BILLING_SUPABASE_URL',
        'BILLING_SUPABASE_SERVICE_ROLE_KEY',
      ]),
    );
    expect(message).toContain('REVENUECAT_API_KEY');
    expect(message).not.toContain('undefined');
  });

  it('recognizes future sandbox live-readonly configuration but makes no call', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const loaded = loadBillingEnvironment(FUTURE_LIVE_READONLY_ENV);
    const report = runBillingPreflight(FUTURE_LIVE_READONLY_ENV);

    expect(loaded.issues).toEqual([]);
    expect(report.mode).toBe('live-readonly');
    expect(report.targetEnvironment).toBe('sandbox');
    expect(report.ok).toBe(false);
    expect(report.networkRequests).toBe(0);
    expect(report.checks.find((check) => check.name === 'configuration')?.status).toBe('PASS');
    expect(report.checks.find((check) => check.name === 'execution mode')?.status).toBe('FAIL');
    expect(report.checks.find((check) => check.name === 'sandbox guard')?.status).toBe('PASS');
    expect(report.checks.find((check) => check.name === 'privileged credentials')?.status).toBe(
      'PASS',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('rejects retired automation modes and invalid targets', () => {
    const loaded = loadBillingEnvironment({
      BILLING_AUTOMATION_MODE: 'production',
      BILLING_AUTOMATION_ENV: 'staging',
    });

    expect(loaded.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_VALUE',
          variable: 'BILLING_AUTOMATION_MODE',
        }),
        expect.objectContaining({
          code: 'INVALID_VALUE',
          variable: 'BILLING_AUTOMATION_ENV',
        }),
      ]),
    );
  });

  it('rejects malformed test-user UUID configuration', () => {
    expect(isBillingUserId(USER_ID)).toBe(true);
    expect(isBillingUserId('not-an-email')).toBe(false);

    const loaded = loadBillingEnvironment({ BILLING_TEST_USER_ID: 'not-an-email' });
    expect(loaded.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_UUID',
          variable: 'BILLING_TEST_USER_ID',
        }),
      ]),
    );
  });

  it('redacts configured secret values and secret-shaped diagnostics', () => {
    const secret = 'rc_secret_test_value';
    const raw = { REVENUECAT_API_KEY: secret };
    const redacted = redactSecrets(`REVENUECAT_API_KEY=${secret}`, raw);

    expect(redacted).toBe('REVENUECAT_API_KEY=[REDACTED]');
    expect(PRIVILEGED_ENVIRONMENT_VARIABLES).toContain('REVENUECAT_API_KEY');
    expect(redacted).not.toContain(secret);
  });

  it('fails closed for production targets', () => {
    const report = runBillingPreflight({
      BILLING_AUTOMATION_ENV: 'production',
    });

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.name === 'sandbox guard')?.status).toBe('FAIL');
  });

  it('returns structured success and failure exit results', () => {
    const successOutput: string[] = [];
    const successCode = runBillingPreflightCommand({}, (text) => successOutput.push(text));
    expect(successCode).toBe(0);
    expect(successOutput[0]).toContain('Result: PASS');

    const failureOutput: string[] = [];
    const failureCode = runBillingPreflightCommand(
      { BILLING_AUTOMATION_ENV: 'production' },
      (text) => failureOutput.push(text),
    );
    expect(failureCode).toBe(1);
    expect(failureOutput[0]).toContain('Result: FAIL');
  });
});
