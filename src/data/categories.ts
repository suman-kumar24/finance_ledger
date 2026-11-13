import { asc, eq, sql } from 'drizzle-orm';

import { categories, transactions } from '@/db/schema';
import type { Db } from '@/db/types';
import { CATEGORY_SEEDS, PALETTE } from '@/domain/defaults';
import type { Category, CategoryKind } from '@/domain/types';
import { newId } from '@/lib/id';

import { emitChange } from './bus';
import type { Language } from './settings';

type Row = typeof categories.$inferSelect;

function toCategory(row: Row): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    icon: row.icon,
    color: row.color,
    parentId: row.parentId,
    archived: row.archived,
    systemKey: row.systemKey,
    sortOrder: row.sortOrder,
  };
}

export function listCategories(db: Db, options: { includeArchived?: boolean } = {}): Category[] {
  const rows = db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name))
    .all();
  return rows.map(toCategory).filter((c) => options.includeArchived || !c.archived);
}

export function getCategory(db: Db, id: string): Category | null {
  const row = db.select().from(categories).where(eq(categories.id, id)).get();
  return row ? toCategory(row) : null;
}

export interface CategoryInput {
  name: string;
  kind: CategoryKind;
  icon?: string;
  color?: string;
  parentId?: string | null;
}

export function createCategory(db: Db, input: CategoryInput, now = Date.now()): Category {
  const count =
    db
      .select({ n: sql<number>`count(*)` })
      .from(categories)
      .get()?.n ?? 0;
  let parentId = input.parentId ?? null;
  let kind = input.kind;
  if (parentId !== null) {
    const parent = getCategory(db, parentId);
    // One level of subcategories only: a child cannot be a parent.
    if (!parent || parent.parentId !== null) parentId = null;
    else kind = parent.kind;
  }
  const row: Row = {
    id: newId(),
    name: input.name.trim(),
    kind,
    icon: input.icon ?? 'tag-outline',
    color: input.color ?? PALETTE[count % PALETTE.length] ?? '#7F8C8D',
    parentId,
    archived: false,
    systemKey: null,
    sortOrder: count,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(categories).values(row).run();
  emitChange();
  return toCategory(row);
}

export function updateCategory(
  db: Db,
  id: string,
  patch: Partial<Pick<Category, 'name' | 'icon' | 'color' | 'archived'>>,
  now = Date.now(),
): void {
  db.update(categories)
    .set({ ...patch, ...(patch.name ? { name: patch.name.trim() } : {}), updatedAt: now })
    .where(eq(categories.id, id))
    .run();
  emitChange();
}

export function categoryUsage(db: Db, id: string): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(transactions)
      .where(eq(transactions.categoryId, id))
      .get()?.n ?? 0
  );
}

/**
 * Deletes a category that has never been used; otherwise archives it so past
 * months keep their labels. Returns what happened.
 */
export function removeCategory(db: Db, id: string, now = Date.now()): 'deleted' | 'archived' {
  const children = db.select().from(categories).where(eq(categories.parentId, id)).all();
  const used = categoryUsage(db, id) > 0 || children.length > 0;
  if (used) {
    db.update(categories)
      .set({ archived: true, updatedAt: now })
      .where(eq(categories.id, id))
      .run();
    emitChange();
    return 'archived';
  }
  db.delete(categories).where(eq(categories.id, id)).run();
  emitChange();
  return 'deleted';
}

/** Inserts the editable default categories (once), named in the chosen language. */
export function seedDefaultCategories(db: Db, language: Language, now = Date.now()): number {
  const existing = new Set(
    db
      .select({ key: categories.systemKey })
      .from(categories)
      .all()
      .map((r) => r.key),
  );
  const rows: Row[] = CATEGORY_SEEDS.filter((s) => !existing.has(s.key)).map((seed) => ({
    id: newId(),
    name: seed.name[language],
    kind: seed.kind,
    icon: seed.icon,
    color: seed.color,
    parentId: null,
    archived: false,
    systemKey: seed.key,
    sortOrder: CATEGORY_SEEDS.indexOf(seed),
    createdAt: now,
    updatedAt: now,
  }));
  if (rows.length > 0) {
    db.insert(categories).values(rows).run();
    emitChange();
  }
  return rows.length;
}
