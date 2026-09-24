import type { ProviderKind } from '@cal/schemas';
import { Badge, Button, Card, Divider, ListRow, useTheme } from '@cal/ui';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Fragment } from 'react';
import { View } from 'react-native';

import type { ProviderMetadata } from '../provider-metadata';

type BrandIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Presentation only, so it lives beside the component rather than in metadata. */
const BRAND: Record<ProviderKind, { icon: BrandIconName; color: string }> = {
  google: { icon: 'google', color: '#4285F4' },
  microsoft: { icon: 'microsoft-outlook', color: '#0078D4' },
};

const TILE_SIZE = 40;

export interface ProviderListProps {
  title: string;
  providers: readonly ProviderMetadata[];
  connectedKinds: ReadonlySet<ProviderKind>;
  /** The provider whose sign-in is in flight, if any. */
  connectingKind: ProviderKind | null;
  onConnect: (provider: ProviderKind) => void;
}

/**
 * Every calendar provider on one card, each with its mark and the one action
 * that applies to it: connect, already connected, or not yet available.
 */
export function ProviderList({
  title,
  providers,
  connectedKinds,
  connectingKind,
  onConnect,
}: ProviderListProps) {
  const theme = useTheme();

  return (
    <Card title={title} description="Sign in, then choose which calendars to sync." padded={false}>
      {providers.map((provider, index) => {
        const brand = BRAND[provider.kind];
        const connected = connectedKinds.has(provider.kind);

        const trailing = connected ? (
          <Badge label="Connected" tone="success" />
        ) : !provider.available ? (
          <Badge label="Coming soon" />
        ) : (
          <Button
            label="Connect"
            size="sm"
            variant="secondary"
            loading={connectingKind === provider.kind}
            disabled={connectingKind !== null}
            onPress={() => onConnect(provider.kind)}
            accessibilityLabel={provider.connectLabel}
          />
        );

        return (
          <Fragment key={provider.kind}>
            {index > 0 ? <Divider inset /> : null}
            <ListRow
              title={provider.name}
              subtitle={provider.available ? provider.tagline : provider.unavailableSubtitle}
              leading={
                <View
                  style={{
                    width: TILE_SIZE,
                    height: TILE_SIZE,
                    borderRadius: theme.radius.md,
                    // A white tile, like an app icon, keeps brand colours true in dark mode.
                    backgroundColor: '#FFFFFF',
                    borderWidth: theme.borderWidth.hairline,
                    borderColor: theme.colors.borderSubtle,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MaterialCommunityIcons name={brand.icon} size={24} color={brand.color} />
                </View>
              }
              trailing={trailing}
            />
          </Fragment>
        );
      })}
    </Card>
  );
}
