import { describe, expect, it } from 'vitest';

import {
  callbackResultFromNavigationState,
  oauthCallbackMessage,
  parseOAuthCallback,
} from './oauth-callback';

describe('OAuth callback parsing', () => {
  it('accepts only the shared provider and result enums', () => {
    expect(parseOAuthCallback('?provider=google&status=connected')).toEqual({
      provider: 'google',
      status: 'connected',
    });
    expect(parseOAuthCallback('?provider=microsoft&status=cancelled')).toEqual({
      provider: 'microsoft',
      status: 'cancelled',
    });
  });

  it('normalizes malformed callback values to a safe invalid result', () => {
    expect(parseOAuthCallback('?provider=unknown&status=connected')).toEqual({
      provider: null,
      status: 'invalid_request',
    });
    expect(parseOAuthCallback('?provider=google&status=provider-error')).toEqual({
      provider: null,
      status: 'invalid_request',
    });
    expect(
      parseOAuthCallback('?provider=google&status=connected&email=secret@example.com'),
    ).toEqual({
      provider: 'google',
      status: 'connected',
    });
  });

  it('validates the transient Settings navigation state', () => {
    expect(
      callbackResultFromNavigationState({
        integrationResult: { provider: 'google', status: 'failed' },
      }),
    ).toEqual({ provider: 'google', status: 'failed' });
    expect(
      callbackResultFromNavigationState({
        integrationResult: { provider: 'google', status: 'not-a-result' },
      }),
    ).toBeNull();
  });

  it('maps outcomes to fixed, provider-safe copy', () => {
    expect(oauthCallbackMessage({ provider: 'microsoft', status: 'expired' })).toContain('expired');
    expect(oauthCallbackMessage({ provider: null, status: 'invalid_request' })).toBe(
      'That connection callback was not valid. Try again from Settings.',
    );
  });
});
