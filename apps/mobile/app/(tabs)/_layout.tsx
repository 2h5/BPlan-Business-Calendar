import { useTheme } from '@cal/ui';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <NativeTabs
      iconColor={{ default: theme.colors.textTertiary, selected: theme.colors.accent }}
      minimizeBehavior="automatic"
    >
      {/* Icon-only tabs. `<Label hidden />` clears the title, which is what lets
          UIKit centre the icon in the item instead of seating it above a
          reserved text line. The label text stays as the accessibility name. */}
      <NativeTabs.Trigger name="today">
        <Icon sf={{ default: 'sun.max', selected: 'sun.max.fill' }} />
        <Label hidden>Today</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar">
        <Icon sf={{ default: 'calendar', selected: 'calendar' }} />
        <Label hidden>Calendar</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tasks">
        <Icon sf={{ default: 'checkmark.square', selected: 'checkmark.square.fill' }} />
        <Label hidden>Tasks</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
        <Label hidden>Settings</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="quick-add" hidden />
    </NativeTabs>
  );
}
