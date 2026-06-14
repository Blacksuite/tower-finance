import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  expectedIncomeBetween,
  incomeOccurrencesBetween,
  nextPayday,
  paydaysBetween,
} from '../src/shared/income';
import type { RecurringIncome } from '../src/shared/types';

const income = (over: Partial<RecurringIncome>): RecurringIncome => ({
  id: 'i1',
  name: 'Salary',
  amount: 3000,
  frequency: 'monthly',
  anchorDate: '2026-01-26',
  intervalDays: null,
  weekendRule: 'exact',
  endsOn: null,
  ...over,
});

describe('income occurrences', () => {
  it('monthly repeats the anchor day of month', () => {
    expect(incomeOccurrencesBetween(income({}), '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-26', '2026-02-26', '2026-03-26', '2026-04-26',
    ]);
  });

  it('monthly clamps the day to short months', () => {
    const inc = income({ anchorDate: '2026-01-31' });
    expect(incomeOccurrencesBetween(inc, '2026-02-01', '2026-04-30')).toEqual([
      '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
  });

  it('weekly steps by 7 days', () => {
    const inc = income({ frequency: 'weekly', anchorDate: '2026-06-05' }); // a Friday
    expect(incomeOccurrencesBetween(inc, '2026-06-01', '2026-06-30')).toEqual([
      '2026-06-05', '2026-06-12', '2026-06-19', '2026-06-26',
    ]);
  });

  it('biweekly and four-weekly step by 14 and 28 days', () => {
    const bi = income({ frequency: 'biweekly', anchorDate: '2026-06-05' });
    expect(incomeOccurrencesBetween(bi, '2026-06-01', '2026-07-31')).toEqual([
      '2026-06-05', '2026-06-19', '2026-07-03', '2026-07-17', '2026-07-31',
    ]);
    const four = income({ frequency: 'four_weekly', anchorDate: '2026-06-05' });
    expect(incomeOccurrencesBetween(four, '2026-06-01', '2026-08-31')).toEqual([
      '2026-06-05', '2026-07-03', '2026-07-31', '2026-08-28',
    ]);
  });

  it('custom steps by intervalDays', () => {
    const inc = income({ frequency: 'custom', intervalDays: 10, anchorDate: '2026-06-01' });
    expect(incomeOccurrencesBetween(inc, '2026-06-01', '2026-06-30')).toEqual([
      '2026-06-01', '2026-06-11', '2026-06-21',
    ]);
  });

  it('weekend rule previous shifts Sat/Sun to Friday', () => {
    // 2026-07-26 is a Sunday
    const inc = income({ weekendRule: 'previous' });
    expect(incomeOccurrencesBetween(inc, '2026-07-01', '2026-07-31')).toEqual(['2026-07-24']);
  });

  it('weekend rule next shifts Sat/Sun to Monday', () => {
    const inc = income({ weekendRule: 'next' });
    expect(incomeOccurrencesBetween(inc, '2026-07-01', '2026-07-31')).toEqual(['2026-07-27']);
  });

  it('weekend shift can move a payout into the window', () => {
    // nominal 2026-08-01 is a Saturday; previous-Friday lands on 31 Jul
    const inc = income({ anchorDate: '2026-08-01', weekendRule: 'previous' });
    expect(incomeOccurrencesBetween(inc, '2026-07-01', '2026-07-31')).toEqual(['2026-07-31']);
  });

  it('endsOn caps occurrences by nominal date', () => {
    const inc = income({ endsOn: '2026-03-01' });
    expect(incomeOccurrencesBetween(inc, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-26', '2026-02-26',
    ]);
  });

  it('skip-ahead finds occurrences years after the anchor', () => {
    const inc = income({ frequency: 'weekly', anchorDate: '2020-01-03' });
    const hits = incomeOccurrencesBetween(inc, '2026-06-01', '2026-06-14');
    expect(hits).toEqual(['2026-06-05', '2026-06-12']);
  });

  it('returns empty for inverted ranges', () => {
    expect(incomeOccurrencesBetween(income({}), '2026-06-30', '2026-06-01')).toEqual([]);
  });
});

describe('paydays & totals', () => {
  const salary = income({});
  const sidegig = income({ id: 'i2', name: 'Side gig', amount: 250, frequency: 'biweekly', anchorDate: '2026-06-05' });

  it('merges paydays across sources, ascending', () => {
    const hits = paydaysBetween([salary, sidegig], '2026-06-01', '2026-06-30');
    expect(hits.map((h) => h.date)).toEqual(['2026-06-05', '2026-06-19', '2026-06-26']);
    expect(hits[2].income.name).toBe('Salary');
  });

  it('nextPayday is the earliest payout strictly after today', () => {
    expect(nextPayday([salary, sidegig], '2026-06-12')?.date).toBe('2026-06-19');
    expect(nextPayday([salary], '2026-06-26')?.date).toBe('2026-07-26');
    expect(nextPayday([], '2026-06-12')).toBeNull();
    expect(nextPayday([income({ endsOn: '2026-01-31' })], '2026-06-12')).toBeNull();
  });

  it('expectedIncomeBetween sums all payouts in the window', () => {
    expect(expectedIncomeBetween([salary, sidegig], '2026-06-01', '2026-06-30')).toBe(3500);
  });
});

describe('daysBetween', () => {
  it('counts whole days across DST boundaries', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // EU DST switch on 29 Mar
    expect(daysBetween('2026-06-12', '2026-06-12')).toBe(0);
    expect(daysBetween('2026-06-12', '2026-06-11')).toBe(-1);
  });
});
