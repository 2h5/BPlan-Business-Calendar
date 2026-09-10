import { useEffect } from 'react';

import { TodayView } from '../features/today/components/TodayView';

export function TodayPage() {
  useEffect(() => {
    document.title = 'BPlan | Today';
  }, []);

  return <TodayView />;
}
