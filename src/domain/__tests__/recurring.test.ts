import { monthlyEquivalent, occurrenceAfter, occurrencesUntil, resolveDue } from '../recurring';
import type { Frequency } from '../types';

function schedule(frequency: Frequency, nextDate: string, extra: Record<string, unknown> = {}) {
  return {
    frequency,
    interval: 1,
    anchorDay: null,
    nextDate,
    endDate: null,
    active: true,
    ...extra,
  };
}

describe('recurring schedules', () => {
  it('steps by each frequency', () => {
    expect(occurrenceAfter(schedule('daily', '2025-01-31'), '2025-01-31')).toBe('2025-02-01');
    expect(occurrenceAfter(schedule('weekly', '2025-01-31'), '2025-01-31')).toBe('2025-02-07');
    expect(occurrenceAfter(schedule('monthly', '2025-01-15'), '2025-01-15')).toBe('2025-02-15');
    expect(occurrenceAfter(schedule('quarterly', '2025-01-15'), '2025-01-15')).toBe('2025-04-15');
    expect(occurrenceAfter(schedule('yearly', '2024-02-29'), '2024-02-29')).toBe('2025-02-28');
    expect(occurrenceAfter(schedule('weekly', '2025-01-01', { interval: 2 }), '2025-01-01')).toBe(
      '2025-01-15',
    );
  });

  it('keeps month-end rules on the month end using the anchor day', () => {
    const rent = schedule('monthly', '2025-01-31', { anchorDay: 31 });
    expect(occurrencesUntil(rent, '2025-04-30')).toEqual([
      '2025-01-31',
      '2025-02-28',
      '2025-03-31',
      '2025-04-30',
    ]);
  });

  it('lists what is due and moves the next date on', () => {
    const sip = schedule('monthly', '2025-01-05', { anchorDay: 5 });
    expect(resolveDue(sip, '2025-03-10')).toEqual({
      due: ['2025-01-05', '2025-02-05', '2025-03-05'],
      nextDate: '2025-04-05',
      stillActive: true,
    });
    expect(resolveDue(sip, '2025-01-04')).toEqual({
      due: [],
      nextDate: '2025-01-05',
      stillActive: true,
    });
  });

  it('stops at the end date', () => {
    const emi = schedule('monthly', '2025-01-05', { anchorDay: 5, endDate: '2025-02-20' });
    expect(resolveDue(emi, '2025-06-01')).toEqual({
      due: ['2025-01-05', '2025-02-05'],
      nextDate: '2025-03-05',
      stillActive: false,
    });
  });

  it('does nothing for a paused rule and caps a runaway backlog', () => {
    expect(
      resolveDue(schedule('daily', '2025-01-01', { active: false }), '2025-06-01').due,
    ).toEqual([]);
    expect(occurrencesUntil(schedule('daily', '2020-01-01'), '2025-01-01')).toHaveLength(120);
    expect(
      occurrencesUntil(schedule('daily', '2025-01-01', { interval: 0 }), '2025-01-03'),
    ).toHaveLength(3);
  });

  it('estimates a monthly equivalent', () => {
    expect(monthlyEquivalent({ amount: 1_200_00, frequency: 'yearly', interval: 1 })).toBe(100_00);
    expect(monthlyEquivalent({ amount: 300_00, frequency: 'quarterly', interval: 1 })).toBe(100_00);
    expect(monthlyEquivalent({ amount: 500_00, frequency: 'monthly', interval: 2 })).toBe(250_00);
    expect(monthlyEquivalent({ amount: 120_00, frequency: 'weekly', interval: 1 })).toBe(520_00);
    expect(monthlyEquivalent({ amount: 12_00, frequency: 'daily', interval: 1 })).toBe(365_00);
  });
});
