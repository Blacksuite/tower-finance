import { describe, expect, it } from 'vitest';
import { virtualExpensesBetween } from '../src/shared/ledger';
import { DEFAULT_SETTINGS, type AppData, type Bill, type Settings } from '../src/shared/types';

const data = (
  over: Partial<Omit<AppData, 'settings'>> & { settings?: Partial<Settings> } = {},
): AppData => ({
  transactions: [], categories: [], plans: [], planPayments: [],
  subscriptions: [], templates: [], incomes: [], bills: [], billPayments: [], auth: { enabled: false },
  ...over,
  settings: { ...DEFAULT_SETTINGS, ...(over.settings ?? {}) },
});

const bill = (over: Partial<Bill>): Bill => ({
  id: 'b1', name: 'Rent', amount: 1200, categoryId: 'housing', description: '',
  frequency: 'monthly', anchorDate: '2026-01-01', intervalDays: null,
  weekendRule: 'exact', endsOn: null, estimated: false, ...over,
});

const sub = (over: Record<string, unknown> = {}) => ({
  id: 's1', name: 'Netflix', amount: 15.99, categoryId: null, description: '',
  firstBillDate: '2026-01-20', frequency: 'monthly' as const, endsOn: null, ...over,
});

describe('virtualExpensesBetween', () => {
  it('emits subscription, bill and plan occurrences in range', () => {
    const d = data({
      subscriptions: [sub()],
      bills: [bill({ id: 'rent', anchorDate: '2026-06-01' })],
      plans: [{ id: 'p1', name: 'Sofa', totalAmount: 600, installment: 200, startMonth: '2026-05' }],
    });
    const rows = virtualExpensesBetween(d, '2026-06-01', '2026-06-30', '2026-06');
    const byKind = (k: string) => rows.filter((r) => r.source.kind === k);
    expect(byKind('subscription')).toHaveLength(1); // 20 Jun
    expect(byKind('bill')).toHaveLength(1); // 1 Jun
    expect(byKind('plan')).toHaveLength(1); // installment dated 1 Jun (cycle start)
    expect(byKind('bill')[0]).toMatchObject({ amount: 1200, categoryId: 'housing', type: 'expense' });
    expect(byKind('plan')[0]).toMatchObject({ amount: 200, categoryId: null, description: 'Sofa' });
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

  it('excludes occurrences outside the window and stable-ids each row', () => {
    const d = data({ subscriptions: [sub()] });
    expect(virtualExpensesBetween(d, '2026-02-01', '2026-02-28', '2026-02')).toHaveLength(1);
    const row = virtualExpensesBetween(d, '2026-02-01', '2026-02-28', '2026-02')[0];
    expect(row.id).toBe('sub:s1:2026-02-20');
  });
});
