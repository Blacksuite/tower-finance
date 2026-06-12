import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { monthlyCost, nextBillDate } from '../../shared/recurring';
import { fmtDate, fmtEUR, todayISO } from '../../shared/format';
import type { BillingFrequency, Subscription } from '../../shared/types';
import {
  useAddSubscription,
  useAppData,
  useDeleteSubscription,
  useUpdateSubscription,
} from '../api/data';
import { parseAmount } from '../components/QuickAdd';
import { Icon } from '../components/ui/Icon';
import { Sheet } from '../components/ui/Sheet';
import { useToast } from '../components/ui/Toast';
import { CardSkeleton, EmptyState, Segmented } from '../components/ui/primitives';

const FREQ_LABELS: Record<BillingFrequency, string> = {
  monthly: 'monthly',
  quarterly: 'quarterly',
  yearly: 'yearly',
};

/** Header switcher shared by the Plans and Subscriptions pages (mobile reach). */
export function RecurringSwitcher({ current }: { current: 'plans' | 'subscriptions' }) {
  const navigate = useNavigate();
  return (
    <Segmented
      value={current}
      onChange={(v) => navigate(v === 'plans' ? '/plans' : '/subscriptions')}
      options={[
        { value: 'plans', label: 'Plans' },
        { value: 'subscriptions', label: 'Subscriptions' },
      ]}
      ariaLabel="Recurring section"
    />
  );
}

export function Subscriptions() {
  const { data, isLoading } = useAppData();
  const update = useUpdateSubscription();
  const del = useDeleteSubscription();
  const toast = useToast();
  const today = todayISO();
  const [editor, setEditor] = useState<{ open: boolean; sub: Subscription | null }>({
    open: false,
    sub: null,
  });

  if (isLoading || !data) {
    return <div className="stack"><CardSkeleton lines={3} /></div>;
  }

  const subs = data.subscriptions;
  const categories = new Map(data.categories.map((c) => [c.id, c.name]));
  const activeMonthly = subs
    .filter((s) => !s.endsOn || s.endsOn >= today)
    .reduce((a, s) => a + monthlyCost(s), 0);

  return (
    <div className="stack">
      <div className="screen-head">
        <RecurringSwitcher current="subscriptions" />
        <button className="btn btn--ghost" onClick={() => setEditor({ open: true, sub: null })}>
          <Icon name="plus" size={15} />
          New
        </button>
      </div>

      {subs.length > 0 && (
        <div className="card stat-card" style={{ maxWidth: 340 }}>
          <span className="label">Active subscriptions / month</span>
          <span className="amount amount--expense" style={{ fontSize: 'var(--text-lg)' }}>
            {fmtEUR(activeMonthly)}
          </span>
        </div>
      )}

      {subs.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="repeat"
            message="No subscriptions yet. They count toward expenses automatically — no monthly typing."
            actionLabel="Add your first subscription"
            onAction={() => setEditor({ open: true, sub: null })}
          />
        </div>
      ) : (
        <div className="chart-grid">
          {subs.map((s) => {
            const next = nextBillDate(s, today);
            const ended = !next;
            return (
              <article key={s.id} className="card plan-card">
                <div className="plan-card__head">
                  <span className="plan-card__name">{s.name}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className={`pill ${ended ? 'pill--done' : 'pill--active'}`}>
                      {ended ? 'Paused' : 'Active'}
                    </span>
                    <button className="icon-btn" onClick={() => setEditor({ open: true, sub: s })} aria-label={`Edit ${s.name}`}>
                      <Icon name="pencil" size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`Delete ${s.name}`}
                      onClick={() => {
                        if (confirm(`Delete subscription "${s.name}"? Past cycles lose this expense — pause it instead to keep history.`)) {
                          del.mutate(s.id);
                          toast.show('Subscription deleted');
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
                      {fmtEUR(s.amount)}
                      <span style={{ color: 'var(--faint)', fontWeight: 400 }}> {FREQ_LABELS[s.frequency]}</span>
                    </span>
                  </span>
                  <span className="plan-card__meta-item">
                    <span className="label">Category</span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                      {s.categoryId ? categories.get(s.categoryId) ?? '—' : '—'}
                    </span>
                  </span>
                  <span className="plan-card__meta-item">
                    <span className="label">{ended ? 'Ended' : 'Next bill'}</span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                      {ended ? (s.endsOn ? fmtDate(s.endsOn) : '—') : fmtDate(next!)}
                    </span>
                  </span>
                </div>
                {s.description && (
                  <span className="hint">{s.description}</span>
                )}
                <button
                  className="btn btn--sm btn--ghost"
                  onClick={() => {
                    update.mutate({ ...s, endsOn: ended ? null : today });
                    toast.show(ended ? `${s.name} resumed` : `${s.name} paused — history kept`);
                  }}
                >
                  {ended ? 'Resume' : 'Pause'}
                </button>
              </article>
            );
          })}
        </div>
      )}

      <Sheet
        open={editor.open}
        onClose={() => setEditor((e) => ({ ...e, open: false }))}
        title={editor.sub ? 'Edit subscription' : 'New subscription'}
      >
        {editor.open && (
          <SubscriptionForm sub={editor.sub} onDone={() => setEditor((e) => ({ ...e, open: false }))} />
        )}
      </Sheet>
    </div>
  );
}

function SubscriptionForm({ sub, onDone }: { sub: Subscription | null; onDone: () => void }) {
  const { data } = useAppData();
  const add = useAddSubscription();
  const update = useUpdateSubscription();
  const toast = useToast();
  const [name, setName] = useState(sub?.name ?? '');
  const [amount, setAmount] = useState(sub ? String(sub.amount).replace('.', ',') : '');
  const [categoryId, setCategoryId] = useState(sub?.categoryId ?? '');
  const [description, setDescription] = useState(sub?.description ?? '');
  const [firstBillDate, setFirstBillDate] = useState(sub?.firstBillDate ?? todayISO());
  const [freq, setFreq] = useState<BillingFrequency>(sub?.frequency ?? 'monthly');

  const amountN = parseAmount(amount);
  const valid = name.trim().length > 0 && amountN !== null && /^\d{4}-\d{2}-\d{2}$/.test(firstBillDate);

  const submit = () => {
    if (!valid) return;
    const payload = {
      name: name.trim(),
      amount: amountN!,
      categoryId: categoryId || null,
      description: description.trim(),
      firstBillDate,
      frequency: freq,
      endsOn: sub?.endsOn ?? null,
    };
    if (sub) update.mutate({ ...payload, id: sub.id });
    else add.mutate(payload);
    toast.show(sub ? 'Subscription updated' : 'Subscription added');
    onDone();
  };

  return (
    <form className="qa-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="qa-row">
        <div className="field">
          <label className="label" htmlFor="sub-name">Name</label>
          <input id="sub-name" className="input" placeholder="e.g. Netflix" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="sub-amount">Amount</label>
          <input id="sub-amount" className="input" inputMode="decimal" placeholder="€ 12,99" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <div className="qa-row">
        <div className="field">
          <label className="label" htmlFor="sub-freq">Billing frequency</label>
          <select id="sub-freq" className="input" value={freq} onChange={(e) => setFreq(e.target.value as BillingFrequency)}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="sub-date">First billing date</label>
          <input id="sub-date" className="input" type="date" value={firstBillDate} onChange={(e) => setFirstBillDate(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="sub-cat">Category</label>
        <select id="sub-cat" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">No category</option>
          {data?.categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor="sub-desc">Description</label>
        <input id="sub-desc" className="input" placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <button type="submit" className="btn btn--primary" disabled={!valid}>
        {sub ? 'Save changes' : 'Add subscription'}
      </button>
    </form>
  );
}
