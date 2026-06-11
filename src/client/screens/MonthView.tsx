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
import { cycleBounds } from '../../shared/cycles';
import { subOccurrencesForCycle } from '../../shared/recurring';
import { TYPE_ORDER, TYPE_PLURALS } from '../../shared/constants';
import { fmtDate, fmtEUR, fmtMonth, fmtPct } from '../../shared/format';
import { useAppData, useCurrentCycle } from '../api/data';
import { Icon as UIIcon } from '../components/ui/Icon';
import { useNavigate } from 'react-router-dom';
import { BudgetBars, CategoryBars } from '../components/BudgetBars';
import { OverrideInput } from '../components/PlanCard';
import { useQuickAdd } from '../components/QuickAdd';
import { TransactionList } from '../components/TransactionList';
import { Icon } from '../components/ui/Icon';
import { CardSkeleton, EmptyState, Section } from '../components/ui/primitives';

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
  const [dir, setDir] = useState(0);
  const touchX = useRef<number | null>(null);

  const go = (delta: number) => {
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

  const derived = useMemo(() => {
    if (!data) return null;
    const summary = monthlySummary(data, month);
    const txs = data.transactions.filter((t) => keyOf(t.date, data.settings) === month);
    const byType = TYPE_ORDER.map((type) => ({
      type,
      items: txs.filter((t) => t.type === type),
    }));
    const plans = planStates(data, currentMonth)
      .map((st) => ({ st, row: st.rows.find((r) => r.month === month) }))
      .filter((x) => x.row);
    return {
      summary,
      byType,
      plans,
      subs: subOccurrencesForCycle(data.subscriptions, month, data.settings),
      bounds: cycleBounds(month, data.settings),
      budget: budgetVsActualMonth(data, month),
      top: topCategories(data, [month]),
      categories: new Map(data.categories.map((c) => [c.id, c])),
    };
  }, [data, month, currentMonth]);

  if (isLoading || !derived) {
    return (
      <div className="stack">
        <CardSkeleton lines={2} />
        <CardSkeleton lines={5} />
      </div>
    );
  }

  const { summary, byType, plans, subs, bounds, budget, top, categories } = derived;
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
      <div className="screen-head">
        <h1 className="screen-title">Months</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="icon-btn" onClick={() => navigate('/history')} aria-label="History & filters">
            <UIIcon name="filter" size={17} />
          </button>
          <div className="month-picker">
            <button className="icon-btn" onClick={() => go(-1)} aria-label="Previous month">
              <Icon name="chevronLeft" />
            </button>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span className="month-picker__label" aria-live="polite">{fmtMonth(month)}</span>
              <span className="tx-row__secondary">
                {fmtDate(bounds.start)} – {fmtDate(bounds.end)}
              </span>
            </span>
            <button className="icon-btn" onClick={() => go(1)} aria-label="Next month">
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
                  {items.length > 0 || (type === 'expense' && subs.length > 0) ? (
                    <div className="tx-scroll">
                      <TransactionList transactions={items} categories={categories} />
                      {type === 'expense' &&
                        subs.map(({ sub, date }) => (
                          <button
                            key={`${sub.id}-${date}`}
                            type="button"
                            className="tx-row"
                            onClick={() => navigate('/subscriptions')}
                            aria-label={`Subscription ${sub.name}, − ${fmtEUR(sub.amount)}`}
                          >
                            <span className="tx-row__icon" style={{ background: 'var(--expense-tint)', color: 'var(--expense)' }}>
                              <UIIcon name="repeat" size={17} />
                            </span>
                            <span className="tx-row__text">
                              <span className="tx-row__primary">{sub.name}</span>
                              <span className="tx-row__secondary" style={{ display: 'block' }}>
                                Subscription{sub.categoryId ? ` · ${categories.get(sub.categoryId)?.name ?? ''}` : ''}
                              </span>
                            </span>
                            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                              <span className="amount tx-row__amount amount--expense">− {fmtEUR(sub.amount)}</span>
                              <span className="tx-row__date">{fmtDate(date)}</span>
                            </span>
                          </button>
                        ))}
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
                      <span className="tx-row__secondary">
                        scheduled {fmtEUR(row!.scheduled)} · {fmtEUR(row!.remainingAfter)} remaining after this month
                      </span>
                    </div>
                  ))}
                </Section>
              )}

              <Section title="Budget vs actual">
                <BudgetBars rows={budget} />
              </Section>

              <Section title="Top spending">
                <CategoryBars items={top} />
              </Section>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
