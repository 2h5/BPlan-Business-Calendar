import { Screen } from '@cal/ui';
import { useLocalSearchParams } from 'expo-router';

import { SignedIn } from '../../src/features/auth';
import { useFocusDateFromParam } from '../../src/features/calendar/hooks/useFocusDateFromParam';
import { CalendarScreen } from '../../src/features/calendar/screens/CalendarScreen';

function CalendarTab() {
  // The Home Screen widget deep-links here with the day to open.
  const { date } = useLocalSearchParams<{ date?: string }>();
  useFocusDateFromParam(date);

  // The day and week timelines scroll internally, so the Screen must not add
  // a second vertical ScrollView around them. They run under the floating tab
  // bar and pad their own ends, so no bottom inset here.
  return (
    <Screen scrollable={false} contentStyle={{ paddingBottom: 0 }}>
      <CalendarScreen />
    </Screen>
  );
}

export default function CalendarScreenRoute() {
  return (
    <SignedIn>
      <CalendarTab />
    </SignedIn>
  );
}
