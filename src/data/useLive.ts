import { useMemo, useSyncExternalStore } from 'react';

import { getDb } from '@/db/client';
import type { Db } from '@/db/types';

import { getVersion, subscribe } from './bus';

/**
 * Runs a synchronous database query and re-runs it whenever any repository
 * writes, or when one of `deps` changes. Queries are indexed and small, so
 * this stays well under a frame.
 *
 * `deps` must be primitives (ids, days, keys): they are compared by value.
 */
export function useLive<T>(
  query: (db: Db) => T,
  deps: readonly (string | number | boolean | null | undefined)[] = [],
): T {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const key = deps.map((d) => `${typeof d}:${String(d)}`).join('|');
  // `query` is a fresh closure on every render; `key` stands in for what it captures.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => query(getDb()), [version, key]);
}
