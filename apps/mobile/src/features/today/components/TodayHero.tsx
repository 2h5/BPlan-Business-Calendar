import { Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

export interface TodayHeroProps {
  /** e.g. "Wednesday, September 9, 2026". */
  dateLabel: string;
  /** e.g. "9:43 PM". */
  clockLabel: string;
  timeZone: string;
  /** e.g. "Good evening, Dev". */
  greeting: string;
  subtitle: string;
  onNewTask: () => void;
  onNewEvent: () => void;
  onSearch: () => void;
}

/**
 * The web's command hero, stacked for a phone: the actions sit on their own
 * row beneath the greeting rather than beside it, because three controls plus
 * a display-size title do not fit across 402pt.
 */
export function TodayHero({
  dateLabel,
  clockLabel,
  timeZone,
  greeting,
  subtitle,
  onNewTask,
  onNewEvent,
  onSearch,
}: TodayHeroProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        gap: theme.spacing.md,
        paddingBottom: theme.spacing.lg,
        borderBottomWidth: theme.borderWidth.hairline,
        borderBottomColor: theme.colors.borderSubtle,
      }}
    >
      <View style={{ gap: theme.spacing.xs }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: theme.spacing.sm,
          }}
        >
          <Text
            variant="caption"
            uppercase
            numberOfLines={1}
            style={{ color: theme.colors.accent, letterSpacing: 0.9, flexShrink: 1 }}
          >
            {dateLabel}
          </Text>
          <LiveClockChip clockLabel={clockLabel} timeZone={timeZone} />
        </View>

        <Text variant="display">{greeting}</Text>
        <Text variant="subhead" color="secondary" style={{ fontWeight: '400' }}>
          {subtitle}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <HeroAction icon="add" label="New Task" variant="primary" onPress={onNewTask} />
        <HeroAction icon="calendar-outline" label="New Event" onPress={onNewEvent} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search"
          onPress={onSearch}
          style={({ pressed }) => ({
            height: theme.hitSlopSize,
            width: theme.hitSlopSize,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.sm,
            borderWidth: theme.borderWidth.hairline,
            borderColor: theme.colors.border,
            backgroundColor: pressed ? theme.colors.surfaceElevated : theme.colors.surface,
          })}
        >
          <Ionicons name="search" size={17} color={theme.colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The web shows a pulsing dot to say the clock is live. A phone's clock is
 * always live and the animation would run forever behind the tab bar, so the
 * dot is present but static.
 */
function LiveClockChip({ clockLabel, timeZone }: { clockLabel: string; timeZone: string }) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 2,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        borderWidth: theme.borderWidth.hairline,
        borderColor: theme.colors.borderSubtle,
        backgroundColor: theme.colors.surfaceElevated,
      }}
    >
      <View
        style={{ width: 6, height: 6, borderRadius: 2, backgroundColor: theme.colors.success }}
      />
      <Text variant="mono" color="secondary" style={{ fontSize: 12 }}>
        {clockLabel}
      </Text>
      <Text variant="mono" color="tertiary" style={{ fontSize: 11 }} numberOfLines={1}>
        {timeZone}
      </Text>
    </View>
  );
}

interface HeroActionProps {
  icon: 'add' | 'calendar-outline';
  label: string;
  variant?: 'primary' | 'secondary';
  onPress: () => void;
}

function HeroAction({ icon, label, variant = 'secondary', onPress }: HeroActionProps) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        height: theme.hitSlopSize,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.sm,
        borderWidth: theme.borderWidth.hairline,
        borderColor: isPrimary ? theme.colors.accentSubtle : theme.colors.border,
        backgroundColor: isPrimary
          ? pressed
            ? theme.colors.accentPressed
            : theme.colors.accent
          : pressed
            ? theme.colors.surfaceElevated
            : theme.colors.surfaceRaised,
      })}
    >
      <Ionicons
        name={icon}
        size={15}
        color={isPrimary ? theme.colors.onAccent : theme.colors.textPrimary}
      />
      <Text
        variant="subhead"
        color={isPrimary ? 'onAccent' : 'primary'}
        numberOfLines={1}
        style={{ fontWeight: '600' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
