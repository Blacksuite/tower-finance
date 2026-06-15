import type { BudgetRow } from '../../shared/calc';
import { fmtEUR, fmtPct, fmtSigned } from '../../shared/format';
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
export function BudgetBars({ rows, onSelect }: { rows: BudgetRow[]; onSelect?: (categoryId: string) => void }) {
  const visible = rows.filter((r) => r.budget > 0 || r.actual > 0);
  if (visible.length === 0) {
    return <EmptyState icon="gear" message="Set monthly budgets in Settings to track them here." />;
  }
  return (
    <div>
      {visible.map((row) => {
        const over = row.kind === 'expense' && row.pct > 1;
        // only expense rows map to a category in History; targets don't
        const clickable = onSelect && row.kind === 'expense';
        const inner = (
          <>
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
          </>
        );
        return clickable ? (
          <button
            key={row.id}
            type="button"
            className="budget-row row-link"
            onClick={() => onSelect!(row.id)}
            aria-label={`See ${row.name} transactions`}
          >
            {inner}
          </button>
        ) : (
          <div key={row.id} className="budget-row">{inner}</div>
        );
      })}
    </div>
  );
}

/** Top spending categories as horizontal bars, sorted high → low. */
export function CategoryBars({
  items,
  onSelect,
}: {
  items: { id: string; name: string; amount: number }[];
  onSelect?: (categoryId: string) => void;
}) {
  if (items.length === 0) {
    return <EmptyState icon="cart" message="No expenses yet — add one to see where money goes." />;
  }
  const max = items[0].amount;
  const total = items.reduce((a, c) => a + c.amount, 0);
  return (
    <div>
      {items.map((c) => {
        const inner = (
          <>
            <span className="hbar-row__name">{c.name}</span>
            <span className="hbar-row__track">
              <span className="hbar-row__fill" style={{ width: `${(c.amount / max) * 100}%` }} />
            </span>
            <span className="hbar-row__amount amount">
              {fmtEUR(c.amount)}
              <span style={{ color: 'var(--faint)', fontWeight: 400, fontSize: 'var(--text-xs)' }}>
                {' '}{fmtPct(c.amount / total)}
              </span>
            </span>
          </>
        );
        const tip = `${c.name}: ${fmtEUR(c.amount)} (${fmtPct(c.amount / total)} of spending)`;
        return onSelect ? (
          <button
            key={c.id}
            type="button"
            className="hbar-row row-link"
            title={tip}
            onClick={() => onSelect(c.id)}
            aria-label={`See ${c.name} transactions`}
          >
            {inner}
          </button>
        ) : (
          <div key={c.id} className="hbar-row" title={tip}>{inner}</div>
        );
      })}
    </div>
  );
}
