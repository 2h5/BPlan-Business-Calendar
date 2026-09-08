import { describe, expect, it } from 'vitest';

import { sanitizeSearchQuery } from './search-query';

describe('search API safety', () => {
  it('removes PostgREST expression punctuation and bounds input', () => {
    expect(sanitizeSearchQuery('  plan%,(private)_notes\\  ')).toBe('plan private notes');
    expect(sanitizeSearchQuery('x'.repeat(200))).toHaveLength(120);
  });

  it('normalizes whitespace before building a search pattern', () => {
    expect(sanitizeSearchQuery('  quarterly   planning  ')).toBe('quarterly planning');
  });
});
