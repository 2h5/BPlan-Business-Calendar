import { useTheme } from '@cal/ui';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { StyleSheet, View } from 'react-native';

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <NativeTabs
        iconColor={{ default: theme.colors.textTertiary, selected: theme.colors.accent }}
        labelStyle={{
          default: { color: theme.colors.textTertiary },
          selected: { color: theme.colors.accent },
        }}
        minimizeBehavior="automatic"
      >
        <NativeTabs.Trigger name="today">
          <Icon sf={{ default: 'sun.max', selected: 'sun.max.fill' }} />
          <Label>Today</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="calendar">
          <Icon sf={{ default: 'calendar', selected: 'calendar' }} />
          <Label>Calendar</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="tasks">
          <Icon sf={{ default: 'checkmark.square', selected: 'checkmark.square.fill' }} />
          <Label>Tasks</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
          <Label>Settings</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="quick-add" hidden />
        <NativeTabs.Trigger name="search" hidden />
      </NativeTabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
