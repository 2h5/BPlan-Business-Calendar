import { SegmentedControl, type SegmentedOption } from '@cal/ui';
import NativeSegmentedControl from '@react-native-segmented-control/segmented-control';
import { Platform } from 'react-native';

import type { CalendarViewMode } from '../../../store/calendar-view.store';

export interface CalendarViewSwitcherProps {
  options: readonly SegmentedOption<CalendarViewMode>[];
  value: CalendarViewMode;
  onChange: (value: CalendarViewMode) => void;
}

/**
 * The Day / Week / Month / Agenda switcher. On iOS it is the system's own
 * segmented control, so it renders as Liquid Glass and moves exactly as
 * UIKit's does; Android keeps the app's drawn control.
 */
export function CalendarViewSwitcher({ options, value, onChange }: CalendarViewSwitcherProps) {
  if (Platform.OS !== 'ios') {
    return <SegmentedControl options={options} value={value} onChange={onChange} />;
  }

  return (
    <NativeSegmentedControl
      values={options.map((option) => option.label)}
      selectedIndex={options.findIndex((option) => option.value === value)}
      onChange={(event) => {
        const next = options[event.nativeEvent.selectedSegmentIndex];
        if (next) onChange(next.value);
      }}
      accessibilityLabel="Calendar view"
      style={{ height: 36 }}
    />
  );
}
