import { Screen } from '@cal/ui';

import { CalendarScreen } from '../../src/features/calendar/screens/CalendarScreen';

export default function CalendarScreenRoute() {
  // The day and week timelines scroll internally, so the Screen must not add
  // a second vertical ScrollView around them. They run under the floating tab
  // bar and pad their own ends, so no bottom inset here.
  return (
    <Screen scrollable={false} contentStyle={{ paddingBottom: 0 }}>
      <CalendarScreen />
    </Screen>
  );
}
