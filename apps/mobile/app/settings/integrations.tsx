import { Screen } from '@cal/ui';

import { useAuth } from '../../src/features/auth';
import { IntegrationsScreen } from '../../src/features/integrations';

/**
 * Also the OAuth return target: the callback function redirects to
 * `calendarapp://settings/integrations`, which resolves to this route.
 */
export default function IntegrationsRoute() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return null;

  return (
    <Screen belowHeader>
      <IntegrationsScreen />
    </Screen>
  );
}
