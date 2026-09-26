import { describe, expect, it } from 'vitest';

import { createCyclingSequence, createFindTimePromptSequence } from './find-time-prompts';

/** Deterministic PRNG so tests are repeatable. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('createFindTimePromptSequence', () => {
  it('yields quoted, filled-in examples', () => {
    const next = createFindTimePromptSequence(seeded(1));
    for (let i = 0; i < 200; i++) {
      const example = next();
      expect(example).toMatch(/^“.+”$/);
      expect(example).not.toContain('{name}');
      expect(example).not.toMatch(/\s{2}|undefined/);
    }
  });

  it('never repeats a phrase within a long stretch', () => {
    const next = createFindTimePromptSequence(seeded(7));
    const shown = Array.from({ length: 60 }, next);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it('produces a large variety over time', () => {
    const next = createFindTimePromptSequence(seeded(42));
    const shown = new Set(Array.from({ length: 1000 }, next));
    expect(shown.size).toBeGreaterThan(500);
  });

  it('does not show the same activity twice in a row', () => {
    const next = createFindTimePromptSequence(seeded(3));
    let previous = '';
    for (let i = 0; i < 100; i++) {
      const lead = next().split(' ').slice(0, 2).join(' ');
      expect(lead).not.toBe(previous);
      previous = lead;
    }
  });
});

describe('createCyclingSequence', () => {
  it('cycles a fixed list in order', () => {
    const next = createCyclingSequence(['a', 'b']);
    expect([next(), next(), next()]).toEqual(['a', 'b', 'a']);
  });
});
