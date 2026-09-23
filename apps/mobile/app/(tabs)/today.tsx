import { Screen } from '@cal/ui';

import { useTodayRefresh } from '../../src/features/today/hooks/useTodayRefresh';
import { TodayScreen } from '../../src/features/today/screens/TodayScreen';

export default function TodayScreenRoute() {
  const { refreshing, onRefresh } = useTodayRefresh();

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <TodayScreen />
    </Screen>
  );
}
