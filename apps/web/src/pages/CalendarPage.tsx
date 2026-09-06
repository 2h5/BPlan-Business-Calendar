import { useEffect } from 'react';

import { CalendarView } from '../features/calendar';

export function CalendarPage() {
  useEffect(() => {
    document.title = 'BCal — Calendar';
  }, []);

  return <CalendarView />;
}
