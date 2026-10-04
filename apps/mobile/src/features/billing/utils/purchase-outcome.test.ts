import { describe, expect, it } from 'vitest';

import { classifyPurchaseError } from './purchase-outcome';

describe('classifyPurchaseError', () => {
  it('treats a closed payment sheet as a cancellation with no message', () => {
    expect(classifyPurchaseError({ code: '1' })).toEqual({ kind: 'cancelled', message: null });
    expect(classifyPurchaseError({ code: '2', userCancelled: true }).kind).toBe('cancelled');
  });

  it('reports Ask to Buy as pending, not failed', () => {
    expect(classifyPurchaseError({ code: '20' }).kind).toBe('pending');
  });

  it('groups network and offline errors', () => {
    expect(classifyPurchaseError({ code: '10' }).kind).toBe('offline');
    expect(classifyPurchaseError({ code: '35' }).kind).toBe('offline');
  });

  it('reports store and configuration problems as unavailable', () => {
    for (const code of ['2', '5', '23']) {
      expect(classifyPurchaseError({ code }).kind).toBe('unavailable');
    }
  });

  it('falls back to a generic failure for anything else', () => {
    expect(classifyPurchaseError({ code: '999' }).kind).toBe('failed');
    expect(classifyPurchaseError(new Error('boom')).kind).toBe('failed');
    expect(classifyPurchaseError(null).kind).toBe('failed');
  });

  it('always gives a message for anything that is not a cancellation', () => {
    for (const code of ['3', '10', '15', '20', '23', '999']) {
      expect(classifyPurchaseError({ code }).message).toEqual(expect.any(String));
    }
  });
});
