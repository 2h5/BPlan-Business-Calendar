import { Text } from '@cal/ui';
import { useCallback, useState } from 'react';
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';

import { FindTimeBox } from './FindTimeBox';
import { FindTimePill, FindTimeSendButton } from './FindTimePill';
import { useRotatingExample } from '../hooks/useRotatingExample';

export interface FindTimeBarProps {
  timeZone: string;
}

/**
 * Find Time folded into a one-line bar, so it stays in reach on Today without
 * taking the top of the screen. Tapping it opens the full box in place with
 * the field focused; it folds back once the field is left empty. While
 * folded it cycles through example requests, and the open field starts from
 * whichever one was showing.
 */
export function FindTimeBar({ timeZone }: FindTimeBarProps) {
  const [expanded, setExpanded] = useState(false);
  const { example, style } = useRotatingExample(expanded);
  const collapse = useCallback(() => setExpanded(false), []);

  if (expanded) {
    return (
      <FindTimeBox
        timeZone={timeZone}
        placeholder={example}
        autoFocus
        onIdleBlur={collapse}
        onFinished={collapse}
      />
    );
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
          <Animated.View style={style}>
            <Text variant="callout" color="tertiary" numberOfLines={1}>
              {example}
            </Text>
          </Animated.View>
        </FindTimePill>
      )}
    </Pressable>
  );
}
