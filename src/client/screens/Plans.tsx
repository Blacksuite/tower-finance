import { useMemo, useState } from 'react';
import { planStates } from '../../shared/calc';
import { currentMonthISO } from '../../shared/format';
import type { PaymentPlan } from '../../shared/types';
import { useAddPlan, useAppData, useDeletePlan, useUpdatePlan } from '../api/data';
import { PlanCard } from '../components/PlanCard';
import { parseAmount } from '../components/QuickAdd';
import { Icon } from '../components/ui/Icon';
import { Sheet } from '../components/ui/Sheet';
import { useToast } from '../components/ui/Toast';
import { CardSkeleton, EmptyState } from '../components/ui/primitives';

export function Plans() {
  const { data, isLoading } = useAppData();
  const del = useDeletePlan();
  const toast = useToast();
  const currentMonth = currentMonthISO();
  const [editor, setEditor] = useState<{ open: boolean; plan: PaymentPlan | null }>({
    open: false,
    plan: null,
  });

  const states = useMemo(
    () => (data ? planStates(data, currentMonth) : []),
    [data, currentMonth],
  );

  if (isLoading || !data) {
    return (
      <div className="stack">
        <CardSkeleton lines={3} />
        <CardSkeleton lines={3} />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="screen-head">
        <h1 className="screen-title">Payment plans</h1>
        <button className="btn btn--ghost" onClick={() => setEditor({ open: true, plan: null })}>
          <Icon name="plus" size={15} />
          New plan
        </button>
      </div>

      {states.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="layers"
            message="No payment plans yet. Track an installment purchase or a debt you pay off monthly."
            actionLabel="Create your first plan"
            onAction={() => setEditor({ open: true, plan: null })}
          />
        </div>
      ) : (
        <div className="chart-grid">
          {states.map((st) => (
            <PlanCard
              key={st.plan.id}
              state={st}
              currentMonth={currentMonth}
              onEdit={() => setEditor({ open: true, plan: st.plan })}
              onDelete={() => {
                if (confirm(`Delete plan "${st.plan.name}" and its payment history?`)) {
                  del.mutate(st.plan.id);
                  toast.show('Plan deleted');
                }
              }}
            />
          ))}
        </div>
      )}

      <Sheet
        open={editor.open}
        onClose={() => setEditor((e) => ({ ...e, open: false }))}
        title={editor.plan ? 'Edit plan' : 'New payment plan'}
      >
        {editor.open && (
          <PlanForm plan={editor.plan} onDone={() => setEditor((e) => ({ ...e, open: false }))} />
        )}
      </Sheet>
    </div>
  );
}

function PlanForm({ plan, onDone }: { plan: PaymentPlan | null; onDone: () => void }) {
  const add = useAddPlan();
  const update = useUpdatePlan();
  const toast = useToast();
  const [name, setName] = useState(plan?.name ?? '');
  const [total, setTotal] = useState(plan ? String(plan.totalAmount).replace('.', ',') : '');
  const [installment, setInstallment] = useState(plan ? String(plan.installment).replace('.', ',') : '');
  const [startMonth, setStartMonth] = useState(plan?.startMonth ?? currentMonthISO());

  const totalN = parseAmount(total);
  const instN = parseAmount(installment);
  const valid = name.trim().length > 0 && totalN !== null && instN !== null && /^\d{4}-\d{2}$/.test(startMonth);

  const submit = () => {
    if (!valid) return;
    const payload = { name: name.trim(), totalAmount: totalN!, installment: instN!, startMonth };
    if (plan) {
      update.mutate({ ...payload, id: plan.id });
      toast.show('Plan updated');
    } else {
      add.mutate(payload);
      toast.show('Plan created');
    }
    onDone();
  };

  return (
    <form
      className="qa-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="field">
        <label className="label" htmlFor="plan-name">Name</label>
        <input
          id="plan-name"
          className="input"
          placeholder="e.g. New phone"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="qa-row">
        <div className="field">
          <label className="label" htmlFor="plan-total">Total amount</label>
          <input
            id="plan-total"
            className="input"
            inputMode="decimal"
            placeholder="€ 1.200,00"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="plan-installment">Monthly installment</label>
          <input
            id="plan-installment"
            className="input"
            inputMode="decimal"
            placeholder="€ 100,00"
            value={installment}
            onChange={(e) => setInstallment(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="plan-start">First payment month</label>
        <input
          id="plan-start"
          className="input"
          type="month"
          value={startMonth}
          onChange={(e) => setStartMonth(e.target.value)}
        />
      </div>
      <button type="submit" className="btn btn--primary" disabled={!valid}>
        {plan ? 'Save changes' : 'Create plan'}
      </button>
    </form>
  );
}
