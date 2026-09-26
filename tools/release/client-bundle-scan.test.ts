import { describe, expect, it } from 'vitest';

import { scanClientBundle } from './client-bundle-scan.mjs';

// Every credential-shaped value is assembled at run time so none is committed.
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (role: string) =>
  [encode({ alg: 'HS256', typ: 'JWT' }), encode({ role, iss: 'supabase' }), 'sig'].join('.');

const kinds = (content: string) =>
  scanClientBundle([{ path: 'assets/index.js', content }]).map((finding) => finding.kind);

describe('client bundle scan', () => {
  it('allows the public anon key and ordinary code', () => {
    expect(kinds(`const key="${jwt('anon')}";fetch("https://abc.supabase.co")`)).toEqual([]);
    expect(kinds('const task="sk-short"; const mask="sb_secret_"')).toEqual([]);
  });

  it('flags privileged JWTs and secret-shaped keys', () => {
    expect(kinds(`a="${jwt('service_role')}"`)).toEqual(['privileged-jwt']);
    expect(kinds(['sb', 'secret', 'A'.repeat(24)].join('_'))).toEqual(['supabase-secret-key']);
    expect(kinds(['sk', 'proj', 'B'.repeat(30)].join('-'))).toEqual(['openai-key']);
    expect(kinds(['sk', 'live', 'C'.repeat(24)].join('_'))).toEqual([
      'stripe-or-revenuecat-secret-key',
    ]);
    expect(kinds(['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' '))).toEqual(['private-key']);
  });

  it('flags server-only variable names pulled into the client', () => {
    expect(kinds('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")')).toEqual(['server-env-name']);
    expect(kinds('process.env.OPENAI_API_KEY')).toEqual(['server-env-name']);
  });

  it('never echoes a full secret in its report', () => {
    const secret = ['sb', 'secret', 'D'.repeat(40)].join('_');
    const [finding] = scanClientBundle([{ path: 'x.js', content: secret }]);
    expect(finding?.detail.length).toBeLessThan(20);
  });
});
