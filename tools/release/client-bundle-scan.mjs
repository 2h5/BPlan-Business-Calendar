/**
 * Everything in a client bundle is public. This scans built output for values
 * and names that only the server may hold: a secret-shaped value means a key
 * was baked in; a server secret's variable name means server code or config
 * was pulled into the client.
 */
import { Buffer } from 'node:buffer';

/** Server-only settings read by Edge Functions (supabase/functions). */
export const SERVER_ONLY_ENV_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'MICROSOFT_OAUTH_CLIENT_SECRET',
  'OPENAI_API_KEY',
  'REVENUECAT_READONLY_API_KEY',
  'REVENUECAT_WEBHOOK_SECRET',
  'REVENUECAT_WEBHOOK_SIGNING_SECRET',
  'SYNC_CRON_SECRET',
  'BILLING_RECONCILE_CRON_SECRET',
];

const SECRET_VALUE_PATTERNS = [
  { kind: 'supabase-secret-key', pattern: /\bsb_secret_[A-Za-z0-9_-]{10,}/g },
  { kind: 'openai-key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  {
    kind: 'stripe-or-revenuecat-secret-key',
    pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/g,
  },
  { kind: 'private-key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]*/g;

function jwtRole(payloadSegment) {
  try {
    const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

/**
 * @param {Array<{ path: string; content: string }>} files
 * @returns {Array<{ path: string; kind: string; detail: string }>}
 */
export function scanClientBundle(files) {
  const findings = [];

  for (const { path, content } of files) {
    for (const { kind, pattern } of SECRET_VALUE_PATTERNS) {
      for (const match of content.matchAll(pattern)) {
        findings.push({ path, kind, detail: `${match[0].slice(0, 12)}…` });
      }
    }

    for (const match of content.matchAll(JWT_PATTERN)) {
      const role = jwtRole(match[1]);
      // The anon key is public by design; anything else bypasses RLS.
      if (role !== 'anon') {
        findings.push({ path, kind: 'privileged-jwt', detail: `role=${role ?? 'unknown'}` });
      }
    }

    for (const name of SERVER_ONLY_ENV_NAMES) {
      if (content.includes(name)) findings.push({ path, kind: 'server-env-name', detail: name });
    }
  }

  return findings;
}
