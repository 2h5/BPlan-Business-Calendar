import { EdgeError } from '../errors/index.ts';
import { z } from 'zod';

export const DEFAULT_MOBILE_OAUTH_RETURN_URL = 'calendarapp://settings/integrations';

/** The only destinations an OAuth start request may select. */
export const oauthReturnTargetSchema = z.enum(['mobile', 'web']);
export type OAuthReturnTarget = z.infer<typeof oauthReturnTargetSchema>;

export interface OAuthReturnUrlConfig {
  mobile: string;
  web?: string;
}

/** Read a required server-side provider setting without exposing its value. */
export const requireEnv = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new EdgeError('UNKNOWN', `Missing ${name}`, 500);
  return value;
};

/** Parse the small allowlist accepted by both OAuth start functions. */
export function parseOAuthReturnTarget(value: unknown): OAuthReturnTarget {
  const parsed = oauthReturnTargetSchema.safeParse(value === undefined ? 'mobile' : value);
  if (!parsed.success) {
    throw new EdgeError('VALIDATION_FAILED', 'Invalid OAuth return target.', 400);
  }
  return parsed.data;
}

/**
 * Select a server-configured callback destination. The caller supplies no
 * URL, only the allowlisted target name, so there is no open redirect path.
 */
export function oauthReturnUrlFor(target: OAuthReturnTarget, config: OAuthReturnUrlConfig): string {
  const value = target === 'web' ? config.web : config.mobile;
  if (!value) {
    throw new EdgeError(
      'UNKNOWN',
      target === 'web' ? 'Web OAuth is not configured.' : 'Mobile OAuth is not configured.',
      500,
    );
  }

  if (target === 'web') {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new EdgeError('UNKNOWN', 'Web OAuth is not configured correctly.', 500);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new EdgeError('UNKNOWN', 'Web OAuth is not configured correctly.', 500);
    }
  }

  return value;
}

function mobileOAuthReturnUrl(): string {
  const configured = Deno.env.get('APP_OAUTH_RETURN_URL')?.trim();
  if (!configured) return DEFAULT_MOBILE_OAUTH_RETURN_URL;

  try {
    new URL(configured);
    return configured;
  } catch {
    console.error(JSON.stringify({ code: 'MOBILE_OAUTH_RETURN_URL_INVALID' }));
    return DEFAULT_MOBILE_OAUTH_RETURN_URL;
  }
}

/** Where an OAuth callback bounces the browser back into the mobile app. */
export const appReturnUrl = (): string => oauthReturnUrl('mobile');

/** Select the configured destination for an OAuth start or callback. */
export function oauthReturnUrl(target: OAuthReturnTarget): string {
  return oauthReturnUrlFor(target, {
    mobile: mobileOAuthReturnUrl(),
    web: Deno.env.get('WEB_OAUTH_RETURN_URL')?.trim() || undefined,
  });
}

/**
 * A callback must still have somewhere safe to land if deployment config has
 * drifted since the handshake was created. Fall back only to the mobile
 * destination, which is itself server-controlled and validated above.
 */
export function safeOAuthReturnUrl(target: OAuthReturnTarget): string {
  try {
    return oauthReturnUrl(target);
  } catch {
    console.error(JSON.stringify({ code: 'OAUTH_RETURN_URL_FALLBACK', target }));
    return oauthReturnUrl('mobile');
  }
}
