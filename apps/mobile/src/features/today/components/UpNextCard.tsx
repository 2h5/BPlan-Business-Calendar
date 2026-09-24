import type { HourCycle } from '@cal/schemas';
import { Text, useTheme } from '@cal/ui';
import { Pressable, View } from 'react-native';

import { DayBar } from './DayBar';
import { ProgressRing } from './ProgressRing';
import type { DayBarModel } from '../utils/day-bar';

export interface UpNextCardProps {
  /** "Up next · in 48m", "Now · ends 9:15 AM", "All day". */
  eyebrow: string;
  title: string;
  meta: string | null;
  metaDotColor?: string;
  /** Something is happening right now. */
  live: boolean;
  onPress?: () => void;
  tasksDone: number;
  tasksTotal: number;
  /** "5h 30m free", "Workday done", "Day off". */
  capacity: string;
  capacityDetail: string | null;
  allDayCount: number;
  dayBar: DayBarModel | null;
  hourCycle: HourCycle;
}

/**
 * The top of Today: what is next, how much of today's work is done, and the
 * shape of the day — busy and free — in one card, so the answer to "what does
 * my day look like?" never needs a scroll.
 *
 * The outline and the eyebrow answer "am I free right now?" before anything is
 * read: green when nothing is running, red while an event is. Only those two
 * change — the rest of the card stays as it is in both states, so the signal
 * reads as a frame around the content rather than a warning over it.
 */
export function UpNextCard({
  eyebrow,
  title,
  meta,
  metaDotColor,
  live,
  onPress,
  tasksDone,
  tasksTotal,
  capacity,
  capacityDetail,
  allDayCount,
  dayBar,
  hourCycle,
}: UpNextCardProps) {
  const theme = useTheme();

  // `live` is "an event is running right now", which is exactly the question
  // the colour answers — so busy and free are the two states, nothing else.
  const busy = live;

  return (
    <View
      accessibilityLabel={busy ? 'In an event' : 'Free right now'}
      style={{
        padding: theme.spacing.lg,
        gap: theme.spacing.md,
        borderRadius: theme.radius.xl,
        borderWidth: theme.borderWidth.hairline,
        borderColor: busy ? theme.colors.danger : theme.colors.success,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Pressable
          accessibilityRole={onPress ? 'button' : 'text'}
          accessibilityLabel={[eyebrow, title, meta].filter(Boolean).join(', ')}
          disabled={!onPress}
          onPress={onPress}
          style={({ pressed }) => ({ flex: 1, gap: 2, opacity: pressed ? 0.7 : 1 })}
        >
          <Text variant="caption" color={busy ? 'danger' : 'success'} uppercase>
            {eyebrow}
          </Text>
          <Text variant="title3" numberOfLines={1}>
            {title}
          </Text>
          {meta ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {metaDotColor ? (
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: metaDotColor,
                  }}
                />
              ) : null}
              <Text variant="footnote" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
                {meta}
              </Text>
            </View>
          ) : null}
        </Pressable>

        <ProgressRing done={tasksDone} total={tasksTotal} />
      </View>

      <View
        style={{ height: theme.borderWidth.hairline, backgroundColor: theme.colors.borderSubtle }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm }}>
        <Text variant="footnote" style={{ flex: 1 }} numberOfLines={1}>
          <Text variant="footnote" style={{ fontWeight: '600' }}>
            {capacity}
          </Text>
          {capacityDetail ? (
            <Text variant="footnote" color="secondary">{` · ${capacityDetail}`}</Text>
          ) : null}
        </Text>
        {allDayCount > 0 ? (
          <Text variant="footnote" color="tertiary">
            {allDayCount} all-day
          </Text>
        ) : null}
      </View>

      {dayBar ? <DayBar model={dayBar} hourCycle={hourCycle} /> : null}
    </View>
  );
}
