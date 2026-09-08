import { describe, expect, it } from 'vitest';

import { buildIlikeOrFilter, sanitizeSearchQuery, searchIlikePattern } from './search-query';

describe('search API safety', () => {
  it('preserves useful punctuation and bounds input', () => {
    expect(sanitizeSearchQuery('  plan%,(private)_notes\\  ')).toBe('plan%,(private)_notes\\');
    expect(sanitizeSearchQuery('x'.repeat(200))).toHaveLength(120);
  });

  it('normalizes whitespace before building a search pattern', () => {
    expect(sanitizeSearchQuery('  quarterly   planning  ')).toBe('quarterly planning');
  });

  it('quotes awkward values inside each PostgREST OR branch', () => {
    expect(buildIlikeOrFilter(['title', 'description'], 'Q4, 2026 (plan).')).toBe(
      'title.ilike."%Q4, 2026 (plan).%",description.ilike."%Q4, 2026 (plan).%"',
    );
    expect(buildIlikeOrFilter(['title'], 'a"b\\c')).toBe(String.raw`title.ilike."%a\"b\\\\c%"`);
  });

  it('treats LIKE wildcards in user input as literal characters', () => {
    expect(searchIlikePattern('100%_done')).toBe(String.raw`%100\%\_done%`);
  });
});
