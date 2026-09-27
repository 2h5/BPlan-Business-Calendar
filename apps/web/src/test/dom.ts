// Shared setup for DOM component tests. A DOM test opts in per file with a
// `// @vitest-environment jsdom` docblock and imports this module; every other
// web test keeps running in Vitest's default Node environment.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Vitest globals are off, so Testing Library cannot register its own
// auto-cleanup. Unmount between tests and never leak fake timers into the next.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
