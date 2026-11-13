import type { Lookups } from '@/data/queries';
import type { Day } from '@/domain/dates';

import type { EntryForm } from './useEntryForm';

/** Voice and typed-phrase entry; arrives with the parser in Phase 6. */
export function QuickText(_props: {
  lookups: Lookups;
  today: Day;
  onFocusChange: (focused: boolean) => void;
  onParsed: (
    changes: Partial<EntryForm>,
    doubtful: ('amount' | 'category' | 'account' | 'date' | 'type' | 'method')[],
  ) => void;
}) {
  return null;
}
