/**
 * RevenueCat HMAC webhook signing.
 *
 * When HMAC signing is enabled on the integration, every delivery carries
 * `X-RevenueCat-Webhook-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>`,
 * computed over `<t>.<raw body>` with the integration's signing secret
 * (https://www.revenuecat.com/docs/integrations/webhooks). Verification must
 * use the raw body bytes, before any JSON parsing.
 *
 * This is optional and additive: the shared Authorization header is always
 * required, and a configured signing secret additionally binds the body and a
 * five-minute freshness window to the delivery.
 */

import { constantTimeEqual } from '../_shared/billing/constant-time.ts';

export const SIGNATURE_HEADER = 'X-RevenueCat-Webhook-Signature';
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureFailure = 'MISSING' | 'MALFORMED' | 'STALE' | 'MISMATCH';

export async function verifyRevenueCatSignature(
  header: string | null,
  rawBody: string,
  secret: string,
  nowSeconds: number,
): Promise<SignatureFailure | null> {
  if (!header) return 'MISSING';

  let timestamp: string | undefined;
  const candidates: string[] = [];
  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator <= 0) return 'MALFORMED';
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 't') {
      if (timestamp !== undefined) return 'MALFORMED';
      timestamp = value;
    } else if (key === 'v1') {
      candidates.push(value);
    }
  }

  if (timestamp === undefined || !/^\d{1,12}$/.test(timestamp) || candidates.length === 0) {
    return 'MALFORMED';
  }
  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return 'STALE';

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return candidates.some((candidate) => constantTimeEqual(candidate.toLowerCase(), expected))
    ? null
    : 'MISMATCH';
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
