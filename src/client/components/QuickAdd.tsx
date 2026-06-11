import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { TYPE_LABELS } from '../../shared/constants';
import { todayISO } from '../../shared/format';
import type { Transaction, TransactionType } from '../../shared/types';
import {
  useAddTransaction,
  useAppData,
  useDeleteTransaction,
  useUpdateTransaction,
} from '../api/data';
import { Sheet } from './ui/Sheet';
import { useToast } from './ui/Toast';
import { Segmented } from './ui/primitives';
import { Icon, categoryIcon } from './ui/Icon';

interface QuickAddApi {
  openNew: (type?: TransactionType) => void;
  openEdit: (tx: Transaction) => void;
}

const QuickAddContext = createContext<QuickAddApi>({ openNew: () => {}, openEdit: () => {} });

export const useQuickAdd = () => useContext(QuickAddContext);

/** "12,50" or "12.50" → 12.5; null when not a positive amount */
export function parseAmount(s: string): number | null {
  const cleaned = s.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

const TYPE_OPTIONS = (['expense', 'income', 'saving', 'investment'] as const).map((t) => ({
  value: t,
  label: TYPE_LABELS[t],
}));

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; editing: Transaction | null; initialType: TransactionType }>({
    open: false,
    editing: null,
    initialType: 'expense',
  });

  const api = useMemo<QuickAddApi>(
    () => ({
      openNew: (type = 'expense') => setState({ open: true, editing: null, initialType: type }),
      openEdit: (tx) => setState({ open: true, editing: tx, initialType: tx.type }),
    }),
    [],
  );

  const close = () => setState((s) => ({ ...s, open: false }));

  return (
    <QuickAddContext.Provider value={api}>
      {children}
      <Sheet
        open={state.open}
        onClose={close}
        title={state.editing ? 'Edit transaction' : 'Add transaction'}
      >
        {state.open && (
          <QuickAddForm editing={state.editing} initialType={state.initialType} onDone={close} />
        )}
      </Sheet>
    </QuickAddContext.Provider>
  );
}

function QuickAddForm({
  editing,
  initialType,
  onDone,
}: {
  editing: Transaction | null;
  initialType: TransactionType;
  onDone: () => void;
}) {
  const { data } = useAppData();
  const toast = useToast();
  const add = useAddTransaction();
  const update = useUpdateTransaction();
  const del = useDeleteTransaction();

  const [type, setType] = useState<TransactionType>(initialType);
  const [amountStr, setAmountStr] = useState(editing ? String(editing.amount).replace('.', ',') : '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [categoryId, setCategoryId] = useState<string | null>(editing?.categoryId ?? null);
  const [account, setAccount] = useState(editing?.account ?? '');
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // open the numeric keypad immediately; slight delay lets the sheet mount
    const t = setTimeout(() => amountRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  // most-used categories first, then seed order
  const categories = useMemo(() => {
    if (!data) return [];
    const usage = new Map<string, number>();
    for (const t of data.transactions) {
      if (t.categoryId) usage.set(t.categoryId, (usage.get(t.categoryId) ?? 0) + 1);
    }
    return [...data.categories].sort(
      (a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.sortOrder - b.sortOrder,
    );
  }, [data]);

  const accounts = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const t of data.transactions) {
      if (t.account && t.type === type) set.add(t.account);
    }
    return [...set];
  }, [data, type]);

  const amount = parseAmount(amountStr);
  const valid = amount !== null;

  const submit = () => {
    if (amount === null) return;
    const tx = {
      date,
      type,
      description: description.trim(),
      categoryId: type === 'expense' ? categoryId : null,
      account: type === 'saving' || type === 'investment' ? account.trim() || null : null,
      amount,
    };
    if (editing) {
      update.mutate({ ...tx, id: editing.id });
      toast.show('Transaction updated');
    } else {
      add.mutate(tx);
      toast.show(`${TYPE_LABELS[type]} added`);
    }
    onDone();
  };

  const remove = () => {
    if (!editing) return;
    del.mutate(editing);
    onDone();
    toast.show('Transaction deleted', {
      action: { label: 'Undo', onClick: () => add.mutate({ ...editing }) },
    });
  };

  return (
    <form
      className="qa-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Segmented value={type} onChange={(t) => setType(t)} options={TYPE_OPTIONS} block ariaLabel="Transaction type" />

      <input
        ref={amountRef}
        className="qa-amount"
        inputMode="decimal"
        placeholder="€ 0,00"
        aria-label="Amount in euros"
        value={amountStr}
        onChange={(e) => setAmountStr(e.target.value)}
      />

      {type === 'expense' && (
        <div className="chip-grid" role="radiogroup" aria-label="Category">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={categoryId === c.id}
              className={`chip${categoryId === c.id ? ' is-active' : ''}`}
              onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
            >
              <Icon name={categoryIcon(c.name)} size={14} />
              {c.name}
            </button>
          ))}
        </div>
      )}

      {(type === 'saving' || type === 'investment') && (
        <div className="field">
          <label className="label" htmlFor="qa-account">
            {type === 'saving' ? 'Account' : 'Asset'}
          </label>
          <input
            id="qa-account"
            className="input"
            list="qa-accounts"
            placeholder={type === 'saving' ? 'e.g. Savings account' : 'e.g. World ETF'}
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          />
          <datalist id="qa-accounts">
            {accounts.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
      )}

      <div className="qa-row">
        <div className="field">
          <label className="label" htmlFor="qa-desc">Description</label>
          <input
            id="qa-desc"
            className="input"
            placeholder="Optional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="qa-date">Date</label>
          <input
            id="qa-date"
            className="input"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <button type="submit" className="btn btn--primary" disabled={!valid}>
        {editing ? 'Save changes' : `Add ${TYPE_LABELS[type].toLowerCase()}`}
      </button>
      {editing && (
        <button type="button" className="btn btn--danger" onClick={remove}>
          Delete transaction
        </button>
      )}
    </form>
  );
}
