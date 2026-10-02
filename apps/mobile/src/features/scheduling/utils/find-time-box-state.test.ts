import { describe, expect, it } from 'vitest';

import {
  deriveFindTimeBoxState,
  staleResultsOnEdit,
  type FindTimeBoxInputs,
} from './find-time-box-state';

function inputs(
  overrides: {
    text?: string;
    findTime?: Partial<FindTimeBoxInputs['findTime']>;
    confirmSlot?: Partial<FindTimeBoxInputs['confirmSlot']>;
    edit?: Partial<FindTimeBoxInputs['edit']>;
  } = {},
): FindTimeBoxInputs {
  return {
    text: overrides.text ?? '',
    findTime: {
      isPending: false,
      hasProposal: false,
      hasClarification: false,
      errorMessage: null,
      requiresUpgrade: false,
      ...overrides.findTime,
    },
    confirmSlot: { hasConfirmation: false, errorMessage: null, ...overrides.confirmSlot },
    edit: {
      isPending: false,
      optionCount: 0,
      hasClarification: false,
      hasMoved: false,
      errorMessage: null,
      requiresUpgrade: false,
      ...overrides.edit,
    },
  };
}

describe('deriveFindTimeBoxState', () => {
  it('is idle and cannot submit when empty', () => {
    expect(deriveFindTimeBoxState(inputs())).toEqual({
      isPending: false,
      canSubmit: false,
      errorMessage: null,
      requiresUpgrade: false,
      editShowing: false,
      finished: false,
      hasResults: false,
      isIdle: true,
    });
  });

  it('does not treat whitespace as something to submit', () => {
    const state = deriveFindTimeBoxState(inputs({ text: '   ' }));

    expect(state.canSubmit).toBe(false);
    expect(state.isIdle).toBe(true);
  });

  it('can submit typed text and is no longer idle', () => {
    const state = deriveFindTimeBoxState(inputs({ text: 'Coffee Friday' }));

    expect(state.canSubmit).toBe(true);
    expect(state.isIdle).toBe(false);
  });

  it.each([
    ['a search', { findTime: { isPending: true } }],
    ['a move', { edit: { isPending: true } }],
  ])('blocks a second submit while %s is pending', (_label, pending) => {
    const state = deriveFindTimeBoxState(inputs({ text: 'Coffee Friday', ...pending }));

    expect(state.isPending).toBe(true);
    expect(state.canSubmit).toBe(false);
    expect(state.hasResults).toBe(true);
  });

  it('shows the search error before the booking error, and that before the move error', () => {
    const all = inputs({
      findTime: { errorMessage: 'search failed' },
      confirmSlot: { errorMessage: 'booking failed' },
      edit: { errorMessage: 'move failed' },
    });
    expect(deriveFindTimeBoxState(all).errorMessage).toBe('search failed');

    const noSearch = inputs({
      confirmSlot: { errorMessage: 'booking failed' },
      edit: { errorMessage: 'move failed' },
    });
    expect(deriveFindTimeBoxState(noSearch).errorMessage).toBe('booking failed');

    const onlyMove = inputs({ edit: { errorMessage: 'move failed' } });
    expect(deriveFindTimeBoxState(onlyMove).errorMessage).toBe('move failed');
  });

  it.each([
    ['search', { findTime: { requiresUpgrade: true } }],
    ['move', { edit: { requiresUpgrade: true } }],
  ])('offers an upgrade when the %s needs Pro', (_label, upgrade) => {
    expect(deriveFindTimeBoxState(inputs(upgrade)).requiresUpgrade).toBe(true);
  });

  it.each([
    ['move options', { edit: { optionCount: 2 } }],
    ['a move question', { edit: { hasClarification: true } }],
    ['a saved move', { edit: { hasMoved: true } }],
  ])('shows the edit flow for %s', (_label, edit) => {
    const state = deriveFindTimeBoxState(inputs(edit));

    expect(state.editShowing).toBe(true);
    expect(state.hasResults).toBe(true);
  });

  it.each([
    ['a proposal', { findTime: { hasProposal: true } }],
    ['a clarification', { findTime: { hasClarification: true } }],
    ['a confirmation', { confirmSlot: { hasConfirmation: true } }],
    ['an error', { confirmSlot: { errorMessage: 'taken' } }],
  ])('has results for %s', (_label, result) => {
    const state = deriveFindTimeBoxState(inputs(result));

    expect(state.hasResults).toBe(true);
    expect(state.isIdle).toBe(false);
  });

  it.each([
    ['a booking', { confirmSlot: { hasConfirmation: true } }],
    ['a move', { edit: { hasMoved: true } }],
  ])('is finished after %s', (_label, done) => {
    expect(deriveFindTimeBoxState(inputs(done)).finished).toBe(true);
  });

  it('is not finished while only a proposal is showing', () => {
    expect(deriveFindTimeBoxState(inputs({ findTime: { hasProposal: true } })).finished).toBe(
      false,
    );
  });
});

describe('staleResultsOnEdit', () => {
  it('resets nothing when nothing is showing', () => {
    expect(staleResultsOnEdit(inputs())).toEqual({
      findTime: false,
      confirmSlot: false,
      edit: false,
    });
  });

  it('does not reset a search that is still pending', () => {
    expect(staleResultsOnEdit(inputs({ findTime: { isPending: true } })).findTime).toBe(false);
  });

  it.each([[{ hasProposal: true }], [{ hasClarification: true }], [{ errorMessage: 'failed' }]])(
    'resets the search answer %o',
    (findTime) => {
      expect(staleResultsOnEdit(inputs({ findTime }))).toEqual({
        findTime: true,
        confirmSlot: false,
        edit: false,
      });
    },
  );

  it.each([[{ hasConfirmation: true }], [{ errorMessage: 'taken' }]])(
    'resets the booking %o',
    (confirmSlot) => {
      expect(staleResultsOnEdit(inputs({ confirmSlot })).confirmSlot).toBe(true);
    },
  );

  it.each([
    [{ optionCount: 1 }],
    [{ hasClarification: true }],
    [{ hasMoved: true }],
    [{ errorMessage: 'failed' }],
  ])('resets the edit %o', (edit) => {
    expect(staleResultsOnEdit(inputs({ edit })).edit).toBe(true);
  });
});
