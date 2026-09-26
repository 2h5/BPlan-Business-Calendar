import { EdgeError } from './errors/index.ts';

/**
 * Read a required server-side setting.
 *
 * The variable name goes to the function log for the operator; the caller only
 * learns that the service is not configured, not which secret is missing.
 */
export function requireEnv(
  name: string,
  read: (name: string) => string | undefined = (key) => Deno.env.get(key),
): string {
  const value = read(name);
  if (!value) {
    console.error(JSON.stringify({ code: 'SERVER_ENV_MISSING', name }));
    throw new EdgeError('UNKNOWN', 'This service is not configured.', 500);
  }
  return value;
}
