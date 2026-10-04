import { Screen } from '@cal/ui';
import { View } from 'react-native';

import { AddFab } from '../../src/components/app-shell/AddFab';
import { TAB_BAR_CLEARANCE } from '../../src/components/app-shell/floating-layout';
import { SignedIn } from '../../src/features/auth';
import { useTodayRefresh } from '../../src/features/today/hooks/useTodayRefresh';
import { TodayScreen } from '../../src/features/today/screens/TodayScreen';

function TodayTab() {
  const { refreshing, onRefresh } = useTodayRefresh();

  return (
    <View style={{ flex: 1 }}>
      <Screen bottomClearance={TAB_BAR_CLEARANCE} refreshing={refreshing} onRefresh={onRefresh}>
        <TodayScreen />
      </Screen>
      <AddFab />
    </View>
  );
}

export default function TodayScreenRoute() {
  return (
    <SignedIn>
      <TodayTab />
    </SignedIn>
  );
}
