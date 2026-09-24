import { Screen } from '@cal/ui';
import { View } from 'react-native';

import { AddFab } from '../../src/components/app-shell/AddFab';
import { useTodayRefresh } from '../../src/features/today/hooks/useTodayRefresh';
import { TodayScreen } from '../../src/features/today/screens/TodayScreen';

export default function TodayScreenRoute() {
  const { refreshing, onRefresh } = useTodayRefresh();

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={refreshing} onRefresh={onRefresh}>
        <TodayScreen />
      </Screen>
      <AddFab />
    </View>
  );
}
