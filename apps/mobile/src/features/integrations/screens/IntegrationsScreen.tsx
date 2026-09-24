import type { ProviderKind } from '@cal/schemas';
import { ErrorState, LoadingState, Text, useTheme } from '@cal/ui';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { CalendarPickerSheet } from '../components/CalendarPickerSheet';
import { ConnectionCard } from '../components/ConnectionCard';
import { ProviderList } from '../components/ProviderList';
import { CONNECT_MESSAGES, useConnectProvider } from '../hooks/useConnectProvider';
import {
  useConnections,
  useDisconnectAccount,
  useSyncHealth,
  useSyncNow,
} from '../hooks/useIntegrations';
import { PROVIDER_OPTIONS, providerMetadata } from '../provider-metadata';

/**
 * Connected calendars.
 *
 * Composition and interaction only — every server call goes through a hook, and
 * every hook through the API module, so this screen never learns that a
 * connection is four Edge Functions and a job queue.
 */
export function IntegrationsScreen() {
  const theme = useTheme();

  const connections = useConnections();
  // Health is polled while something is still settling — a calendar imported a
  // moment ago is syncing in the background with nothing for the client to await.
  const health = useSyncHealth({ poll: true });

  const connect = useConnectProvider();
  const disconnect = useDisconnectAccount();
  const syncNow = useSyncNow();

  const [pickerAccountId, setPickerAccountId] = useState<string | null>(null);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);

  const onConnect = (provider: ProviderKind) => {
    connect.mutate(provider, {
      onSuccess: (status) => {
        if (status === 'connected') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return;
        }
        // Cancelling is a normal outcome and does not deserve an alert.
        if (status === 'cancelled') return;
        Alert.alert('Not connected', CONNECT_MESSAGES[status]);
      },
      onError: () => Alert.alert('Not connected', CONNECT_MESSAGES.failed),
    });
  };

  const onDisconnect = (accountId: string) => {
    setBusyAccountId(accountId);
    disconnect.mutate(accountId, {
      onSettled: () => setBusyAccountId(null),
      onError: () => Alert.alert('Could not disconnect', 'Check your connection and try again.'),
    });
  };

  const onSyncNow = (accountId: string) => {
    setBusyAccountId(accountId);
    void Haptics.selectionAsync();
    syncNow.mutate(accountId, { onSettled: () => setBusyAccountId(null) });
  };

  if (connections.isLoading) return <LoadingState fullScreen />;

  if (connections.isError) {
    return (
      <ErrorState
        title="Could not load your connections"
        onRetry={() => void connections.refetch()}
      />
    );
  }

  const accounts = connections.data ?? [];
  const connectedKinds = new Set(accounts.map((account) => account.provider));
  const connectingKind = connect.isPending ? (connect.variables ?? null) : null;
  const healthFor = (accountId: string) =>
    (health.data ?? []).filter((entry) => entry.providerAccountId === accountId);

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <Text variant="footnote" color="secondary">
        Connected calendars sync both ways. Events you create on them are written to the provider
        first.
      </Text>

      {accounts.length > 0 ? (
        <View style={{ gap: theme.spacing.lg }}>
          {accounts.map((account) => (
            <ConnectionCard
              key={account.id}
              account={account}
              health={healthFor(account.id)}
              isSyncing={syncNow.isPending && busyAccountId === account.id}
              isDisconnecting={disconnect.isPending && busyAccountId === account.id}
              onChooseCalendars={() => setPickerAccountId(account.id)}
              onSyncNow={() => onSyncNow(account.id)}
              onReconnect={
                providerMetadata(account.provider).available
                  ? () => onConnect(account.provider)
                  : undefined
              }
              onDisconnect={() => onDisconnect(account.id)}
            />
          ))}
        </View>
      ) : null}

      <ProviderList
        title={accounts.length > 0 ? 'Add another calendar' : 'Connect a calendar'}
        providers={PROVIDER_OPTIONS}
        connectedKinds={connectedKinds}
        connectingKind={connectingKind}
        onConnect={onConnect}
      />

      <CalendarPickerSheet
        visible={pickerAccountId !== null}
        providerAccountId={pickerAccountId}
        provider={accounts.find((account) => account.id === pickerAccountId)?.provider ?? null}
        onClose={() => setPickerAccountId(null)}
      />
    </View>
  );
}
