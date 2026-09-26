import { z } from 'zod';

/**
 * Guards for the Supabase settings a client bundle embeds.
 *
 * Anything in `VITE_*` or `EXPO_PUBLIC_*` ships to every user, so a
 * service-role or secret key pasted into the "anon key" slot would hand out
 * RLS-bypassing access. Refuse to start with one rather than trusting review
 * to catch it.
 */

export const clientAppEnvSchema = z.enum(['development', 'preview', 'production']);
export type ClientAppEnv = z.infer<typeof clientAppEnvSchema>;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decode base64url without relying on `atob`, which not every JS runtime has. */
function decodeBase64Url(segment: string): string | null {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  let bits = 0;
  let buffer = 0;
  let output = '';
  for (const char of base64) {
    if (char === '=') break;
    const value = BASE64_ALPHABET.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

/** The JWT `role` claim of a legacy Supabase API key, if it is one. */
function legacyKeyRole(key: string): string | null {
  const segments = key.split('.');
  if (segments.length !== 3 || !segments[1]) return null;
  const payload = decodeBase64Url(segments[1]);
  if (payload === null) return null;
  try {
    const claims: unknown = JSON.parse(payload);
    if (claims && typeof claims === 'object' && 'role' in claims) {
      return typeof claims.role === 'string' ? claims.role : null;
    }
  } catch {
    return null;
  }
  return null;
}

/** True for a key that must never appear in a client bundle. */
export function isPrivilegedSupabaseKey(key: string): boolean {
  const trimmed = key.trim();
  if (trimmed.startsWith('sb_secret_')) return true;
  const role = legacyKeyRole(trimmed);
  return role !== null && role !== 'anon';
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '10.0.2.2'
  );
}

export interface PublicSupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  appEnv: ClientAppEnv;
}

/**
 * Cross-field checks for a client's Supabase configuration. Use from a
 * `.superRefine` on the app's env schema so a misconfigured build fails at
 * startup with a readable message.
 */
export function refinePublicSupabaseConfig(
  config: PublicSupabaseConfig,
  ctx: z.RefinementCtx,
  names: { url: string; key: string },
): void {
  if (isPrivilegedSupabaseKey(config.supabaseAnonKey)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['supabaseAnonKey'],
      message: `${names.key} is a privileged Supabase key. Use the anon/publishable key; secret and service-role keys must never ship in a client.`,
    });
  }

  if (config.appEnv === 'development') return;

  let url: URL;
  try {
    url = new URL(config.supabaseUrl);
  } catch {
    return; // The URL format itself is reported by the field schema.
  }
  if (url.protocol !== 'https:' || isLoopbackHost(url.hostname)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['supabaseUrl'],
      message: `${names.url} must be a public https URL outside development.`,
    });
  }
}
