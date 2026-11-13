import { create } from 'zustand';

import type { TransactionFilter } from '@/data/transactions';

export interface SnackbarState {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface UiState {
  /** Period shown on Overview and Reports; null means "the current period". */
  periodKey: string | null;
  setPeriodKey: (key: string | null) => void;

  filter: TransactionFilter;
  setFilter: (filter: TransactionFilter) => void;

  snackbar: SnackbarState | null;
  showSnackbar: (message: string, actionLabel?: string, onAction?: () => void) => void;
  hideSnackbar: () => void;

  locked: boolean;
  setLocked: (locked: boolean) => void;
}

let snackbarId = 0;

/** UI-only state. Anything that must survive a restart lives in the database. */
export const useUi = create<UiState>((set) => ({
  periodKey: null,
  setPeriodKey: (periodKey) => set({ periodKey }),

  filter: {},
  setFilter: (filter) => set({ filter }),

  snackbar: null,
  showSnackbar: (message, actionLabel, onAction) =>
    set({ snackbar: { id: (snackbarId += 1), message, actionLabel, onAction } }),
  hideSnackbar: () => set({ snackbar: null }),

  locked: false,
  setLocked: (locked) => set({ locked }),
}));
