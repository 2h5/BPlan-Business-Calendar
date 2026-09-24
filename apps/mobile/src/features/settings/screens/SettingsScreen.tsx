import type { ProviderAccount } from '@cal/schemas';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  ListRow,
  LoadingState,
  Text,
  useTheme,
} from '@cal/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { APP_NAME } from '../../../lib/brand';
import { useAuth, useAuthActions } from '../../auth';
import { useConnections } from '../../integrations/hooks/useIntegrations';
import { NotificationSettingsCard } from '../../notifications';
import { AppearanceCard } from '../components/AppearanceCard';
import { CalendarsCard } from '../components/CalendarsCard';
import { PlanCard } from '../components/PlanCard';
import {
  PlanningPreferencesSheet,
  type PlanningPreference,
} from '../components/PlanningPreferencesSheet';
import { useProfile } from '../hooks/useProfile';

/**
 * Identity, planning preferences, reminders, connections, and the destructive
 * actions. Anything still unbuilt is badged rather than hidden, so nobody has
 * to guess whether it is unavailable or simply not written yet.
 */
export function SettingsScreen() {
  const theme = useTheme();
  const { email } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const { data: connections = [] } = useConnections();
  const { signOut, deleteAccount } = useAuthActions();
  const [preference, setPreference] = useState<PlanningPreference | null>(null);

  if (isLoading) return <LoadingState fullScreen />;

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You can sign back in at any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut.mutate() },
    ]);

  // App Store review requires deletion to be reachable in the app itself.
  const confirmDeleteAccount = () =>
    Alert.alert(
      'Delete your account?',
      `This permanently deletes your ${APP_NAME} account, tasks, calendars and events, and disconnects Google and Outlook. Events stored in Google or Outlook themselves are not touched. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () =>
            deleteAccount.mutate(undefined, {
              onError: () =>
                Alert.alert(
                  'Could not delete your account',
                  'Your account is still active. Check your connection and try again.',
                ),
            }),
        },
      ],
    );

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <Text variant="title1">Settings</Text>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
          <Avatar name={profile?.fullName} imageUrl={profile?.avatarUrl} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{profile?.fullName ?? 'Your account'}</Text>
            <Text variant="footnote" color="secondary">
              {email}
            </Text>
          </View>
        </View>
      </Card>

      <PlanCard />

      <Card eyebrow="Planning" padded={false}>
        <ListRow
          title="Time zone"
          meta={profile?.timezone ?? 'UTC'}
          showChevron
          onPress={() => setPreference('timezone')}
        />
        <Divider inset />
        <ListRow
          title="Week starts on"
          meta={profile?.weekStartsOn === 1 ? 'Monday' : 'Sunday'}
          showChevron
          onPress={() => setPreference('weekStartsOn')}
        />
        <Divider inset />
        <ListRow
          title="Clock"
          meta={profile?.hourCycle === 'h23' ? '24-hour' : '12-hour'}
          showChevron
          onPress={() => setPreference('hourCycle')}
        />
        <Divider inset />
        <ListRow
          title="Working hours"
          subtitle="Used when finding time for flexible work"
          meta={`${profile?.workingHours.length ?? 0} days`}
          showChevron
          onPress={() => setPreference('workingHours')}
        />
        <Divider inset />
        <ListRow
          title="Default task duration"
          meta={`${profile?.defaultTaskMinutes ?? 30} min`}
          showChevron
          onPress={() => setPreference('defaultTaskMinutes')}
        />
        <Divider inset />
        <ListRow
          title="Default event duration"
          meta={`${profile?.defaultEventMinutes ?? 60} min`}
          showChevron
          onPress={() => setPreference('defaultEventMinutes')}
        />
      </Card>

      <CalendarsCard />

      <AppearanceCard />

      <NotificationSettingsCard />

      <Card eyebrow="Connections" padded={false}>
        <ListRow
          title="Calendar accounts"
          subtitle={connectionSummary(connections)}
          meta={connections.length > 0 ? String(connections.length) : undefined}
          showChevron
          onPress={() => router.push('/settings/integrations', { dangerouslySingular: true })}
        />
        <Divider inset />
        <ListRow
          title="Find Time with AI"
          subtitle="Find open slots from Today"
          trailing={<Badge label="Pro" tone="accent" />}
          showChevron
          onPress={() => router.push('/(tabs)/today')}
        />
      </Card>

      <View style={{ gap: theme.spacing.md }}>
        <Button
          label="Sign out"
          variant="secondary"
          fullWidth
          loading={signOut.isPending}
          onPress={confirmSignOut}
        />
        <Button
          label="Delete account"
          variant="destructive"
          fullWidth
          loading={deleteAccount.isPending}
          disabled={signOut.isPending}
          onPress={confirmDeleteAccount}
        />
        <Text variant="footnote" color="tertiary" align="center">
          Deleting your account removes your data and revokes every calendar connection.
        </Text>
      </View>

      <PlanningPreferencesSheet
        visible={preference !== null}
        preference={preference}
        profile={profile}
        onClose={() => setPreference(null)}
      />
    </View>
  );
}

/**
 * The row's subtitle carries the state that matters at a glance: a connection
 * that needs re-authorising is the one thing a user cannot discover for
 * themselves, so it outranks the count.
 */
function connectionSummary(connections: ProviderAccount[]): string {
  if (connections.length === 0) return 'Connect a calendar';

  const attention = connections.filter((account) => account.status !== 'active').length;
  if (attention > 0) {
    return attention === 1
      ? '1 account needs reconnecting'
      : `${attention} accounts need reconnecting`;
  }

  return connections.length === 1
    ? '1 account connected'
    : `${connections.length} accounts connected`;
}
