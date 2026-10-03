import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { z } from 'zod';

import { useCalendarViewStore } from '../../../store/calendar-view.store';

const dateParamSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Opens the day view on a `date` route parameter ("2026-10-05"), then clears
 * it. The Home Screen widget links here when a day or an event is tapped.
 *
 * A URL is external input, so anything that is not a date key is ignored.
 */
export function useFocusDateFromParam(date: string | undefined): void {
  const setMode = useCalendarViewStore((state) => state.setMode);
  const setSelectedDateKey = useCalendarViewStore((state) => state.setSelectedDateKey);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!date || handled.current === date) return;
    handled.current = date;

    const parsed = dateParamSchema.safeParse(date);
    if (parsed.success) {
      setSelectedDateKey(parsed.data);
      setMode('day');
    }
    router.setParams({ date: '' });
  }, [date, setMode, setSelectedDateKey]);
}
