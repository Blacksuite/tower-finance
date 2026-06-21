import { describe, expect, it } from 'vitest';
import { virtualExpensesBetween } from '../src/shared/ledger';
import { DEFAULT_SETTINGS, type AppData, type Bill, type Settings } from '../src/shared/types';

const data = (
  over: Partial<Omit<AppData, 'settings'>> & { settings?: Partial<Settings> } = {},
): AppData => ({
  transactions: [], categories: [], plans: [], planPayments: [],
  incomes: [], bills: [], billPayments: [], auth: { enabled: false },
  ...over,
  settings: { ...DEFAULT_SETTINGS, ...(over.settings ?? {}) },
});

const bill = (over: Partial<Bill>): Bill => ({
  id: 'b1', name: 'Rent', amount: 1200, categoryId: 'housing', description: '',
  frequency: 'monthly', anchorDate: '2026-01-01', intervalDays: null,
  weekendRule: 'exact', endsOn: null, estimated: false, ...over,
});

describe('virtualExpensesBetween', () => {
  it('emits bill and plan occurrences in range', () => {
    const d = data({
      bills: [bill({ id: 'rent', anchorDate: '2026-06-01' })],
      plans: [{ id: 'p1', name: 'Sofa', totalAmount: 600, installment: 200, startMonth: '2026-05' }],
    });
    const rows = virtualExpensesBetween(d, '2026-06-01', '2026-06-30', '2026-06');
    const byKind = (k: string) => rows.filter((r) => r.source.kind === k);
    expect(byKind('bill')).toHaveLength(1); // 1 Jun
    expect(byKind('plan')).toHaveLength(1); // installment dated 1 Jun (cycle start)
    expect(byKind('bill')[0]).toMatchObject({ amount: 1200, categoryId: 'housing', type: 'expense' });
    expect(byKind('plan')[0]).toMatchObject({ amount: 200, categoryId: null, description: 'Sofa' });
  });

  it('a bill-only ledger reconciles (no transactions, no plans needed)', () => {
    const d = data({
      bills: [
        bill({ id: 'rent', name: 'Rent', amount: 1200, anchorDate: '2026-06-01' }),
        bill({ id: 'ins', name: 'Insurance', amount: 140, categoryId: 'insurance', anchorDate: '2026-06-03' }),
      ],
    });
    const rows = virtualExpensesBetween(d, '2026-06-01', '2026-06-30', '2026-06');
    expect(rows).toHaveLength(2);
    const total = rows.reduce((a, r) => a + r.amount, 0);
    expect(total).toBe(1340);
    expect(rows.every((r) => r.source.kind === 'bill')).toBe(true);
  });

  it('emits one row per occurrence for a recurring bill in the window', () => {
    const d = data({ bills: [bill({ id: 'wk', frequency: 'weekly', amount: 10, anchorDate: '2026-06-01' })] });
    const rows = virtualExpensesBetween(d, '2026-06-01', '2026-06-22', '2026-06');
    expect(rows).toHaveLength(4); // 1, 8, 15, 22 Jun
    expect(rows.every((r) => r.amount === 10)).toBe(true);
  });

  it('uses the per-occurrence override for variable bills', () => {
    const d = data({
      bills: [bill({ id: 'utils', name: 'Utilities', amount: 80, anchorDate: '2026-06-10', estimated: true })],
      billPayments: [{ billId: 'utils', date: '2026-06-10', amount: 95 }],
    });
    const rows = virtualExpensesBetween(d, '2026-06-01', '2026-06-30', '2026-06');
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(95);
  });

  it('a one-off bill emits exactly once, only inside its window', () => {
    const d = data({ bills: [bill({ id: 'vet', frequency: 'once', amount: 200, anchorDate: '2026-06-20' })] });
    expect(virtualExpensesBetween(d, '2026-06-01', '2026-06-30', '2026-06')).toHaveLength(1);
    expect(virtualExpensesBetween(d, '2026-07-01', '2026-07-31', '2026-07')).toHaveLength(0);
  });

  it('stops emitting a bill after endsOn', () => {
    const d = data({ bills: [bill({ id: 'gym', amount: 30, anchorDate: '2026-01-01', endsOn: '2026-03-31' })] });
    expect(virtualExpensesBetween(d, '2026-03-01', '2026-03-31', '2026-03')).toHaveLength(1);
    expect(virtualExpensesBetween(d, '2026-06-01', '2026-06-30', '2026-06')).toHaveLength(0);
  });

  it('excludes occurrences outside the window and stable-ids each row', () => {
    const d = data({ bills: [bill({ id: 'b1', anchorDate: '2026-01-20' })] });
    const rows = virtualExpensesBetween(d, '2026-02-01', '2026-02-28', '2026-02');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('bill:b1:2026-02-20');
  });

  it('skips plan installments that fall outside the window', () => {
    const d = data({
      plans: [{ id: 'p1', name: 'Phone', totalAmount: 1200, installment: 100, startMonth: '2026-01' }],
    });
    // installments are dated at each cycle start; only the June one is in range
    const rows = virtualExpensesBetween(d, '2026-06-01', '2026-06-30', '2026-06');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: '2026-06-01', amount: 100, source: { kind: 'plan' } });
  });
});
