import { describe, expect, it } from 'vitest';
import {
  billCountedAmount,
  billExpensesForCycle,
  billMonthlyCost,
  billOccurrencesBetween,
  nextBillOccurrence,
} from '../src/shared/bills';
import { CALENDAR } from '../src/shared/cycles';
import type { Bill, BillPayment } from '../src/shared/types';

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  name: 'Rent',
  amount: 1200,
  categoryId: null,
  description: '',
  frequency: 'monthly',
  anchorDate: '2026-01-01',
  intervalDays: null,
  weekendRule: 'exact',
  endsOn: null,
  estimated: false,
  ...over,
});

describe('billOccurrencesBetween', () => {
  it('one-off returns its single date, only inside the window', () => {
    const b = bill({ frequency: 'once', anchorDate: '2026-07-15' });
    expect(billOccurrencesBetween(b, '2026-06-26', '2026-07-25')).toEqual(['2026-07-15']);
    expect(billOccurrencesBetween(b, '2026-08-01', '2026-12-31')).toEqual([]);
    expect(billOccurrencesBetween(b, '2026-01-01', '2026-07-14')).toEqual([]);
  });

  it('monthly clamps the day in short months', () => {
    const b = bill({ frequency: 'monthly', anchorDate: '2026-01-31' });
    expect(billOccurrencesBetween(b, '2026-02-01', '2026-03-31')).toEqual([
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('weekly/biweekly/four_weekly step by days', () => {
    expect(
      billOccurrencesBetween(bill({ frequency: 'weekly', anchorDate: '2026-06-01' }), '2026-06-01', '2026-06-22'),
    ).toEqual(['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22']);
    expect(
      billOccurrencesBetween(bill({ frequency: 'biweekly', anchorDate: '2026-06-01' }), '2026-06-01', '2026-07-01'),
    ).toEqual(['2026-06-01', '2026-06-15', '2026-06-29']);
  });

  it('quarterly and yearly step by months', () => {
    expect(
      billOccurrencesBetween(bill({ frequency: 'quarterly', anchorDate: '2026-01-10' }), '2026-01-01', '2026-12-31'),
    ).toEqual(['2026-01-10', '2026-04-10', '2026-07-10', '2026-10-10']);
    expect(
      billOccurrencesBetween(bill({ frequency: 'yearly', anchorDate: '2026-03-01' }), '2026-01-01', '2028-12-31'),
    ).toEqual(['2026-03-01', '2027-03-01', '2028-03-01']);
  });

  it('custom steps by intervalDays', () => {
    expect(
      billOccurrencesBetween(
        bill({ frequency: 'custom', anchorDate: '2026-06-01', intervalDays: 10 }),
        '2026-06-01',
        '2026-07-01',
      ),
    ).toEqual(['2026-06-01', '2026-06-11', '2026-06-21', '2026-07-01']);
  });

  it('applies the weekend rule', () => {
    // 13 Jun 2026 is a Saturday → 'previous' shifts to Fri 12 Jun
    const b = bill({ frequency: 'monthly', anchorDate: '2026-06-13', weekendRule: 'previous' });
    expect(billOccurrencesBetween(b, '2026-06-01', '2026-06-30')).toEqual(['2026-06-12']);
  });

  it('endsOn caps occurrences', () => {
    const b = bill({ frequency: 'monthly', anchorDate: '2026-01-15', endsOn: '2026-03-31' });
    expect(billOccurrencesBetween(b, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
    ]);
  });
});

describe('billCountedAmount', () => {
  it('uses the per-occurrence override when present, else the estimate', () => {
    const b = bill({ id: 'utils', amount: 80, estimated: true });
    const payments: BillPayment[] = [{ billId: 'utils', date: '2026-06-10', amount: 95.5 }];
    expect(billCountedAmount(b, '2026-06-10', payments)).toBe(95.5);
    expect(billCountedAmount(b, '2026-07-10', payments)).toBe(80);
  });
});

describe('billExpensesForCycle', () => {
  it('sums counted amounts per category for a calendar month', () => {
    const rent = bill({ id: 'rent', name: 'Rent', amount: 1200, categoryId: 'housing', anchorDate: '2026-01-01' });
    const utils = bill({ id: 'utils', name: 'Utilities', amount: 80, categoryId: 'util', anchorDate: '2026-01-10', estimated: true });
    const payments: BillPayment[] = [{ billId: 'utils', date: '2026-06-10', amount: 100 }];
    const { total, byCategory } = billExpensesForCycle([rent, utils], payments, '2026-06', CALENDAR);
    expect(total).toBe(1300);
    expect(byCategory.get('housing')).toBe(1200);
    expect(byCategory.get('util')).toBe(100);
  });

  it('is empty for a cycle with no occurrences', () => {
    const b = bill({ frequency: 'once', anchorDate: '2026-07-15' });
    expect(billExpensesForCycle([b], [], '2026-06', CALENDAR).total).toBe(0);
  });
});

describe('billMonthlyCost', () => {
  it('normalizes each cadence; one-off contributes nothing', () => {
    expect(billMonthlyCost(bill({ frequency: 'monthly', amount: 100 }))).toBe(100);
    expect(billMonthlyCost(bill({ frequency: 'yearly', amount: 1200 }))).toBe(100);
    expect(billMonthlyCost(bill({ frequency: 'quarterly', amount: 300 }))).toBe(100);
    expect(billMonthlyCost(bill({ frequency: 'once', amount: 500 }))).toBe(0);
    expect(billMonthlyCost(bill({ frequency: 'weekly', amount: 10 }))).toBeCloseTo(43.33, 2);
  });
});

describe('nextBillOccurrence', () => {
  it('returns the next due date on/after today', () => {
    expect(nextBillOccurrence(bill({ frequency: 'monthly', anchorDate: '2026-01-15' }), '2026-06-20')).toBe('2026-07-15');
  });
  it('returns null once a one-off has passed', () => {
    expect(nextBillOccurrence(bill({ frequency: 'once', anchorDate: '2026-01-15' }), '2026-06-20')).toBeNull();
  });
});
