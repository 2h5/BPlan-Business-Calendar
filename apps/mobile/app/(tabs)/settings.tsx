import { Screen } from '@cal/ui';

import { TAB_BAR_CLEARANCE } from '../../src/components/app-shell/floating-layout';
import { SignedIn } from '../../src/features/auth';
import { SettingsScreen } from '../../src/features/settings/screens/SettingsScreen';

function SettingsTab() {
  return (
    <Screen bottomClearance={TAB_BAR_CLEARANCE}>
      <SettingsScreen />
    </Screen>
  );
}

export default function SettingsRoute() {
  return (
    <SignedIn>
      <SettingsTab />
    </SignedIn>
  );
}
