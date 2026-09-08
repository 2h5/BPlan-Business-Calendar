import { useEffect } from 'react';

import { TodayView } from '../features/today/components/TodayView';

export function TodayPage() {
  useEffect(() => {
    document.title = 'BCal — Today';
  }, []);

  return <TodayView />;
}
