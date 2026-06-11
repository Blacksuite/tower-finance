import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { Category } from '../../shared/types';
import {
  importData,
  useAddCategory,
  useAppData,
  useDeleteCategory,
  useUpdateCategory,
  useUpdateSettings,
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

      <Section title="Monthly targets & net worth">
        <TargetsForm />
      </Section>

      <Section title="Categories & budgets">
        <CategoryManager categories={data.categories} />
      </Section>

      <Section title="Backup">
        <BackupControls />
      </Section>
    </div>
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

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <a className="btn btn--ghost" href="/api/export" download>
        <Icon name="download" size={15} />
        Export JSON
      </a>
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
