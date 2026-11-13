import { desc, eq } from 'drizzle-orm';

import { categoryKeywords } from '@/db/schema';
import type { Db } from '@/db/types';
import { newId } from '@/lib/id';

import { emitChange } from './bus';

export interface KeywordRow {
  id: string;
  keyword: string;
  categoryId: string;
  origin: 'user' | 'learned';
  hits: number;
}

function normalize(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function listKeywords(db: Db): KeywordRow[] {
  return db
    .select()
    .from(categoryKeywords)
    .orderBy(desc(categoryKeywords.updatedAt))
    .all()
    .map(({ updatedAt: _u, ...row }) => row);
}

/**
 * Links a keyword to a category. A keyword the user typed in Settings is
 * never overwritten by something the app merely learned.
 */
export function saveKeyword(
  db: Db,
  keyword: string,
  categoryId: string,
  origin: 'user' | 'learned',
  now = Date.now(),
): void {
  const key = normalize(keyword);
  if (key.length < 2) return;
  const existing = db
    .select()
    .from(categoryKeywords)
    .where(eq(categoryKeywords.keyword, key))
    .get();
  if (existing) {
    if (existing.origin === 'user' && origin === 'learned') return;
    db.update(categoryKeywords)
      .set({
        categoryId,
        origin,
        hits: existing.categoryId === categoryId ? existing.hits + 1 : 1,
        updatedAt: now,
      })
      .where(eq(categoryKeywords.id, existing.id))
      .run();
  } else {
    db.insert(categoryKeywords)
      .values({ id: newId(), keyword: key, categoryId, origin, hits: 1, updatedAt: now })
      .run();
  }
  emitChange();
}

export function deleteKeyword(db: Db, id: string): void {
  db.delete(categoryKeywords).where(eq(categoryKeywords.id, id)).run();
  emitChange();
}
