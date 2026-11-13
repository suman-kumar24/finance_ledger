import { createTestDb } from '../../../test/db';
import * as schema from '../schema';

describe('migrations', () => {
  it('create every table in the schema', () => {
    const { raw } = createTestDb();
    const tables = (
      raw.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[]
    ).map((r) => r.name);
    for (const name of [
      'accounts',
      'categories',
      'transactions',
      'budgets',
      'budget_categories',
      'recurring_rules',
      'goals',
      'goal_contributions',
      'planned_purchases',
      'card_statements',
      'reconciliations',
      'settings',
      'category_keywords',
      'sms_inbox',
      'sms_account_map',
      'alert_log',
    ]) {
      expect(tables).toContain(name);
    }
  });

  it('stores money as INTEGER columns', () => {
    const { raw } = createTestDb();
    const cols = raw.prepare("pragma table_info('transactions')").all() as {
      name: string;
      type: string;
    }[];
    expect(cols.find((c) => c.name === 'amount')?.type).toBe('INTEGER');
  });

  it('indexes the columns the transaction list filters on', () => {
    const { raw } = createTestDb();
    const indexes = (
      raw.prepare("pragma index_list('transactions')").all() as { name: string }[]
    ).map((r) => r.name);
    expect(indexes).toEqual(
      expect.arrayContaining(['tx_day_idx', 'tx_account_day_idx', 'tx_category_day_idx']),
    );
  });

  it('round-trips a row through Drizzle', () => {
    const { db } = createTestDb();
    db.insert(schema.settings).values({ key: 'k', value: '"v"' }).run();
    expect(db.select().from(schema.settings).all()).toEqual([{ key: 'k', value: '"v"' }]);
  });
});
