import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/revenuecat-sandbox-billing.yml'),
  'utf8',
);
const packageJson = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');
const normalCi = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');

function workflowDispatchSection(): string {
  const lines = workflow.split(/\r?\n/);
  const onIndex = lines.findIndex((line) => line === 'on:');
  if (onIndex < 0) return '';

  const section: string[] = [];
  for (const line of lines.slice(onIndex + 1)) {
    if (line.length > 0 && !line.startsWith(' ')) break;
    section.push(line);
  }
  return section.join('\n');
}

describe('manual RevenueCat billing workflow safety', () => {
  it('has workflow_dispatch as its only trigger', () => {
    const dispatch = workflowDispatchSection();
    const topLevelEvents = dispatch.match(/^\x20{2}[a-z][a-z0-9_-]*:$/gm) ?? [];

    expect(topLevelEvents).toEqual(['  workflow_dispatch:']);
    expect(dispatch).toContain('workflow_dispatch:');
    expect(dispatch).not.toMatch(/^\x20{2}(push|pull_request|schedule|create|delete):$/m);
  });

  it('defaults to an offline read-only preflight and has no production choice', () => {
    const dispatch = workflowDispatchSection();
    const operationInput =
      dispatch.match(/^\x20{6}operation:\r?\n([\s\S]*?)(?=^\x20{6}purchase_plan:)/m)?.[1] ?? '';

    expect(operationInput).toContain('default: preflight');
    expect(operationInput).toContain('- preflight');
    expect(operationInput).toContain('- monthly-assertion');
    expect(operationInput).toContain('- annual-assertion');
    expect(operationInput).toContain('- lifecycle-read-only');
    expect(operationInput).toContain('- annual-renewal-read-only');
    expect(operationInput).not.toMatch(/production/i);
    expect(dispatch).not.toMatch(/production/i);
    expect(dispatch).not.toMatch(/^\x20{6}(target_environment|environment):$/m);
    expect(workflow).toContain('BILLING_AUTOMATION_ENV: sandbox');
    expect(workflow).toContain('BILLING_AUTOMATION_MODE: offline');
    expect(workflow).not.toContain('inputs.target_environment');
  });

  it('allows the bounded annual renewal observation to finish with setup margin', () => {
    const timeoutMinutes = Number(workflow.match(/^\x20{4}timeout-minutes:\s*(\d+)\s*$/m)?.[1]);

    // The observer can span a 60-minute accelerated period plus 10 minutes
    // after the boundary; keep 20 minutes for runner setup and billing builds.
    expect(timeoutMinutes).toBeGreaterThanOrEqual(90);
  });

  it('gets credentials and test identities only from GitHub Environment secrets', () => {
    for (const secret of [
      'REVENUECAT_API_KEY',
      'BILLING_SUPABASE_URL',
      'BILLING_SUPABASE_SERVICE_ROLE_KEY',
      'BILLING_MONTHLY_TEST_USER_ID',
      'BILLING_ANNUAL_TEST_USER_ID',
      'BILLING_LIFECYCLE_TEST_USER_ID',
      'BILLING_RENEWAL_TEST_USER_ID',
      'BILLING_PURCHASE_TEST_USER_ID',
      'BILLING_REVENUECAT_SANDBOX_PURCHASE_URL',
    ]) {
      expect(workflow).toContain('secrets.' + secret);
    }
    expect(workflow).toContain('name: billing-sandbox');
    expect(workflow).not.toContain('Z:\\Dev\\Secrets\\BCalAI\\billing.env');
    const secretEnvironmentLines = workflow
      .split(/\r?\n/)
      .filter((line) =>
        [
          'REVENUECAT_API_KEY:',
          'BILLING_SUPABASE_URL:',
          'BILLING_SUPABASE_SERVICE_ROLE_KEY:',
          'BILLING_TEST_USER_ID:',
          'BILLING_REVENUECAT_SANDBOX_PURCHASE_URL:',
        ].some((name) => line.trimStart().startsWith(name)),
      );
    expect(secretEnvironmentLines.length).toBeGreaterThan(0);
    for (const line of secretEnvironmentLines) {
      expect(line).toMatch(/: \$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}$/);
    }
    expect(workflow).not.toMatch(
      /(?:sk_(?:live|test)_[A-Za-z0-9]+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|https:\/\/pay\.rev\.cat\/sandbox\/[A-Za-z0-9_-]{8,})/i,
    );
  });

  it('requires explicit operation selection and a second confirmation for purchase', () => {
    const dispatch = workflowDispatchSection();

    expect(dispatch).toContain('- sandbox-purchase');
    expect(dispatch).toContain('confirm_sandbox_purchase:');
    expect(dispatch).toContain('default: false');
    expect(workflow).toContain('Unsupported billing operation.');
    expect(workflow).toContain(
      "inputs.operation == 'sandbox-purchase' && inputs.confirm_sandbox_purchase != true",
    );
    expect(workflow).toContain(
      "inputs.operation == 'sandbox-purchase' && inputs.confirm_sandbox_purchase == true",
    );
    expect(workflow).not.toMatch(/billing:(lifecycle:cancel|refund|extend)/i);
  });

  it('keeps normal CI independent of providers and reuses local billing commands', () => {
    for (const command of [
      'billing:preflight',
      'billing:assert-user',
      'billing:lifecycle:read-only',
      'billing:lifecycle:renewal',
      'billing:e2e:sandbox',
    ]) {
      expect(packageJson).toContain('"' + command + '"');
    }
    expect(workflow).not.toMatch(/\bdocker\b/i);
    expect(normalCi).not.toMatch(
      /REVENUECAT_API_KEY|BILLING_SUPABASE_SERVICE_ROLE_KEY|billing:e2e:sandbox|lifecycle:cancel/i,
    );
  });
});
