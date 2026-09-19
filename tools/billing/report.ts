import type { BillingPreflightReport } from './preflight';

export function formatBillingPreflightReport(report: BillingPreflightReport): string {
  const lines = [
    'RevenueCat billing preflight',
    `Mode: ${report.mode}`,
    `Target: ${report.targetEnvironment}`,
    '',
  ];

  for (const check of report.checks) {
    lines.push(`[${check.status}] ${check.name}: ${check.message}`);
  }

  lines.push('');
  lines.push(`Network requests: ${report.networkRequests}`);
  lines.push(`Result: ${report.ok ? 'PASS' : 'FAIL'}`);
  return lines.join('\n');
}
