import {
  connectResultSchema,
  providerKindSchema,
  type ConnectResult,
  type ProviderKind,
} from '@cal/schemas';
import { z } from 'zod';

export interface OAuthCallbackResult {
  provider: ProviderKind | null;
  status: ConnectResult;
}

/** Parse only the shared provider/result enums from the callback query. */
export function parseOAuthCallback(search: string): OAuthCallbackResult {
  const params = new URLSearchParams(search);
  const provider = providerKindSchema.safeParse(params.get('provider'));
  const status = connectResultSchema.safeParse(params.get('status'));

  if (!provider.success || !status.success) {
    return { provider: null, status: 'invalid_request' };
  }

  return { provider: provider.data, status: status.data };
}

const navigationStateSchema = z.object({
  integrationResult: z.object({
    provider: providerKindSchema.nullable(),
    status: connectResultSchema,
  }),
});

/** Validate the one internal navigation state used to show a callback result. */
export function callbackResultFromNavigationState(value: unknown): OAuthCallbackResult | null {
  const parsed = navigationStateSchema.safeParse(value);
  return parsed.success ? parsed.data.integrationResult : null;
}

export function oauthCallbackMessage(result: OAuthCallbackResult): string {
  const providerName =
    result.provider === 'google'
      ? 'Google Calendar'
      : result.provider === 'microsoft'
        ? 'Microsoft Outlook'
        : 'Calendar provider';

  switch (result.status) {
    case 'connected':
      return `${providerName} connected. Choose calendars to start syncing.`;
    case 'cancelled':
      return 'Connection cancelled.';
    case 'expired':
      return 'That connection attempt expired. Try again.';
    case 'failed':
      return 'We could not finish connecting. Try again.';
    case 'invalid_request':
      return 'That connection callback was not valid. Try again from Settings.';
  }
}
