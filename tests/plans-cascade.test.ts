import { describe, expect, it } from 'vitest';
import { planSchedule, planExpensesForMonth } from '../src/shared/calc';
import { DEFAULT_SETTINGS, type AppData, type PaymentPlan, type PlanPayment } from '../src/shared/types';

const plan = (over: Partial<PaymentPlan> = {}): PaymentPlan => ({
  id: 'p1',
  name: 'Sofa',
  totalAmount: 1000,
  installment: 300,
  startMonth: '2026-01',
  ...over,
});

const pay = (month: string, amountPaid: number, planId = 'p1'): PlanPayment => ({
  planId,
  month,
  amountPaid,
});

describe('plan cascade — base schedule', () => {
  it('schedules the installment monthly and self-caps the final installment', () => {
    const st = planSchedule(plan(), [], '2026-12');
    expect(st.rows.map((r) => [r.month, r.scheduled, r.counted, r.remainingAfter])).toEqual([
      ['2026-01', 300, 300, 700],
      ['2026-02', 300, 300, 400],
      ['2026-03', 300, 300, 100],
      ['2026-04', 100, 100, 0], // capped at remaining balance
    ]);
    expect(st.endMonth).toBe('2026-04');
  });

  it('exact division leaves no zero-amount tail month', () => {
    const st = planSchedule(plan({ totalAmount: 900 }), [], '2026-12');
    expect(st.rows).toHaveLength(3);
    expect(st.rows[2].remainingAfter).toBe(0);
  });
});

describe('plan cascade — overrides ripple forward', () => {
  it('paying less extends the plan', () => {
    const st = planSchedule(plan(), [pay('2026-02', 100)], '2026-12');
    expect(st.rows.map((r) => [r.month, r.counted, r.remainingAfter])).toEqual([
      ['2026-01', 300, 700],
      ['2026-02', 100, 600], // override
      ['2026-03', 300, 300],
      ['2026-04', 300, 0], // plan extended into a full 4th installment
    ]);
  });

  it('paying more shortens the plan', () => {
    const st = planSchedule(plan(), [pay('2026-01', 700)], '2026-12');
    expect(st.rows.map((r) => [r.month, r.counted, r.remainingAfter])).toEqual([
      ['2026-01', 700, 300],
      ['2026-02', 300, 0],
    ]);
  });

  it('an override of 0 skips the month without progress', () => {
    const st = planSchedule(plan(), [pay('2026-02', 0)], '2026-12');
    expect(st.rows.map((r) => [r.month, r.counted])).toEqual([
      ['2026-01', 300],
      ['2026-02', 0],
      ['2026-03', 300],
      ['2026-04', 300],
      ['2026-05', 100],
    ]);
  });

  it('an override larger than the remaining balance is capped', () => {
    const st = planSchedule(plan(), [pay('2026-04', 500)], '2026-12');
    expect(st.rows[3]).toMatchObject({ month: '2026-04', counted: 100, remainingAfter: 0 });
    expect(st.paidToDate).toBe(1000);
  });
});

describe('plan status — only counts months up to the current real month', () => {
  it('future scheduled installments are not "paid"', () => {
    const st = planSchedule(plan(), [], '2026-02');
    expect(st.paidToDate).toBe(600);
    expect(st.remaining).toBe(400);
    expect(st.status).toBe('active');
    expect(st.monthsLeft).toBe(2); // mar + apr
  });

  it('paid off once the balance reaches zero by the current month', () => {
    const st = planSchedule(plan(), [], '2026-04');
    expect(st.paidToDate).toBe(1000);
    expect(st.remaining).toBe(0);
    expect(st.status).toBe('paid_off');
    expect(st.monthsLeft).toBe(0);
  });

  it('a plan starting in the future has nothing paid', () => {
    const st = planSchedule(plan({ startMonth: '2027-01' }), [], '2026-06');
    expect(st.paidToDate).toBe(0);
    expect(st.status).toBe('active');
  });

  it('terminates even with a perpetual stream of 0-overrides', () => {
    const overrides = Array.from({ length: 50 }, (_, i) => {
      const m = 1 + i;
      const y = 2026 + Math.floor((m - 1) / 12);
      return pay(`${y}-${String(((m - 1) % 12) + 1).padStart(2, '0')}`, 0);
    });
    const st = planSchedule(plan(), overrides, '2026-06');
    expect(st.rows.length).toBeGreaterThan(50); // pushed past the overrides
    expect(st.rows[st.rows.length - 1].remainingAfter).toBe(0);
  });
});

describe('plan payments flow into monthly expenses', () => {
  const data: AppData = {
    transactions: [],
    categories: [],
    settings: DEFAULT_SETTINGS,
    subscriptions: [],
    templates: [],
    auth: { enabled: false },
    plans: [
      plan(),
      plan({ id: 'p2', name: 'Phone', totalAmount: 600, installment: 50, startMonth: '2026-02' }),
    ],
    planPayments: [pay('2026-02', 100)],
  };

  it('sums counted amounts across plans for the month', () => {
    expect(planExpensesForMonth(data, '2026-01')).toBe(300);
    expect(planExpensesForMonth(data, '2026-02')).toBe(150); // 100 override + 50
    expect(planExpensesForMonth(data, '2026-07')).toBe(50); // p1 done, p2 continues
  });

  it('is 0 before any plan starts', () => {
    expect(planExpensesForMonth(data, '2025-12')).toBe(0);
  });
});

describe('floating point hygiene', () => {
  it('keeps cents exact through the cascade', () => {
    const st = planSchedule(plan({ totalAmount: 99.99, installment: 33.33 }), [], '2026-12');
    expect(st.rows.map((r) => r.counted)).toEqual([33.33, 33.33, 33.33]);
    expect(st.rows[2].remainingAfter).toBe(0);
  });
});
