import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { salaryDate } from '../../shared/cycles';
import { fmtDate, fmtEUR, currentMonthISO } from '../../shared/format';
import type { BillingFrequency, Category, ExpenseTemplate } from '../../shared/types';
import {
  importData,
  manageAuth,
  useAddCategory,
  useAddTemplate,
  useAppData,
  useDeleteCategory,
  useDeleteTemplate,
  useUpdateCategory,
  useUpdateSettings,
  useUpdateTemplate,
} from '../api/data';
import { parseAmount } from '../components/QuickAdd';
import { Icon } from '../components/ui/Icon';
import { Sheet } from '../components/ui/Sheet';
import { useToast } from '../components/ui/Toast';
import { CardSkeleton, Section, Segmented } from '../components/ui/primitives';
import { useTheme, type ThemePref } from '../theme/theme';

export function Settings() {
  const { data, isLoading } = useAppData();
  const { pref, setPref } = useTheme();

  if (isLoading || !data) {
    return (
      <div className="stack">
        <CardSkeleton lines={4} />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="screen-head">
        <h1 className="screen-title">Settings</h1>
      </div>

      <Section title="Appearance">
        <Segmented<ThemePref>
          value={pref}
          onChange={setPref}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          ariaLabel="Theme"
        />
      </Section>

      <Section title="Salary cycle">
        <SalaryCycleForm />
      </Section>

      <Section title="Monthly targets & net worth">
        <TargetsForm />
      </Section>

      <Section title="Categories & budgets">
        <CategoryManager categories={data.categories} />
      </Section>

      <Section title="Recurring expense templates">
        <TemplateManager templates={data.templates} categories={data.categories} />
      </Section>

      <Section title="Security">
        <SecurityForm enabled={data.auth.enabled} />
      </Section>

      <Section title="Currency & locale">
        <CurrencyForm />
      </Section>

      <Section title="Backup">
        <BackupControls />
      </Section>

      <span className="hint" style={{ textAlign: 'center' }}>
        Tower Finance v{__APP_VERSION__}
      </span>
    </div>
  );
}

function SalaryCycleForm() {
  const { data } = useAppData();
  const update = useUpdateSettings();
  if (!data) return null;
  const s = data.settings;
  const example = salaryDate(currentMonthISO(), s);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
      <div className="field" style={{ maxWidth: 160 }}>
        <label className="label" htmlFor="set-salaryday">Salary day of month</label>
        <input
          id="set-salaryday"
          className="input amount"
          type="number"
          min={1}
          max={31}
          value={s.salaryDay}
          onChange={(e) => {
            const n = Math.min(31, Math.max(1, Math.round(Number(e.target.value) || 1)));
            update.mutate({ salaryDay: n });
          }}
        />
      </div>
      <div className="field" style={{ maxWidth: 220 }}>
        <label className="label" htmlFor="set-weekend">If it falls on a weekend</label>
        <select
          id="set-weekend"
          className="input"
          value={s.weekendRule}
          onChange={(e) => update.mutate({ weekendRule: e.target.value as typeof s.weekendRule })}
        >
          <option value="previous">Previous Friday</option>
          <option value="exact">Exact date</option>
          <option value="next">Next Monday</option>
        </select>
      </div>
      <span className="hint" style={{ paddingBottom: 12 }}>
        Budget periods run from one salary date to the day before the next.
        This month's salary date: <strong>{fmtDate(example)}</strong>.
      </span>
    </div>
  );
}

function CurrencyForm() {
  const { data } = useAppData();
  const update = useUpdateSettings();
  const [currency, setCurrency] = useState(data?.settings.currency ?? 'EUR');
  const [locale, setLocale] = useState(data?.settings.locale ?? 'nl-NL');
  if (!data) return null;
  const commit = () => {
    const cur = currency.trim().toUpperCase();
    const loc = locale.trim();
    if (/^[A-Z]{3}$/.test(cur) && loc.length >= 2 &&
        (cur !== data.settings.currency || loc !== data.settings.locale)) {
      update.mutate({ currency: cur, locale: loc });
      setTimeout(() => location.reload(), 350); // formatters are module-level; reload applies them everywhere
    }
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
      <div className="field" style={{ maxWidth: 120 }}>
        <label className="label" htmlFor="set-currency">Currency</label>
        <input id="set-currency" className="input" value={currency} maxLength={3}
          onChange={(e) => setCurrency(e.target.value)} onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </div>
      <div className="field" style={{ maxWidth: 140 }}>
        <label className="label" htmlFor="set-locale">Locale</label>
        <input id="set-locale" className="input" value={locale}
          onChange={(e) => setLocale(e.target.value)} onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </div>
      <span className="hint" style={{ paddingBottom: 12 }}>
        e.g. EUR + nl-NL → {fmtEUR(1234.56)}
      </span>
    </div>
  );
}

function SecurityForm({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (body: { current?: string; next?: string; enabled: boolean }, msg: string) => {
    setBusy(true);
    try {
      await manageAuth(body);
      await qc.invalidateQueries({ queryKey: ['bootstrap'] });
      setCurrent(''); setNext(''); setConfirmPw('');
      toast.show(msg);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Failed', { error: true });
    } finally {
      setBusy(false);
    }
  };

  const mismatch = next.length > 0 && next !== confirmPw;
  const canSubmit = next.length >= 4 && next === confirmPw && (!enabled || current.length > 0);

  return (
    <form
      style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) run({ current: enabled ? current : undefined, next, enabled: true }, enabled ? 'Password changed' : 'Password protection enabled');
      }}
    >
      {enabled && (
        <div className="field" style={{ maxWidth: 200 }}>
          <label className="label" htmlFor="sec-current">Current password</label>
          <input id="sec-current" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
      )}
      <div className="field" style={{ maxWidth: 200 }}>
        <label className="label" htmlFor="sec-next">{enabled ? 'New password' : 'Password'}</label>
        <input id="sec-next" className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div className="field" style={{ maxWidth: 200 }}>
        <label className="label" htmlFor="sec-confirm">Confirm</label>
        <input id="sec-confirm" className="input" type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
      </div>
      <button type="submit" className="btn btn--ghost" disabled={busy || !canSubmit}>
        {enabled ? 'Change password' : 'Enable protection'}
      </button>
      {enabled && (
        <button
          type="button"
          className="btn btn--danger btn--sm"
          disabled={busy || current.length === 0}
          onClick={() => run({ current, enabled: false }, 'Password protection disabled')}
        >
          Disable
        </button>
      )}
      <span className="hint" style={{ width: '100%' }}>
        {mismatch
          ? 'Passwords do not match.'
          : enabled
            ? 'Sessions use httpOnly cookies; changing or disabling the password signs out every device. Stored as a salted hash, never in backups. Use the lock icon (top bar / sidebar) to lock without disabling.'
            : 'Optional — when enabled, a login screen protects the app and all API data (min 4 characters).'}
      </span>
    </form>
  );
}

function TemplateManager({ templates, categories }: { templates: ExpenseTemplate[]; categories: Category[] }) {
  const del = useDeleteTemplate();
  const toast = useToast();
  const [editor, setEditor] = useState<{ open: boolean; tpl: ExpenseTemplate | null }>({ open: false, tpl: null });
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div>
      {templates.length === 0 && (
        <span className="hint">
          Templates pre-fill the quick-add form from a dropdown — handy for routine expenses.
        </span>
      )}
      {templates.map((t) => (
        <div key={t.id} className="settings-row">
          <span className="settings-row__name" style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
            {t.name}
            <span className="hint" style={{ display: 'block' }}>
              {fmtEUR(t.amount)} · {t.categoryId ? catName.get(t.categoryId) ?? '—' : 'no category'}
              {t.defaultDay ? ` · day ${t.defaultDay}` : ''}
            </span>
          </span>
          <button className="icon-btn" onClick={() => setEditor({ open: true, tpl: t })} aria-label={`Edit ${t.name}`}>
            <Icon name="pencil" size={15} />
          </button>
          <button
            className="icon-btn"
            aria-label={`Delete ${t.name}`}
            onClick={() => { del.mutate(t.id); toast.show('Template deleted'); }}
          >
            <Icon name="trash" size={15} />
          </button>
        </div>
      ))}
      <button className="btn btn--ghost btn--sm" style={{ marginTop: 12 }} onClick={() => setEditor({ open: true, tpl: null })}>
        <Icon name="plus" size={14} />
        New template
      </button>
      <Sheet
        open={editor.open}
        onClose={() => setEditor((e) => ({ ...e, open: false }))}
        title={editor.tpl ? 'Edit template' : 'New template'}
      >
        {editor.open && (
          <TemplateForm tpl={editor.tpl} categories={categories} onDone={() => setEditor((e) => ({ ...e, open: false }))} />
        )}
      </Sheet>
    </div>
  );
}

function TemplateForm({ tpl, categories, onDone }: { tpl: ExpenseTemplate | null; categories: Category[]; onDone: () => void }) {
  const add = useAddTemplate();
  const update = useUpdateTemplate();
  const toast = useToast();
  const [name, setName] = useState(tpl?.name ?? '');
  const [amount, setAmount] = useState(tpl ? String(tpl.amount).replace('.', ',') : '');
  const [categoryId, setCategoryId] = useState(tpl?.categoryId ?? '');
  const [description, setDescription] = useState(tpl?.description ?? '');
  const [freq, setFreq] = useState<BillingFrequency>(tpl?.frequency ?? 'monthly');
  const [day, setDay] = useState(tpl?.defaultDay ? String(tpl.defaultDay) : '');

  const amountN = parseAmount(amount);
  const valid = name.trim().length > 0 && amountN !== null;

  const submit = () => {
    if (!valid) return;
    const dayN = day.trim() === '' ? null : Math.min(31, Math.max(1, Math.round(Number(day) || 1)));
    const payload = {
      name: name.trim(), amount: amountN!, categoryId: categoryId || null,
      description: description.trim(), frequency: freq, defaultDay: dayN,
    };
    if (tpl) update.mutate({ ...payload, id: tpl.id });
    else add.mutate(payload);
    toast.show(tpl ? 'Template updated' : 'Template added');
    onDone();
  };

  return (
    <form className="qa-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="qa-row">
        <div className="field">
          <label className="label" htmlFor="tpl-name">Name</label>
          <input id="tpl-name" className="input" placeholder="e.g. Fuel" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="tpl-amount">Amount</label>
          <input id="tpl-amount" className="input" inputMode="decimal" placeholder="€ 60,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <div className="qa-row">
        <div className="field">
          <label className="label" htmlFor="tpl-cat">Category</label>
          <select id="tpl-cat" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="tpl-day">Default day (optional)</label>
          <input id="tpl-day" className="input" type="number" min={1} max={31} placeholder="e.g. 15" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
      </div>
      <div className="qa-row">
        <div className="field">
          <label className="label" htmlFor="tpl-desc">Description</label>
          <input id="tpl-desc" className="input" placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="tpl-freq">Frequency</label>
          <select id="tpl-freq" className="input" value={freq} onChange={(e) => setFreq(e.target.value as BillingFrequency)}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
      </div>
      <button type="submit" className="btn btn--primary" disabled={!valid}>
        {tpl ? 'Save changes' : 'Add template'}
      </button>
    </form>
  );
}

/** Numeric settings field that commits on blur/Enter. */
function MoneyField({
  id,
  label,
  value,
  allowNegative,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  allowNegative?: boolean;
  onCommit: (n: number) => void;
}) {
  const display = String(value).replace('.', ',');
  const [text, setText] = useState(display);
  useEffect(() => setText(display), [display]);

  const commit = () => {
    const raw = text.trim().replace(',', '.');
    const n = allowNegative ? Number(raw) : parseAmount(text) ?? (raw === '0' ? 0 : null);
    if (n === null || !Number.isFinite(n)) {
      setText(display);
      return;
    }
    if (n !== value) onCommit(Math.round(n * 100) / 100);
  };

  return (
    <div className="field" style={{ maxWidth: 220 }}>
      <label className="label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input amount"
        inputMode={allowNegative ? 'text' : 'decimal'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}

function TargetsForm() {
  const { data } = useAppData();
  const update = useUpdateSettings();
  if (!data) return null;
  const s = data.settings;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      <MoneyField
        id="set-savings"
        label="Savings target / month"
        value={s.savingsTarget}
        onCommit={(n) => update.mutate({ savingsTarget: n })}
      />
      <MoneyField
        id="set-invest"
        label="Investments target / month"
        value={s.investmentsTarget}
        onCommit={(n) => update.mutate({ investmentsTarget: n })}
      />
      <MoneyField
        id="set-networth"
        label="Starting net worth"
        value={s.startingNetWorth}
        allowNegative
        onCommit={(n) => update.mutate({ startingNetWorth: n })}
      />
    </div>
  );
}

function CategoryManager({ categories }: { categories: Category[] }) {
  const add = useAddCategory();
  const update = useUpdateCategory();
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState<Category | null>(null);

  return (
    <div>
      {categories.map((c) => (
        <CategoryRow key={c.id} category={c} onDelete={() => setDeleting(c)} onSave={(cat) => update.mutate(cat)} />
      ))}

      <form
        style={{ display: 'flex', gap: 8, marginTop: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name) return;
          add.mutate({ name, budget: 0 });
          setNewName('');
          toast.show(`Category "${name}" added`);
        }}
      >
        <input
          className="input"
          placeholder="New category name"
          aria-label="New category name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn btn--ghost" disabled={!newName.trim()}>
          Add
        </button>
      </form>

      <ReassignDialog category={deleting} categories={categories} onClose={() => setDeleting(null)} />
    </div>
  );
}

function CategoryRow({
  category,
  onSave,
  onDelete,
}: {
  category: Category;
  onSave: (c: Category) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [budget, setBudget] = useState(String(category.budget).replace('.', ','));

  useEffect(() => {
    setName(category.name);
    setBudget(String(category.budget).replace('.', ','));
  }, [category]);

  const commit = () => {
    const trimmed = name.trim() || category.name;
    const b = budget.trim() === '' || budget.trim() === '0' ? 0 : parseAmount(budget) ?? category.budget;
    if (trimmed !== category.name || b !== category.budget) {
      onSave({ ...category, name: trimmed, budget: b });
    }
    setName(trimmed);
    setBudget(String(b).replace('.', ','));
  };

  return (
    <div className="settings-row">
      <span className="settings-row__name">
        <input
          className="inline-name"
          aria-label={`Rename ${category.name}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </span>
      <input
        className="budget-input"
        inputMode="decimal"
        aria-label={`Monthly budget for ${category.name}`}
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <button className="icon-btn" onClick={onDelete} aria-label={`Delete ${category.name}`}>
        <Icon name="trash" size={15} />
      </button>
    </div>
  );
}

function ReassignDialog({
  category,
  categories,
  onClose,
}: {
  category: Category | null;
  categories: Category[];
  onClose: () => void;
}) {
  const { data } = useAppData();
  const del = useDeleteCategory();
  const toast = useToast();
  const others = categories.filter((c) => c.id !== category?.id);
  const [target, setTarget] = useState('');

  const inUse = category
    ? (data?.transactions.filter((t) => t.categoryId === category.id).length ?? 0)
    : 0;

  return (
    <Sheet open={category !== null} onClose={onClose} title={`Delete "${category?.name}"`}>
      <div className="qa-form">
        {inUse > 0 ? (
          <>
            <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>
              {inUse} transaction{inUse === 1 ? '' : 's'} use this category. Pick a category to move them to.
            </p>
            <select
              className="input"
              aria-label="Reassign transactions to"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose a category…</option>
              {others.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </>
        ) : (
          <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>
            This category has no transactions and can be deleted safely.
          </p>
        )}
        <button
          className="btn btn--danger"
          disabled={inUse > 0 && !target}
          onClick={() => {
            if (!category) return;
            del.mutate({ id: category.id, reassignTo: inUse > 0 ? target : null });
            toast.show(`Category "${category.name}" deleted`);
            onClose();
          }}
        >
          Delete category
        </button>
      </div>
    </Sheet>
  );
}

function BackupControls() {
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onImport = async (file: File) => {
    setBusy(true);
    try {
      const payload = JSON.parse(await file.text()) as unknown;
      if (!confirm('Importing replaces ALL current data with the backup. Continue?')) return;
      await importData(qc, payload);
      toast.show('Backup imported');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Import failed', { error: true });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onExport = async () => {
    const res = await fetch('/api/export'); // session cookie is sent automatically
    if (!res.ok) {
      toast.show('Export failed', { error: true });
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `tower-finance-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <button className="btn btn--ghost" onClick={onExport}>
        <Icon name="download" size={15} />
        Export JSON
      </button>
      <button className="btn btn--ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
        <Icon name="upload" size={15} />
        Import JSON
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
      />
    </div>
  );
}
