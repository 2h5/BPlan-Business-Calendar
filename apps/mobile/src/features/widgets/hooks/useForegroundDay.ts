import { toZonedDateKey } from '@cal/domain';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Today's local date key, refreshed whenever the app comes to the foreground.
 *
 * The widget's data window is anchored on today. Without this, an app left
 * running overnight would keep feeding the widget yesterday's window.
 */
export function useForegroundDay(timeZone: string): string {
  const [dayKey, setDayKey] = useState(() => toZonedDateKey(new Date(), timeZone));

  useEffect(() => {
    setDayKey(toZonedDateKey(new Date(), timeZone));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setDayKey(toZonedDateKey(new Date(), timeZone));
    });
    return () => subscription.remove();
  }, [timeZone]);

  return dayKey;
}
