import { useEffect } from 'react';

import { CustomizeView } from '../features/settings/components/CustomizeView';

export function CustomizePage() {
  useEffect(() => {
    document.title = 'BPlan | Customize';
  }, []);

  return <CustomizeView />;
}
