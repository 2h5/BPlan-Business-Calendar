import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, runnerImport } from 'vite';

import type * as EnvSchema from './src/lib/env-schema';

// https://vite.dev/config/
export default defineConfig(async ({ command, mode }) => {
  // A preview/production bundle with a bad env would otherwise deploy and fail
  // only in the visitor's browser. Fail the build instead. The schema imports
  // workspace TypeScript, so it goes through Vite's module runner, and only
  // for builds: dev and Vitest load this file without it.
  if (command === 'build') {
    const { module } = await runnerImport<typeof EnvSchema>(
      fileURLToPath(new URL('./src/lib/env-schema.ts', import.meta.url)),
    );
    module.assertDeployableWebEnv(loadEnv(mode, process.cwd(), 'VITE_'));
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: false,
    },
    preview: {
      port: 4173,
    },
  };
});
