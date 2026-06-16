// First-run setup. Shown only when the app is completely empty AND this device
// hasn't dismissed it (localStorage 'tower-onboarded') — so existing installs
// with data never see it. Captures the one setting that defines the product
// (salary day) plus optional salary + buffer, then drops the user on a working
// dashboard.
//
// KEEP IN SYNC: if a change adds/removes a setting a new user must pick to get a
// correct first view, or changes the core idea pitched here, update this flow in
// the same pass (see Claude/CLAUDE.md "Keep onboarding current").
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { salaryDate } from '../../shared/cycles';
import { configureFormat, currentMonthISO, fmtDate } from '../../shared/format';
import { loadSampleData, useAddIncome, useAppData, useUpdateSettings } from '../api/data';
import { useToast } from './ui/Toast';

const DISMISS_KEY = 'tower-onboarded';

/** True once the app has any real data — used to skip onboarding for existing installs. */
export function isFreshInstall(d: {
  transactions: unknown[];
  incomes: unknown[];
  bills: unknown[];
  subscriptions: unknown[];
  plans: unknown[];
  templates: unknown[];
}): boolean {
  return (
    d.transactions.length === 0 &&
    d.incomes.length === 0 &&
    d.bills.length === 0 &&
    d.subscriptions.length === 0 &&
    d.plans.length === 0 &&
    d.templates.length === 0
  );
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { data } = useAppData();
  const qc = useQueryClient();
  const toast = useToast();
  const updateSettings = useUpdateSettings();
  const addIncome = useAddIncome();
  const s = data?.settings;

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [salaryDay, setSalaryDay] = useState(s?.salaryDay ?? 1);
  const [weekendRule, setWeekendRule] = useState<'previous' | 'exact' | 'next'>(s?.weekendRule ?? 'exact');
  const [currency, setCurrency] = useState(s?.currency ?? 'EUR');
  const [locale, setLocale] = useState(s?.locale ?? 'nl-NL');
  const [salary, setSalary] = useState('');
  const [buffer, setBuffer] = useState(String(s?.safetyBuffer ?? 100));

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    onDone();
  };

  const explore = async () => {
    setBusy(true);
    try {
      await loadSampleData(qc);
      dismiss();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not load sample data', { error: true });
      setBusy(false);
    }
  };

  const finish = () => {
    const cur = currency.trim().toUpperCase() || 'EUR';
    const loc = locale.trim() || 'nl-NL';
    const buf = Math.max(0, Number(buffer) || 0);
    updateSettings.mutate({ salaryDay, weekendRule, currency: cur, locale: loc, safetyBuffer: buf });
    // apply the new currency/locale to the live formatters so amounts render
    // correctly without a reload
    configureFormat(cur, loc);

    const amount = Number(salary);
    if (amount > 0) {
      const anchor = salaryDate(currentMonthISO(), { salaryDay, weekendRule });
      addIncome.mutate({
        name: 'Salary',
        amount,
        frequency: 'monthly',
        anchorDate: anchor,
        intervalDays: null,
        weekendRule,
        endsOn: null,
      });
    }
    dismiss();
  };

  const example = fmtDate(salaryDate(currentMonthISO(), { salaryDay, weekendRule }));

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="card qa-form" style={{ width: 'min(94vw, 440px)', gap: 18 }}>
        <Dots step={step} />

        {step === 0 && (
          <>
            <h2 className="sheet__title" style={{ marginBottom: 0 }}>Welcome to Tower Finance</h2>
            <VerdictPreview />
            <p className="hint" style={{ lineHeight: 1.5 }}>
              One question, answered at a glance: <strong>are you okay until payday?</strong> Tower
              budgets by your <strong>pay cycle</strong> — payday to payday, not the calendar month —
              so your salary and the bills it covers live in the same period. Manual entry; your data
              never leaves your server.
            </p>
            <div className="stack" style={{ gap: 'var(--space-2)' }}>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => setStep(1)}>
                Set up in 30 seconds
              </button>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={explore}>
                {busy ? 'Loading…' : 'Explore with sample data'}
              </button>
              <button type="button" className="btn btn--sm" disabled={busy} onClick={dismiss}
                style={{ alignSelf: 'center' }}>
                Skip — start empty
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="sheet__title" style={{ marginBottom: 0 }}>When does payday land?</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <div className="field" style={{ maxWidth: 150 }}>
                <label className="label" htmlFor="ob-day">Salary day of month</label>
                <input
                  id="ob-day"
                  className="input amount"
                  type="number"
                  min={1}
                  max={31}
                  value={salaryDay}
                  onChange={(e) => setSalaryDay(Math.min(31, Math.max(1, Math.round(Number(e.target.value) || 1))))}
                />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 180 }}>
                <label className="label" htmlFor="ob-weekend">If it falls on a weekend</label>
                <select
                  id="ob-weekend"
                  className="input"
                  value={weekendRule}
                  onChange={(e) => setWeekendRule(e.target.value as typeof weekendRule)}
                >
                  <option value="previous">Pay the Friday before</option>
                  <option value="exact">Pay the exact date</option>
                  <option value="next">Pay the Monday after</option>
                </select>
              </div>
            </div>
            <span className="hint">
              Your budget cycle runs <strong>{example}</strong> → the day before next payday.
            </span>
            <div className="row row--between" style={{ marginTop: 'var(--space-1)' }}>
              <button type="button" className="btn" onClick={() => setStep(0)}>Back</button>
              <button type="button" className="btn btn--primary" onClick={() => setStep(2)}>Next</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="sheet__title" style={{ marginBottom: 0 }}>Your money & safety net</h2>
            <div className="cluster">
              <div className="field" style={{ maxWidth: 120 }}>
                <label className="label" htmlFor="ob-currency">Currency</label>
                <input id="ob-currency" className="input" maxLength={3} value={currency}
                  onChange={(e) => setCurrency(e.target.value)} />
              </div>
              <div className="field" style={{ maxWidth: 140 }}>
                <label className="label" htmlFor="ob-locale">Number format</label>
                <input id="ob-locale" className="input" value={locale}
                  onChange={(e) => setLocale(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="ob-salary">Monthly salary (optional)</label>
              <input id="ob-salary" className="input amount" type="number" inputMode="decimal"
                placeholder="0" value={salary} onChange={(e) => setSalary(e.target.value)} />
              <span className="hint">Add it and Tower tracks your next payday and what's safe to spend. You can change it later in Settings.</span>
            </div>
            <div className="field" style={{ maxWidth: 200 }}>
              <label className="label" htmlFor="ob-buffer">Safety buffer</label>
              <input id="ob-buffer" className="input amount" type="number" inputMode="decimal"
                value={buffer} onChange={(e) => setBuffer(e.target.value)} />
              <span className="hint">We warn you before you'd drop below this before payday.</span>
            </div>
            <div className="row row--between" style={{ marginTop: 'var(--space-1)' }}>
              <button type="button" className="btn" onClick={() => setStep(1)}>Back</button>
              <button type="button" className="btn btn--primary" onClick={finish}>Finish setup</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** A tiny taste of the product's one answer, shown on the welcome step. */
function VerdictPreview() {
  return (
    <div className="verdict" style={{ background: 'var(--income-tint)' }}>
      <span className="row" style={{ gap: 'var(--space-1)' }} aria-hidden="true">
        <span className="dot" style={{ background: 'var(--income)' }} />
        <span className="dot" style={{ background: 'var(--debt)' }} />
        <span className="dot" style={{ background: 'var(--expense)' }} />
      </span>
      <div className="verdict__body">
        <div className="amount" style={{ color: 'var(--income)' }}>You're okay until payday</div>
        <span className="hint">Green, amber or red — at a glance, every time you open the app.</span>
      </div>
    </div>
  );
}

function Dots({ step }: { step: number }) {
  return (
    <div className="row" style={{ gap: 'var(--space-2)', justifyContent: 'center' }} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="dot"
          style={{ width: 7, height: 7, background: i === step ? 'var(--text)' : 'var(--border)' }}
        />
      ))}
    </div>
  );
}
