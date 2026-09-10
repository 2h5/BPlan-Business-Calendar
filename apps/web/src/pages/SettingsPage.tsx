import { useEffect } from 'react';

import { SettingsView } from '../features/settings/components/SettingsView';

export function SettingsPage() {
  useEffect(() => {
    document.title = 'BPlan | Settings';
  }, []);

  return <SettingsView />;
}
