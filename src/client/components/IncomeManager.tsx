import { useState } from 'react';
import { nextPayday } from '../../shared/income';
import { fmtDate, fmtEUR, todayISO } from '../../shared/format';
import type { IncomeFrequency, RecurringIncome } from '../../shared/types';
import { useAddIncome, useDeleteIncome, useUpdateIncome } from '../api/data';
import { parseAmount } from './QuickAdd';
import { Icon } from './ui/Icon';
import { Sheet } from './ui/Sheet';
import { useToast } from './ui/Toast';

export const FREQ_LABELS: Record<IncomeFrequency, string> = {
  monthly: 'Monthly',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  four_weekly: 'Every 4 weeks',
  custom: 'Every N days',
};

function freqSummary(inc: RecurringIncome): string {
  if (inc.frequency === 'custom') return `every ${inc.intervalDays ?? '?'} days`;
  return FREQ_LABELS[inc.frequency].toLowerCase();
}

export function IncomeManager({ incomes }: { incomes: RecurringIncome[] }) {
  const del = useDeleteIncome();
  const toast = useToast();
  const [editor, setEditor] = useState<{ open: boolean; inc: RecurringIncome | null }>({ open: false, inc: null });
  const today = todayISO();

  return (
    <div>
      {incomes.length === 0 && (
        <span className="hint">
          Add your salary or other regular income to see your next payday and a
          balance forecast on the dashboard. Income you already logged stays as is.
        </span>
      )}
      {incomes.map((inc) => {
        const next = nextPayday([inc], today);
        return (
          <div key={inc.id} className="settings-row">
            <span className="settings-row__name" style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
              {inc.name}
              <span className="hint" style={{ display: 'block' }}>
                {fmtEUR(inc.amount)} · {freqSummary(inc)}
                {next ? ` · next: ${fmtDate(next.date)}` : ' · ended'}
              </span>
            </span>
            <button type="button" className="icon-btn" onClick={() => setEditor({ open: true, inc })} aria-label={`Edit ${inc.name}`}>
              <Icon name="pencil" size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Delete ${inc.name}`}
              onClick={() => { del.mutate(inc.id); toast.show('Income removed'); }}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        );
      })}
      <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 12 }} onClick={() => setEditor({ open: true, inc: null })}>
        <Icon name="plus" size={14} />
        New income
      </button>
      <Sheet
        open={editor.open}
        onClose={() => setEditor((e) => ({ ...e, open: false }))}
        title={editor.inc ? 'Edit income' : 'New income'}
      >
        {editor.open && (
          <IncomeForm inc={editor.inc} onDone={() => setEditor((e) => ({ ...e, open: false }))} />
        )}
      </Sheet>
    </div>
  );
}

export function IncomeForm({ inc, onDone }: { inc: RecurringIncome | null; onDone: () => void }) {
  const add = useAddIncome();
  const update = useUpdateIncome();
  const toast = useToast();
  const [name, setName] = useState(inc?.name ?? '');
  const [amount, setAmount] = useState(inc ? String(inc.amount).replace('.', ',') : '');
  const [freq, setFreq] = useState<IncomeFrequency>(inc?.frequency ?? 'monthly');
  const [anchorDate, setAnchorDate] = useState(inc?.anchorDate ?? todayISO());
  const [intervalDays, setIntervalDays] = useState(inc?.intervalDays ? String(inc.intervalDays) : '');
  const [weekendRule, setWeekendRule] = useState(inc?.weekendRule ?? 'exact');
  const [endsOn, setEndsOn] = useState(inc?.endsOn ?? '');

  const amountN = parseAmount(amount);
  const intervalN = Math.round(Number(intervalDays));
  const valid =
    name.trim().length > 0 &&
    amountN !== null &&
    !!anchorDate &&
    (freq !== 'custom' || (Number.isFinite(intervalN) && intervalN >= 1 && intervalN <= 366));

  const submit = () => {
    if (!valid) return;
    const payload = {
      name: name.trim(),
      amount: amountN!,
      frequency: freq,
      anchorDate,
      intervalDays: freq === 'custom' ? intervalN : null,
      weekendRule,
      endsOn: endsOn || null,
    };
    if (inc) update.mutate({ ...payload, id: inc.id });
    else add.mutate(payload);
    toast.show(inc ? 'Income updated' : 'Income added');
    onDone();
  };

  return (
    <form className="qa-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="qa-row">
        <div className="field">
          <label className="label" htmlFor="inc-name">Name</label>
          <input id="inc-name" className="input" placeholder="e.g. Salary" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="inc-amount">Amount</label>
          <input id="inc-amount" className="input" inputMode="decimal" placeholder="€ 2.500,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <div className="qa-row">
        <div className="field">
          <label className="label" htmlFor="inc-freq">How often</label>
          <select id="inc-freq" className="input" value={freq} onChange={(e) => setFreq(e.target.value as IncomeFrequency)}>
            {(Object.keys(FREQ_LABELS) as IncomeFrequency[]).map((f) => (
              <option key={f} value={f}>{FREQ_LABELS[f]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="inc-anchor">{freq === 'monthly' ? 'A payday (sets the day of month)' : 'First payday'}</label>
          <input id="inc-anchor" className="input" type="date" required value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
        </div>
      </div>
      <div className="qa-row">
        {freq === 'custom' && (
          <div className="field">
            <label className="label" htmlFor="inc-interval">Every … days</label>
            <input id="inc-interval" className="input" type="number" min={1} max={366} placeholder="e.g. 10" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="inc-weekend">If it falls on a weekend</label>
          <select id="inc-weekend" className="input" value={weekendRule} onChange={(e) => setWeekendRule(e.target.value as RecurringIncome['weekendRule'])}>
            <option value="previous">Previous Friday</option>
            <option value="exact">Exact date</option>
            <option value="next">Next Monday</option>
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="inc-ends">Ends on (optional)</label>
          <input id="inc-ends" className="input" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </div>
      </div>
      <button type="submit" className="btn btn--primary" disabled={!valid}>
        {inc ? 'Save changes' : 'Add income'}
      </button>
    </form>
  );
}
