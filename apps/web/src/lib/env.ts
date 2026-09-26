import { parseWebEnv } from './env-schema';

/** Validate browser environment configuration at startup; see `env-schema.ts`. */
const parsed = parseWebEnv(import.meta.env);

if (!parsed.success) {
  const issues = parsed.issues.map((issue) => `  • ${issue}`).join('\n');
  throw new Error(
    `Missing or invalid web environment configuration:\n${issues}\n\n` +
      'Copy apps/web/.env.example to apps/web/.env.local and fill in the values.',
  );
}

export const env = parsed.env;
export const isDevelopment = env.appEnv === 'development';
