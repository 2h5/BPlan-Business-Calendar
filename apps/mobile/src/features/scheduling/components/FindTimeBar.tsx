import { Text } from '@cal/ui';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { FindTimeBox } from './FindTimeBox';
import { FindTimePill, FindTimeSendButton } from './FindTimePill';

export interface FindTimeBarProps {
  timeZone: string;
}

/**
 * Find Time folded into a one-line bar, so it stays in reach on Today without
 * taking the top of the screen. Tapping it opens the full box in place with
 * the field focused; it folds back once the field is left empty.
 */
export function FindTimeBar({ timeZone }: FindTimeBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return <FindTimeBox timeZone={timeZone} autoFocus onIdleBlur={() => setExpanded(false)} />;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Find a time"
      accessibilityHint="Describe a meeting and get three open slots"
      onPress={() => setExpanded(true)}
    >
      {({ pressed }) => (
        <FindTimePill pressed={pressed} trailing={<FindTimeSendButton enabled={false} />}>
          <Text variant="callout" color="tertiary" numberOfLines={1}>
            Find a time… “Coffee with Pat Friday”
          </Text>
        </FindTimePill>
      )}
    </Pressable>
  );
}
