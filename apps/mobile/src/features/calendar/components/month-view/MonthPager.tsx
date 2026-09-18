import { useMemo } from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { MonthGrid, type MonthGridProps } from './MonthGrid';
import { usePageSwipe } from '../../hooks/usePageSwipe';
import { monthGridKeys, monthOfIndex } from '../../utils/window';

export interface MonthPagerProps extends Omit<
  MonthGridProps,
  'dateKeys' | 'focusedMonth' | 'pagerGesture'
> {
  /** Months since year 0 of the month in focus — see `monthIndexOf`. */
  monthIndex: number;
  /** Called once a page turn has finished, with how many months it moved. */
  onChangeMonth: (delta: number) => void;
}

/**
 * The month grid as a horizontal pager: the neighbouring months sit either
 * side of the current one and follow the finger. The paging mechanics live in
 * `usePageSwipe`, shared with the week view.
 */
export function MonthPager({ monthIndex, onChangeMonth, ...gridProps }: MonthPagerProps) {
  const { timeZone, weekStartsOn } = gridProps;
  const { pan, stripStyle, width, slot, onLayout } = usePageSwipe(monthIndex, onChangeMonth);

  const pages = useMemo(
    () =>
      [-1, 0, 1].map((offset) => ({
        slot: slot + offset,
        month: monthOfIndex(monthIndex + offset),
        dateKeys: monthGridKeys(monthIndex + offset, timeZone, weekStartsOn),
      })),
    [slot, monthIndex, timeZone, weekStartsOn],
  );

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1, overflow: 'hidden' }} onLayout={onLayout}>
        <Animated.View style={[{ flex: 1 }, stripStyle]}>
          {width > 0
            ? pages.map((page) => (
                <View
                  key={page.slot}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: page.slot * width,
                    width,
                  }}
                >
                  <MonthGrid
                    {...gridProps}
                    dateKeys={page.dateKeys}
                    focusedMonth={page.month}
                    // Handed down so a bar being dragged across dates stands the
                    // page turn down rather than doing both at once.
                    pagerGesture={pan}
                  />
                </View>
              ))
            : null}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
