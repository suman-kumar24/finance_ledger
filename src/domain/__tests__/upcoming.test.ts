import { account, entry } from '../../../test/factories';
import { cardStatus } from '../cards';
import { planNotifications, parseTime, plannedDate, type PlanInput } from '../notifications';
import type { RecurringRule } from '../types';
import { upcoming } from '../upcoming';

const card = account('card', 'credit_card', { name: 'Card', statementDay: 5, dueDay: 25 });
const billed = [entry('expense', 4_000_00, '2025-02-20', 'card')];

function rule(extra: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'r1',
    name: 'Rent',
    type: 'expense',
    amount: 15_000_00,
    accountId: 'bank',
    toAccountId: null,
    categoryId: null,
    method: null,
    frequency: 'monthly',
    interval: 1,
    anchorDay: 1,
    nextDate: '2025-04-01',
    endDate: null,
    mode: 'remind',
    active: true,
    note: null,
    ...extra,
  };
}

describe('coming up (next 14 days)', () => {
  const today = '2025-03-20';
  const cards = [{ account: card, status: cardStatus(card, billed, today) }];

  it('lists card bills, recurring items and scheduled entries in date order', () => {
    const items = upcoming({
      today,
      cards,
      rules: [
        rule(),
        rule({
          id: 'r2',
          name: 'Gym',
          nextDate: '2025-03-22',
          frequency: 'weekly',
          anchorDay: null,
          mode: 'auto',
        }),
      ],
      scheduled: [{ id: 't1', day: '2025-03-21', amount: 500_00, payee: null, type: 'expense' }],
      scheduledTitle: 'Scheduled',
    });
    expect(items.map((i) => [i.kind, i.day, i.title])).toEqual([
      ['scheduled', '2025-03-21', 'Scheduled'],
      ['recurring', '2025-03-22', 'Gym'],
      ['card_bill', '2025-03-25', 'Card'],
      ['recurring', '2025-03-29', 'Gym'],
      ['recurring', '2025-04-01', 'Rent'],
    ]);
    expect(items.find((i) => i.title === 'Gym')?.auto).toBe(true);
    expect(items.find((i) => i.kind === 'card_bill')?.amount).toBe(4_000_00);
  });

  it('keeps overdue items and drops paid bills and things beyond the horizon', () => {
    const late = '2025-03-28';
    const paid = [
      ...billed,
      entry('card_payment', 4_000_00, '2025-03-21', 'bank', { toAccountId: 'card' }),
    ];
    const overdue = upcoming({
      today: late,
      cards: [{ account: card, status: cardStatus(card, billed, late) }],
      rules: [
        rule({ nextDate: '2025-03-01' }),
        rule({ id: 'p', active: false }),
        rule({ id: 'far', nextDate: '2025-06-01' }),
      ],
      scheduled: [
        { id: 't2', day: '2025-05-01', amount: 1, payee: 'Later', type: 'expense' },
        { id: 't3', day: '2025-03-30', amount: 9_00, payee: 'Salary', type: 'income' },
      ],
      scheduledTitle: 'Scheduled',
    });
    expect(overdue.filter((i) => i.overdue).map((i) => i.kind)).toEqual(['recurring', 'card_bill']);
    expect(overdue.find((i) => i.refId === 't3')?.incoming).toBe(true);
    expect(overdue.some((i) => i.refId === 't2' || i.refId === 'far' || i.refId === 'p')).toBe(
      false,
    );
    const none = upcoming({
      today: late,
      cards: [{ account: card, status: cardStatus(card, paid, late) }],
      rules: [],
      scheduled: [],
      scheduledTitle: '',
    });
    expect(none).toEqual([]);
  });
});

describe('notification plan (brief §8)', () => {
  const base: PlanInput = {
    today: '2025-03-20',
    nowMinutes: 12 * 60,
    notifyBills: true,
    notifyRecurring: true,
    dailyReminder: false,
    dailyReminderTime: '21:00',
    exportReminder: false,
    backupEnabled: false,
    lastExportDay: null,
    cards: [{ account: card, status: cardStatus(card, billed, '2025-03-20') }],
    rules: [rule({ nextDate: '2025-04-01' })],
  };

  it('schedules a bill reminder 3 days before and on the due day', () => {
    const plan = planNotifications(base);
    expect(
      plan.filter((n) => n.kind.startsWith('bill')).map((n) => [n.kind, n.day, n.hour]),
    ).toEqual([
      ['bill_soon', '2025-03-22', 9],
      ['bill_today', '2025-03-25', 9],
    ]);
    expect(plan.find((n) => n.kind === 'bill_today')?.amount).toBe(4_000_00);
  });

  it('skips reminders whose time has passed and bills that are paid', () => {
    const onDueDayAfternoon = planNotifications({
      ...base,
      today: '2025-03-25',
      cards: [{ account: card, status: cardStatus(card, billed, '2025-03-25') }],
    });
    expect(onDueDayAfternoon.some((n) => n.kind.startsWith('bill'))).toBe(false);
    const morning = planNotifications({ ...base, today: '2025-03-25', nowMinutes: 7 * 60 });
    expect(morning.filter((n) => n.kind === 'bill_today')).toHaveLength(1);
    const paid = [
      ...billed,
      entry('card_payment', 4_000_00, '2025-03-19', 'bank', { toAccountId: 'card' }),
    ];
    const afterPaying = planNotifications({
      ...base,
      cards: [{ account: card, status: cardStatus(card, paid, '2025-03-20') }],
    });
    expect(afterPaying.some((n) => n.kind.startsWith('bill'))).toBe(false);
  });

  it('schedules each active recurring rule for its next date', () => {
    const plan = planNotifications({
      ...base,
      rules: [
        rule(),
        rule({ id: 'off', active: false }),
        rule({ id: 'ended', nextDate: '2025-05-01', endDate: '2025-04-15' }),
        rule({ id: 'past', nextDate: '2025-03-01' }),
        rule({ id: 'auto', nextDate: '2025-03-28', mode: 'auto' }),
      ],
    });
    const recurring = plan.filter((n) => n.kind === 'recurring');
    expect(recurring.map((n) => n.id)).toEqual(['rule-auto-2025-03-28', 'rule-r1-2025-04-01']);
    expect(recurring[0]?.auto).toBe(true);
  });

  it('respects the switches', () => {
    const plan = planNotifications({ ...base, notifyBills: false, notifyRecurring: false });
    expect(plan).toEqual([]);
  });

  it('adds the optional daily reminder at the chosen time', () => {
    const plan = planNotifications({
      ...base,
      dailyReminder: true,
      dailyReminderTime: '22:30',
      notifyBills: false,
      notifyRecurring: false,
    });
    expect(plan).toEqual([
      expect.objectContaining({
        kind: 'daily_reminder',
        repeatsDaily: true,
        hour: 22,
        minute: 30,
        day: null,
      }),
    ]);
    expect(plannedDate(plan[0]!)).toBeNull();
    expect(parseTime('bad')).toEqual({ hour: 21, minute: 0 });
    expect(parseTime('25:99')).toEqual({ hour: 21, minute: 0 });
  });

  it('reminds monthly to export only while Drive backup is off', () => {
    const quiet = { ...base, notifyBills: false, notifyRecurring: false, exportReminder: true };
    expect(planNotifications({ ...quiet, lastExportDay: '2025-03-10' })[0]).toMatchObject({
      kind: 'export_reminder',
      day: '2025-04-09',
    });
    expect(planNotifications({ ...quiet, lastExportDay: '2025-01-01' })[0]).toMatchObject({
      day: '2025-03-21',
    });
    expect(planNotifications({ ...quiet, lastExportDay: null })[0]).toMatchObject({
      day: '2025-04-19',
    });
    expect(planNotifications({ ...quiet, backupEnabled: true })).toEqual([]);
    expect(plannedDate(planNotifications({ ...quiet, lastExportDay: '2025-03-10' })[0]!)).toEqual({
      year: 2025,
      month: 4,
      day: 9,
    });
  });
});
