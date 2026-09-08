import type { ProviderKind } from '@cal/schemas';

export interface WebProviderMetadata {
  readonly kind: ProviderKind;
  readonly name: string;
  readonly mark: string;
  readonly connectLabel: string;
}

const PROVIDER_METADATA: Record<ProviderKind, WebProviderMetadata> = {
  google: {
    kind: 'google',
    name: 'Google Calendar',
    mark: 'G',
    connectLabel: 'Connect Google Calendar',
  },
  microsoft: {
    kind: 'microsoft',
    name: 'Microsoft Outlook',
    mark: 'M',
    connectLabel: 'Connect Microsoft Outlook',
  },
};

export const PROVIDER_OPTIONS: readonly WebProviderMetadata[] = [
  PROVIDER_METADATA.google,
  PROVIDER_METADATA.microsoft,
];

export function providerMetadata(kind: ProviderKind): WebProviderMetadata {
  return PROVIDER_METADATA[kind];
}
