import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { dayFromDate, type Day } from '@/domain/dates';

/** Today's local day; refreshes when the app returns to the foreground. */
export function useToday(): Day {
  const [today, setToday] = useState(() => dayFromDate(new Date()));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setToday(dayFromDate(new Date()));
    });
    return () => sub.remove();
  }, []);
  return today;
}
