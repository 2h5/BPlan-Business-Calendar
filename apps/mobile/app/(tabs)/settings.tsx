import { Screen } from '@cal/ui';

import { TAB_BAR_CLEARANCE } from '../../src/components/app-shell/floating-layout';
import { SettingsScreen } from '../../src/features/settings/screens/SettingsScreen';

export default function SettingsRoute() {
  return (
    <Screen bottomClearance={TAB_BAR_CLEARANCE}>
      <SettingsScreen />
    </Screen>
  );
}
