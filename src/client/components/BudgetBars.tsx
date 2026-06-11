import type { BudgetRow } from '../../shared/calc';
import { fmtEUR, fmtSigned } from '../../shared/format';
import { EmptyState, Progress } from './ui/primitives';

const KIND_COLOR: Record<BudgetRow['kind'], string> = {
  expense: 'var(--income)', // within budget = calm green; switches to rose past 100%
  saving: 'var(--saving)',
  investment: 'var(--investment)',
};

function deltaColor(row: BudgetRow): string {
  if (row.kind === 'expense') {
    return row.diff < 0 ? 'var(--expense)' : 'var(--debt)';
  }
  return row.diff >= 0 ? 'var(--income)' : 'var(--debt)';
}

/** Budget vs Actual as slim progress bars — never a 5-column table. */
export function BudgetBars({ rows }: { rows: BudgetRow[] }) {
  const visible = rows.filter((r) => r.budget > 0 || r.actual > 0);
  if (visible.length === 0) {
    return <EmptyState icon="gear" message="Set monthly budgets in Settings to track them here." />;
  }
  return (
    <div>
      {visible.map((row) => {
        const over = row.kind === 'expense' && row.pct > 1;
        return (
          <div key={row.id} className="budget-row">
            <div className="budget-row__top">
              <span className="budget-row__name">{row.name}</span>
              <span className="budget-row__nums">
                <span className="budget-row__delta amount" style={{ color: deltaColor(row) }}>
                  {fmtSigned(Math.abs(row.diff), row.diff < 0 ? '-' : '+')}
                </span>
                <span className="budget-row__amount amount">
                  {fmtEUR(row.actual)}
                  <span style={{ color: 'var(--faint)', fontWeight: 400 }}> / {fmtEUR(row.budget)}</span>
                </span>
              </span>
            </div>
            <Progress ratio={row.pct} color={over ? 'var(--expense)' : KIND_COLOR[row.kind]} />
          </div>
        );
      })}
    </div>
  );
}

/** Top spending categories as horizontal bars, sorted high → low. */
export function CategoryBars({
  items,
}: {
  items: { id: string; name: string; amount: number }[];
}) {
  if (items.length === 0) {
    return <EmptyState icon="cart" message="No expenses yet — add one to see where money goes." />;
  }
  const max = items[0].amount;
  return (
    <div>
      {items.map((c) => (
        <div key={c.id} className="hbar-row">
          <span className="hbar-row__name">{c.name}</span>
          <span className="hbar-row__track">
            <span className="hbar-row__fill" style={{ width: `${(c.amount / max) * 100}%` }} />
          </span>
          <span className="hbar-row__amount amount">{fmtEUR(c.amount)}</span>
        </div>
      ))}
    </div>
  );
}
