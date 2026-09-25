import { describe, expect, it } from 'vitest';

import { assertDeployableWebEnv, parseWebEnv, type WebEnvSource } from './env-schema';

// Synthetic anon-role JWT, built at run time so no key-shaped literal is committed.
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const ANON_KEY = [encode({ alg: 'HS256' }), encode({ role: 'anon' }), 'signature'].join('.');

const production: WebEnvSource = {
  VITE_SUPABASE_URL: 'https://abc.supabase.co',
  VITE_SUPABASE_ANON_KEY: ANON_KEY,
  VITE_APP_ENV: 'production',
  VITE_BILLING_MODE: 'disabled',
};

describe('deployable web env', () => {
  it('accepts a valid production configuration', () => {
    expect(() => assertDeployableWebEnv(production)).not.toThrow();
    expect(parseWebEnv(production).success).toBe(true);
  });

  it('fails a production or preview build on invalid configuration', () => {
    for (const appEnv of ['production', 'preview']) {
      expect(() =>
        assertDeployableWebEnv({
          ...production,
          VITE_APP_ENV: appEnv,
          VITE_SUPABASE_URL: 'http://abc.supabase.co',
        }),
      ).toThrow(`Refusing to build web for ${appEnv}`);
    }
    expect(() =>
      assertDeployableWebEnv({
        ...production,
        VITE_BILLING_MODE: 'sandbox',
        VITE_REVENUECAT_WEB_PURCHASE_URL: 'https://pay.rev.cat/sandbox',
      }),
    ).toThrow('VITE_BILLING_MODE=sandbox');
    expect(() => assertDeployableWebEnv({ ...production, VITE_SUPABASE_ANON_KEY: '' })).toThrow(
      'VITE_SUPABASE_ANON_KEY',
    );
  });

  it('leaves development and unlabelled builds to the startup check', () => {
    expect(() => assertDeployableWebEnv({})).not.toThrow();
    expect(() => assertDeployableWebEnv({ VITE_APP_ENV: 'development' })).not.toThrow();
  });
});
