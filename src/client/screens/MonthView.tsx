import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addMonths,
  budgetVsActualMonth,
  keyOf,
  monthlySummary,
  planStates,
  topCategories,
} from '../../shared/calc';
import { CALENDAR, cycleBounds, cycleKeyOf } from '../../shared/cycles';
import { virtualExpensesBetween } from '../../shared/ledger';
import { TYPE_ORDER, TYPE_PLURALS } from '../../shared/constants';
import { fmtCycle, fmtEUR, fmtMonth, fmtPct, todayISO } from '../../shared/format';
import { useAppData, useCurrentCycle } from '../api/data';
import { useNavigate } from 'react-router-dom';
import { BudgetBars, CategoryBars } from '../components/BudgetBars';
import { OverrideInput } from '../components/PlanCard';
import { useQuickAdd } from '../components/QuickAdd';
import { TransactionList, type LedgerItem } from '../components/TransactionList';
import { Icon } from '../components/ui/Icon';
import { CardSkeleton, EmptyState, Section, Segmented } from '../components/ui/primitives';

const EMPTY_HINTS: Record<string, string> = {
  income: 'No income yet this month — add your salary or other income.',
  expense: 'No expenses yet this month — add your first one.',
  saving: 'Nothing saved yet this month.',
  investment: 'Nothing invested yet this month.',
};

export function MonthView() {
  const { data, isLoading } = useAppData();
  const { openNew } = useQuickAdd();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const currentMonth = useCurrentCycle();
  const [month, setMonth] = useState(currentMonth);
  // until the user navigates, track the live current cycle: bootstrap loads after
  // mount, so the first render's currentMonth is the calendar-month fallback (the
  // wrong cycle for salaryDay ≠ 1). Once data resolves, snap to the real cycle.
  const navigated = useRef(false);
  const [dir, setDir] = useState(0);
  // budgeting view = salary cycles; calendar view = plain months for review
  const [view, setView] = useState<'cycle' | 'calendar'>('cycle');
  const touchX = useRef<number | null>(null);
  const cyclic = (data?.settings.salaryDay ?? 1) !== 1;
  const bucket = view === 'calendar' ? CALENDAR : data?.settings;

  const switchView = (v: 'cycle' | 'calendar') => {
    navigated.current = true;
    setView(v);
    setMonth(cycleKeyOf(todayISO(), v === 'calendar' ? CALENDAR : data!.settings));
  };

  const go = (delta: number) => {
    navigated.current = true;
    setDir(delta);
    setMonth((m) => addMonths(m, delta));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!navigated.current) setMonth(currentMonth);
  }, [currentMonth]);

  const derived = useMemo(() => {
    if (!data || !bucket) return null;
    const summary = monthlySummary(data, month, bucket);
    const bounds = cycleBounds(month, bucket);
    const txs = data.transactions.filter((t) => keyOf(t.date, bucket) === month);
    // subscriptions & bills as read-only rows in the expense column (plans keep
    // their own interactive section below, so they're excluded here)
    const virtualExpenses = virtualExpensesBetween(data, bounds.start, bounds.end, currentMonth)
      .filter((v) => v.source.kind !== 'plan');
    const byType = TYPE_ORDER.map((type) => {
      const txItems = txs.filter((t) => t.type === type);
      const items: LedgerItem[] =
        type === 'expense'
          ? [...txItems, ...virtualExpenses].sort((a, b) =>
              a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1,
            )
          : txItems;
      return { type, items };
    });
    const plans = planStates(data, currentMonth)
      .map((st) => ({ st, row: st.rows.find((r) => r.month === month) }))
      .filter((x) => x.row);
    return {
      summary,
      byType,
      plans,
      bounds,
      budget: budgetVsActualMonth(data, month, bucket),
      top: topCategories(data, [month], bucket),
      categories: new Map(data.categories.map((c) => [c.id, c])),
    };
  }, [data, month, currentMonth, bucket]);

  if (isLoading || !derived) {
    return (
      <div className="stack">
        <CardSkeleton lines={2} />
        <CardSkeleton lines={5} />
      </div>
    );
  }

  const { summary, byType, plans, budget, top, categories } = derived;
  const cards = [
    { label: 'Income', value: summary.income, cls: 'amount--income' },
    { label: 'Expenses', value: summary.expenses, cls: 'amount--expense' },
    { label: 'Saved', value: summary.saved, cls: 'amount--saving' },
    { label: 'Invested', value: summary.invested, cls: 'amount--investment' },
    { label: 'Left over', value: summary.leftOver, cls: summary.leftOver < 0 ? 'amount--expense' : '' },
    { label: 'Savings rate', value: summary.savingsRate, fmt: fmtPct },
  ];

  return (
    <div
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 64) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="screen-head screen-head--wrap">
        {cyclic ? (
          <Segmented
            value={view}
            onChange={switchView}
            options={[
              { value: 'cycle', label: 'Pay cycle' },
              { value: 'calendar', label: 'Calendar' },
            ]}
            ariaLabel="Months view mode"
          />
        ) : (
          <h1 className="screen-title">Months</h1>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div className="month-picker">
            <button className="icon-btn" onClick={() => go(-1)} aria-label="Previous period">
              <Icon name="chevronLeft" />
            </button>
            <span
              className={`month-picker__label${view === 'cycle' && cyclic ? ' month-picker__label--range' : ''}`}
              aria-live="polite"
            >
              {view === 'calendar' || !cyclic ? fmtMonth(month) : fmtCycle(month, data!.settings)}
            </span>
            <button className="icon-btn" onClick={() => go(1)} aria-label="Next period">
              <Icon name="chevronRight" />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={month}
          className="stack"
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: dir * 32 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, x: dir * -24 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
        >
          <div className="stat-grid">
            {cards.map((c) => (
              <div key={c.label} className="card stat-card">
                <span className="label">{c.label}</span>
                <span className={`amount ${c.cls ?? ''}`} style={{ fontSize: 'var(--text-lg)' }}>
                  {(c.fmt ?? fmtEUR)(c.value)}
                </span>
              </div>
            ))}
          </div>

          <div className="month-grid">
            <div className="stack">
              {byType.map(({ type, items }) => (
                <Section key={type} title={TYPE_PLURALS[type]}>
                  {items.length > 0 ? (
                    <div className="tx-scroll">
                      <TransactionList transactions={items} categories={categories} />
                    </div>
                  ) : (
                    <EmptyState
                      message={EMPTY_HINTS[type]}
                      actionLabel={`Add ${type}`}
                      onAction={() => openNew(type)}
                    />
                  )}
                </Section>
              ))}
            </div>

            <div className="stack">
              {plans.length > 0 && (
                <Section title="Payment plans">
                  {plans.map(({ st, row }) => (
                    <div key={st.plan.id} className="plan-month-row">
                      <div className="plan-month-row__top">
                        <span className="plan-month-row__name">{st.plan.name}</span>
                        <span className="amount amount--expense" style={{ fontSize: 'var(--text-sm)' }}>
                          − {fmtEUR(row!.counted)}
                        </span>
                        <OverrideInput planId={st.plan.id} row={row!} />
                      </div>
                      <span className="hint">
                        scheduled {fmtEUR(row!.scheduled)} · {fmtEUR(row!.remainingAfter)} remaining after this month
                      </span>
                    </div>
                  ))}
                </Section>
              )}

              <Section title="Budget vs actual">
                <BudgetBars
                  rows={budget}
                  onSelect={(id) => navigate(`/history?type=expense&categoryId=${encodeURIComponent(id)}`)}
                />
              </Section>

              <Section title="Top spending">
                <CategoryBars
                  items={top}
                  onSelect={(id) => navigate(`/history?type=expense&categoryId=${encodeURIComponent(id)}`)}
                />
              </Section>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
