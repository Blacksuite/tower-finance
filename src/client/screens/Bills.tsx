import { useState } from 'react';
import { billMonthlyCost, nextBillOccurrence } from '../../shared/bills';
import { fmtDate, fmtEUR, todayISO } from '../../shared/format';
import type { Bill, BillFrequency } from '../../shared/types';
import { useAddBill, useAppData, useDeleteBill, useUpdateBill } from '../api/data';
import { parseAmount } from '../components/QuickAdd';
import { Icon } from '../components/ui/Icon';
import { Sheet } from '../components/ui/Sheet';
import { useToast } from '../components/ui/Toast';
import { CardSkeleton, EmptyState } from '../components/ui/primitives';
import { RecurringSwitcher } from './Subscriptions';

const FREQ_LABELS: Record<BillFrequency, string> = {
  once: 'One-off',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  four_weekly: 'Every 4 weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  custom: 'Every N days',
};

function freqSummary(bill: Bill): string {
  if (bill.frequency === 'once') return 'one-off';
  if (bill.frequency === 'custom') return `every ${bill.intervalDays ?? '?'} days`;
  return FREQ_LABELS[bill.frequency].toLowerCase();
}

export function Bills() {
  const { data, isLoading } = useAppData();
  const del = useDeleteBill();
  const toast = useToast();
  const today = todayISO();
  const [editor, setEditor] = useState<{ open: boolean; bill: Bill | null }>({ open: false, bill: null });

  if (isLoading || !data) {
    return <div className="stack"><CardSkeleton lines={3} /></div>;
  }

  const bills = data.bills;
  const categories = new Map(data.categories.map((c) => [c.id, c.name]));
  const activeMonthly = bills
    .filter((b) => !b.endsOn || b.endsOn >= today)
    .reduce((a, b) => a + billMonthlyCost(b), 0);

  return (
    <div className="stack">
      <div className="screen-head">
        <RecurringSwitcher current="bills" />
        <button className="btn btn--ghost" onClick={() => setEditor({ open: true, bill: null })}>
          <Icon name="plus" size={15} />
          New bill
        </button>
      </div>

      {bills.length > 0 && (
        <div className="card stat-card" style={{ maxWidth: 340 }}>
          <span className="label">Recurring bills / month</span>
          <span className="amount amount--expense" style={{ fontSize: 'var(--text-lg)' }}>
            {fmtEUR(activeMonthly)}
          </span>
        </div>
      )}

      {bills.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="wallet"
            message="No bills yet. Add rent, utilities or any recurring or one-off payment — they count toward expenses and your payday forecast automatically."
            actionLabel="Add your first bill"
            onAction={() => setEditor({ open: true, bill: null })}
          />
        </div>
      ) : (
        <div className="chart-grid">
          {bills.map((b) => {
            const next = nextBillOccurrence(b, today);
            const ended = !next;
            const recurring = b.frequency !== 'once';
            return (
              <article key={b.id} className="card plan-card">
                <div className="plan-card__head">
                  <span className="plan-card__name">{b.name}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className={`pill ${ended ? 'pill--done' : 'pill--active'}`}>
                      {ended ? (recurring ? 'Paused' : 'Done') : 'Active'}
                    </span>
                    <button className="icon-btn" onClick={() => setEditor({ open: true, bill: b })} aria-label={`Edit ${b.name}`}>
                      <Icon name="pencil" size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`Delete ${b.name}`}
                      onClick={() => {
                        if (confirm(`Delete bill "${b.name}"? Past cycles lose this expense — pause it instead to keep history.`)) {
                          del.mutate(b.id);
                          toast.show('Bill deleted');
                        }
                      }}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </span>
                </div>
                <div className="plan-card__meta">
                  <span className="plan-card__meta-item">
                    <span className="label">Amount</span>
                    <span className="amount amount--expense">
                      {b.estimated ? '~' : ''}{fmtEUR(b.amount)}
                      <span style={{ color: 'var(--faint)', fontWeight: 400 }}> {freqSummary(b)}</span>
                    </span>
                  </span>
                  <span className="plan-card__meta-item">
                    <span className="label">Category</span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                      {b.categoryId ? categories.get(b.categoryId) ?? '—' : '—'}
                    </span>
                  </span>
                  <span className="plan-card__meta-item">
                    <span className="label">{ended ? 'Ended' : recurring ? 'Next due' : 'Due'}</span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                      {ended ? (b.endsOn ? fmtDate(b.endsOn) : '—') : fmtDate(next!)}
                    </span>
                  </span>
                </div>
                {b.estimated && (
                  <span className="hint">Estimated — your forecast uses this until the actual amount lands.</span>
                )}
                {b.description && <span className="hint">{b.description}</span>}
              </article>
            );
          })}
        </div>
      )}

      <Sheet
        open={editor.open}
        onClose={() => setEditor((e) => ({ ...e, open: false }))}
        title={editor.bill ? 'Edit bill' : 'New bill'}
      >
        {editor.open && (
          <BillForm bill={editor.bill} onDone={() => setEditor((e) => ({ ...e, open: false }))} />
        )}
      </Sheet>
    </div>
  );
}

function BillForm({ bill, onDone }: { bill: Bill | null; onDone: () => void }) {
  const { data } = useAppData();
  const add = useAddBill();
  const update = useUpdateBill();
  const toast = useToast();
  const [name, setName] = useState(bill?.name ?? '');
  const [amount, setAmount] = useState(bill ? String(bill.amount).replace('.', ',') : '');
  const [categoryId, setCategoryId] = useState(bill?.categoryId ?? '');
  const [description, setDescription] = useState(bill?.description ?? '');
  const [freq, setFreq] = useState<BillFrequency>(bill?.frequency ?? 'monthly');
  const [anchorDate, setAnchorDate] = useState(bill?.anchorDate ?? todayISO());
  const [intervalDays, setIntervalDays] = useState(bill?.intervalDays ? String(bill.intervalDays) : '');
  const [weekendRule, setWeekendRule] = useState(bill?.weekendRule ?? 'exact');
  const [endsOn, setEndsOn] = useState(bill?.endsOn ?? '');
  const [estimated, setEstimated] = useState(bill?.estimated ?? false);

  const amountN = parseAmount(amount);
  const intervalN = Math.round(Number(intervalDays));
  const isOnce = freq === 'once';
  const valid =
    name.trim().length > 0 &&
    amountN !== null &&
    /^\d{4}-\d{2}-\d{2}$/.test(anchorDate) &&
    (freq !== 'custom' || (Number.isFinite(intervalN) && intervalN >= 1 && intervalN <= 366));

  const submit = () => {
    if (!valid) return;
    const payload = {
      name: name.trim(),
      amount: amountN!,
      categoryId: categoryId || null,
      description: description.trim(),
      frequency: freq,
      anchorDate,
      intervalDays: freq === 'custom' ? intervalN : null,
      weekendRule,
      endsOn: isOnce ? null : endsOn || null,
      estimated,
    };
    if (bill) update.mutate({ ...payload, id: bill.id });
    else add.mutate(payload);
    toast.show(bill ? 'Bill updated' : 'Bill added');
    onDone();
  };

  return (
    <form className="qa-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="qa-row">
        <div className="field">
          <label className="label" htmlFor="bill-name">Name</label>
          <input id="bill-name" className="input" placeholder="e.g. Rent" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="bill-amount">Amount</label>
          <input id="bill-amount" className="input" inputMode="decimal" placeholder="€ 1.200,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <div className="qa-row">
        <div className="field">
          <label className="label" htmlFor="bill-freq">How often</label>
          <select id="bill-freq" className="input" value={freq} onChange={(e) => setFreq(e.target.value as BillFrequency)}>
            {(Object.keys(FREQ_LABELS) as BillFrequency[]).map((f) => (
              <option key={f} value={f}>{FREQ_LABELS[f]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="bill-anchor">
            {isOnce ? 'Due date' : freq === 'monthly' ? 'A due date (sets the day)' : 'First due date'}
          </label>
          <input id="bill-anchor" className="input" type="date" required value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
        </div>
      </div>
      <div className="qa-row">
        {freq === 'custom' && (
          <div className="field">
            <label className="label" htmlFor="bill-interval">Every … days</label>
            <input id="bill-interval" className="input" type="number" min={1} max={366} placeholder="e.g. 10" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} />
          </div>
        )}
        {!isOnce && (
          <div className="field">
            <label className="label" htmlFor="bill-weekend">If it falls on a weekend</label>
            <select id="bill-weekend" className="input" value={weekendRule} onChange={(e) => setWeekendRule(e.target.value as Bill['weekendRule'])}>
              <option value="previous">Previous Friday</option>
              <option value="exact">Exact date</option>
              <option value="next">Next Monday</option>
            </select>
          </div>
        )}
        {!isOnce && (
          <div className="field">
            <label className="label" htmlFor="bill-ends">Ends on (optional)</label>
            <input id="bill-ends" className="input" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </div>
        )}
      </div>
      <div className="field">
        <label className="label" htmlFor="bill-cat">Category</label>
        <select id="bill-cat" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">No category</option>
          {data?.categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor="bill-desc">Description</label>
        <input id="bill-desc" className="input" placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <label className="check-row" htmlFor="bill-estimated">
        <input id="bill-estimated" type="checkbox" checked={estimated} onChange={(e) => setEstimated(e.target.checked)} />
        <span>
          <span style={{ fontWeight: 500 }}>Estimated amount</span>
          <span className="hint" style={{ display: 'block' }}>For bills that vary (utilities). You can pin the real amount per charge later.</span>
        </span>
      </label>
      <button type="submit" className="btn btn--primary" disabled={!valid}>
        {bill ? 'Save changes' : 'Add bill'}
      </button>
    </form>
  );
}
