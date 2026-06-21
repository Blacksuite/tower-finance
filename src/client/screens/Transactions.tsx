import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cycleBounds } from '../../shared/cycles';
import { TYPE_PLURALS, TYPE_SIGNS } from '../../shared/constants';
import { fmtDate, fmtEUR, todayISO } from '../../shared/format';
import { virtualExpensesBetween } from '../../shared/ledger';
import type { TransactionType } from '../../shared/types';
import { useAppData, useCurrentCycle } from '../api/data';
import { TransactionList, type LedgerItem } from '../components/TransactionList';
import { CardSkeleton, EmptyState, Section } from '../components/ui/primitives';

type Period = 'cycle' | 'week' | 'month' | 'year' | 'all' | 'custom';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'cycle', label: 'This cycle' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

const TX_TYPES: TransactionType[] = ['income', 'expense', 'saving', 'investment'];

export function Transactions() {
  const { data, isLoading } = useAppData();
  const currentCycle = useCurrentCycle();
  const today = todayISO();
  const [params] = useSearchParams();
  // deep-link support: a filtered link (e.g. from Insights) seeds these on mount
  const urlType = params.get('type');
  const urlCategory = params.get('categoryId');
  const [period, setPeriod] = useState<Period>(urlType || urlCategory ? 'all' : 'cycle');
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [type, setType] = useState<'all' | TransactionType>(
    urlType && (TX_TYPES as string[]).includes(urlType) ? (urlType as TransactionType) : 'all',
  );
  const [categoryId, setCategoryId] = useState(urlCategory ?? 'all');

  const derived = useMemo(() => {
    if (!data) return null;
    let lo = '0000-01-01';
    let hi = '9999-12-31';
    if (period === 'cycle') {
      const b = cycleBounds(currentCycle, data.settings);
      lo = b.start; hi = b.end;
    } else if (period === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      lo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      hi = today;
    } else if (period === 'month') {
      lo = today.slice(0, 8) + '01'; hi = today.slice(0, 8) + '31';
    } else if (period === 'year') {
      lo = today.slice(0, 5) + '01-01'; hi = today.slice(0, 5) + '12-31';
    } else if (period === 'custom') {
      lo = from || lo; hi = to || hi;
    }
    const matches = (t: LedgerItem) =>
      t.date >= lo &&
      t.date <= hi &&
      (type === 'all' || t.type === type) &&
      (categoryId === 'all' ||
        (categoryId === '' ? t.categoryId === null && t.type === 'expense' : t.categoryId === categoryId));

    const real = data.transactions.filter(matches);
    // Computed expenses (bills/plan installments). Cap the window at
    // the END of the current cycle, not at `today`: the dashboard and Months page
    // count the whole current cycle's charges as committed, so History must show
    // the same occurrences to reconcile. The cap also bounds open-ended ranges
    // ('all'/'year') so we never generate occurrences for future cycles.
    // ponytail: current-cycle end is the reconciliation horizon; revisit if a
    // future-cycle ledger view is ever wanted.
    const cycleEnd = cycleBounds(currentCycle, data.settings).end;
    const vhi = hi < cycleEnd ? hi : cycleEnd;
    const virtual = virtualExpensesBetween(data, lo, vhi, currentCycle).filter(matches);

    const items: LedgerItem[] = [...real, ...virtual].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1,
    );
    const net = items.reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0);
    return {
      items,
      net,
      range: { lo, hi },
      categories: new Map(data.categories.map((c) => [c.id, c])),
    };
  }, [data, period, from, to, type, categoryId, currentCycle, today]);

  if (isLoading || !derived) {
    return <div className="stack"><CardSkeleton lines={5} /></div>;
  }

  return (
    <div className="stack">
      <div className="screen-head">
        <h1 className="screen-title">Transactions</h1>
      </div>

      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <div className="field" style={{ minWidth: 150, flex: 1 }}>
          <label className="label" htmlFor="h-period">Period</label>
          <select id="h-period" className="input" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ minWidth: 130, flex: 1 }}>
          <label className="label" htmlFor="h-type">Type</label>
          <select id="h-type" className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="all">All types</option>
            {(Object.keys(TYPE_PLURALS) as TransactionType[]).map((t) => (
              <option key={t} value={t}>{TYPE_PLURALS[t]}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ minWidth: 150, flex: 1 }}>
          <label className="label" htmlFor="h-cat">Category</label>
          <select id="h-cat" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="all">All categories</option>
            {data!.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value="">Uncategorized</option>
          </select>
        </div>
        {period === 'custom' && (
          <>
            <div className="field" style={{ minWidth: 140 }}>
              <label className="label" htmlFor="h-from">From</label>
              <input id="h-from" className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field" style={{ minWidth: 140 }}>
              <label className="label" htmlFor="h-to">To</label>
              <input id="h-to" className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        )}
      </div>

      <Section
        title={`${derived.items.length} transaction${derived.items.length === 1 ? '' : 's'} · ${fmtDate(derived.range.lo === '0000-01-01' ? (derived.items[derived.items.length - 1]?.date ?? today) : derived.range.lo)} – ${fmtDate(derived.range.hi === '9999-12-31' ? today : derived.range.hi)}`}
        right={
          <span className={`amount ${derived.net < 0 ? 'amount--expense' : 'amount--income'}`}>
            {fmtEUR(derived.net)}
          </span>
        }
      >
        {derived.items.length === 0 ? (
          <EmptyState icon="filter" message="Nothing matches these filters." />
        ) : (
          <TransactionList transactions={derived.items} categories={derived.categories} />
        )}
      </Section>
      <span className="hint" style={{ textAlign: 'center' }}>
        Net uses {TYPE_SIGNS.income === '+' ? '+' : ''}income − everything else. Tap a logged row to edit;
        bill &amp; plan rows are computed — tap to manage them.
      </span>
    </div>
  );
}
