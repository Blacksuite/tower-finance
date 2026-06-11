import { AnimatePresence, motion } from 'framer-motion';
import { useRef } from 'react';
import { TYPE_SIGNS } from '../../shared/constants';
import { fmtDate, fmtSigned } from '../../shared/format';
import type { Category, Transaction } from '../../shared/types';
import { useAddTransaction, useDeleteTransaction } from '../api/data';
import { useQuickAdd } from './QuickAdd';
import { Icon, categoryIcon, type IconName } from './ui/Icon';
import { useToast } from './ui/Toast';

const TYPE_ICONS: Record<Transaction['type'], IconName> = {
  income: 'wallet',
  expense: 'tag',
  saving: 'vault',
  investment: 'trend',
};

function rowVisuals(tx: Transaction, categories: Map<string, Category>) {
  if (tx.type === 'expense') {
    const cat = tx.categoryId ? categories.get(tx.categoryId) : undefined;
    return {
      icon: cat ? categoryIcon(cat.name) : ('tag' as IconName),
      secondary: cat?.name ?? 'Uncategorized',
      tint: 'var(--expense-tint)',
      ink: 'var(--expense)',
    };
  }
  const map = {
    income: { tint: 'var(--income-tint)', ink: 'var(--income)', secondary: 'Income' },
    saving: { tint: 'var(--saving-tint)', ink: 'var(--saving)', secondary: tx.account ?? 'Savings' },
    investment: { tint: 'var(--investment-tint)', ink: 'var(--investment)', secondary: tx.account ?? 'Investment' },
  }[tx.type];
  return { icon: TYPE_ICONS[tx.type], ...map };
}

export function TransactionRow({
  tx,
  categories,
}: {
  tx: Transaction;
  categories: Map<string, Category>;
}) {
  const { openEdit } = useQuickAdd();
  const del = useDeleteTransaction();
  const add = useAddTransaction();
  const toast = useToast();
  const dragging = useRef(false);
  const v = rowVisuals(tx, categories);

  const remove = () => {
    del.mutate(tx);
    toast.show('Transaction deleted', {
      action: { label: 'Undo', onClick: () => add.mutate({ ...tx }) },
    });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      style={{ position: 'relative' }}
    >
      <motion.button
        type="button"
        className="tx-row"
        drag="x"
        dragConstraints={{ left: -88, right: 0 }}
        dragElastic={0.04}
        dragSnapToOrigin
        onDragStart={() => (dragging.current = true)}
        onDragEnd={(_e, info) => {
          setTimeout(() => (dragging.current = false), 50);
          if (info.offset.x < -70) remove();
        }}
        onClick={() => {
          if (!dragging.current) openEdit(tx);
        }}
        aria-label={`${tx.description || v.secondary}, ${fmtSigned(tx.amount, TYPE_SIGNS[tx.type])}, edit`}
      >
        <span className="tx-row__icon" style={{ background: v.tint, color: v.ink }}>
          <Icon name={v.icon} size={17} />
        </span>
        <span className="tx-row__text">
          <span className="tx-row__primary">{tx.description || v.secondary}</span>
          <span className="tx-row__secondary" style={{ display: 'block' }}>
            {v.secondary}
          </span>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span className={`amount tx-row__amount amount--${tx.type}`}>
            {fmtSigned(tx.amount, TYPE_SIGNS[tx.type])}
          </span>
          <span className="tx-row__date">{fmtDate(tx.date)}</span>
        </span>
      </motion.button>
      <button className="tx-row__delete" onClick={remove} tabIndex={-1} aria-hidden="true" style={{ zIndex: -1 }}>
        Delete
      </button>
    </motion.div>
  );
}

export function TransactionList({
  transactions,
  categories,
}: {
  transactions: Transaction[];
  categories: Map<string, Category>;
}) {
  return (
    <div className="tx-list">
      <AnimatePresence initial={false}>
        {transactions.map((tx) => (
          <TransactionRow key={tx.id} tx={tx} categories={categories} />
        ))}
      </AnimatePresence>
    </div>
  );
}
