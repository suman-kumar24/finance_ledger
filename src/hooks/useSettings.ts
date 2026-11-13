import { useLive } from '@/data/useLive';
import { getSettings, type Settings } from '@/data/settings';

export function useSettings(): Settings {
  return useLive(getSettings);
}
