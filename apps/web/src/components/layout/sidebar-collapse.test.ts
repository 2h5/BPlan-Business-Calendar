import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { initialSidebarCollapsed, writeSidebarCollapsed } from './sidebar-collapse';

const store = new Map<string, string>();

beforeAll(() => {
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  });
});

describe('initialSidebarCollapsed', () => {
  afterEach(() => store.clear());

  it('restores the last state when set to remember', () => {
    expect(initialSidebarCollapsed('remember')).toBe(false);
    writeSidebarCollapsed(true);
    expect(initialSidebarCollapsed('remember')).toBe(true);
  });

  it('ignores the last state when set to always open or collapsed', () => {
    writeSidebarCollapsed(true);
    expect(initialSidebarCollapsed('open')).toBe(false);
    writeSidebarCollapsed(false);
    expect(initialSidebarCollapsed('collapsed')).toBe(true);
  });
});
