import {
  isPrivilegedSupabaseKey,
  refinePublicSupabaseConfig,
  type ClientAppEnv,
} from '@cal/schemas';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Synthetic, unsigned keys built at runtime so no key-shaped literal is
// committed. Only the role claim and prefixes matter to the guard.
const segment = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const legacyKey = (role: string) =>
  `${segment({ alg: 'HS256', typ: 'JWT' })}.${segment({ iss: 'test', role })}.signature`;
const LOCAL_ANON_KEY = legacyKey('anon');
const LOCAL_SERVICE_ROLE_KEY = legacyKey('service_role');
const SECRET_KEY = ['sb', 'secret', 'x'.repeat(32)].join('_');
const PUBLISHABLE_KEY = ['sb', 'publishable', 'x'.repeat(32)].join('_');

const schema = z
  .object({ supabaseUrl: z.string(), supabaseAnonKey: z.string(), appEnv: z.string() })
  .superRefine((value, ctx) =>
    refinePublicSupabaseConfig({ ...value, appEnv: value.appEnv as ClientAppEnv }, ctx, {
      url: 'URL',
      key: 'KEY',
    }),
  );

const issues = (supabaseUrl: string, supabaseAnonKey: string, appEnv: ClientAppEnv) => {
  const result = schema.safeParse({ supabaseUrl, supabaseAnonKey, appEnv });
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

describe('client Supabase configuration guard', () => {
  it('classifies anon and publishable keys as public', () => {
    expect(isPrivilegedSupabaseKey(LOCAL_ANON_KEY)).toBe(false);
    expect(isPrivilegedSupabaseKey(PUBLISHABLE_KEY)).toBe(false);
    expect(isPrivilegedSupabaseKey('not-a-jwt-but-long-enough')).toBe(false);
  });

  it('classifies service-role and secret keys as privileged', () => {
    expect(isPrivilegedSupabaseKey(LOCAL_SERVICE_ROLE_KEY)).toBe(true);
    expect(isPrivilegedSupabaseKey(` ${LOCAL_SERVICE_ROLE_KEY} `)).toBe(true);
    expect(isPrivilegedSupabaseKey(SECRET_KEY)).toBe(true);
  });

  it('refuses a privileged key in every environment, including development', () => {
    for (const appEnv of ['development', 'preview', 'production'] as const) {
      expect(issues('https://abc.supabase.co', LOCAL_SERVICE_ROLE_KEY, appEnv)).toContain(
        'supabaseAnonKey',
      );
    }
  });

  it('allows a local http stack only in development', () => {
    expect(issues('http://127.0.0.1:54321', LOCAL_ANON_KEY, 'development')).toEqual([]);
    expect(issues('http://127.0.0.1:54321', LOCAL_ANON_KEY, 'production')).toEqual(['supabaseUrl']);
    expect(issues('https://localhost:54321', LOCAL_ANON_KEY, 'preview')).toEqual(['supabaseUrl']);
    expect(issues('http://abc.supabase.co', LOCAL_ANON_KEY, 'production')).toEqual(['supabaseUrl']);
  });

  it('accepts a hosted https project with a public key', () => {
    expect(issues('https://abc.supabase.co', LOCAL_ANON_KEY, 'production')).toEqual([]);
  });
});
