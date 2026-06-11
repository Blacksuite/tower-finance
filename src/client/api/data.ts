import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { currentCycleKey } from '../../shared/calc';
import { currentMonthISO, todayISO } from '../../shared/format';
import type {
  AppData,
  Category,
  ExpenseTemplate,
  PaymentPlan,
  Settings,
  Subscription,
  Transaction,
} from '../../shared/types';
import { useToast } from '../components/ui/Toast';

const KEY = ['bootstrap'];

const KEY_STORE = 'tower-key';
export const getAuthKey = () => localStorage.getItem(KEY_STORE) ?? '';
export const setAuthKey = (k: string) => localStorage.setItem(KEY_STORE, k);

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'x-tower-key': getAuthKey(),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw Object.assign(new Error(err?.error || `Request failed (${res.status})`), {
      status: res.status,
    });
  }
  return res.json() as Promise<T>;
}

export function useAppData() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<AppData>('GET', '/bootstrap'),
    staleTime: 60_000,
  });
}

/** Label of the salary cycle containing today (= calendar month by default). */
export function useCurrentCycle(): string {
  const { data } = useAppData();
  return data ? currentCycleKey(data.settings, todayISO()) : currentMonthISO();
}

/**
 * Optimistic mutation against the single bootstrap cache entry: apply the
 * change locally first, roll back and toast if the request fails.
 */
function useOptimistic<TVars, TResult = unknown>(
  mutationFn: (vars: TVars) => Promise<TResult>,
  apply: (data: AppData, vars: TVars) => AppData,
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn,
    onMutate: async (vars: TVars) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<AppData>(KEY);
      if (prev) qc.setQueryData<AppData>(KEY, apply(prev, vars));
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
      toast.show(err instanceof Error ? err.message : 'Something went wrong', { error: true });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export type TransactionInput = Omit<Transaction, 'id'>;

const tempId = () => `tmp-${Math.random().toString(36).slice(2)}`;

export function useAddTransaction() {
  return useOptimistic(
    (t: TransactionInput) => api<Transaction>('POST', '/transactions', t),
    (data, t) => ({
      ...data,
      transactions: [{ ...t, id: tempId() }, ...data.transactions],
    }),
  );
}

export function useUpdateTransaction() {
  return useOptimistic(
    (t: Transaction) => api<Transaction>('PUT', `/transactions/${t.id}`, stripId(t)),
    (data, t) => ({
      ...data,
      transactions: data.transactions.map((x) => (x.id === t.id ? t : x)),
    }),
  );
}

export function useDeleteTransaction() {
  return useOptimistic(
    (t: Transaction) => api('DELETE', `/transactions/${t.id}`),
    (data, t) => ({
      ...data,
      transactions: data.transactions.filter((x) => x.id !== t.id),
    }),
  );
}

export function useAddCategory() {
  return useOptimistic(
    (c: { name: string; budget: number }) => api<Category>('POST', '/categories', c),
    (data, c) => ({
      ...data,
      categories: [
        ...data.categories,
        { id: tempId(), name: c.name, budget: c.budget, sortOrder: data.categories.length },
      ],
    }),
  );
}

export function useUpdateCategory() {
  return useOptimistic(
    (c: Category) => api('PUT', `/categories/${c.id}`, { name: c.name, budget: c.budget, sortOrder: c.sortOrder }),
    (data, c) => ({
      ...data,
      categories: data.categories.map((x) => (x.id === c.id ? c : x)),
    }),
  );
}

export function useDeleteCategory() {
  const remap = <T extends { categoryId: string | null }>(items: T[], id: string, to: string | null) =>
    items.map((t) => (t.categoryId === id ? { ...t, categoryId: to } : t));
  return useOptimistic(
    (v: { id: string; reassignTo: string | null }) =>
      api('DELETE', `/categories/${v.id}`, { reassignTo: v.reassignTo }),
    (data, v) => ({
      ...data,
      categories: data.categories.filter((x) => x.id !== v.id),
      transactions: remap(data.transactions, v.id, v.reassignTo),
      subscriptions: remap(data.subscriptions, v.id, v.reassignTo),
      templates: remap(data.templates, v.id, v.reassignTo),
    }),
  );
}

export type SubscriptionInput = Omit<Subscription, 'id'>;

export function useAddSubscription() {
  return useOptimistic(
    (s: SubscriptionInput) => api<Subscription>('POST', '/subscriptions', s),
    (data, s) => ({ ...data, subscriptions: [...data.subscriptions, { ...s, id: tempId() }] }),
  );
}

export function useUpdateSubscription() {
  return useOptimistic(
    (s: Subscription) => api<Subscription>('PUT', `/subscriptions/${s.id}`, stripId(s)),
    (data, s) => ({ ...data, subscriptions: data.subscriptions.map((x) => (x.id === s.id ? s : x)) }),
  );
}

export function useDeleteSubscription() {
  return useOptimistic(
    (id: string) => api('DELETE', `/subscriptions/${id}`),
    (data, id) => ({ ...data, subscriptions: data.subscriptions.filter((x) => x.id !== id) }),
  );
}

export type TemplateInput = Omit<ExpenseTemplate, 'id'>;

export function useAddTemplate() {
  return useOptimistic(
    (t: TemplateInput) => api<ExpenseTemplate>('POST', '/templates', t),
    (data, t) => ({ ...data, templates: [...data.templates, { ...t, id: tempId() }] }),
  );
}

export function useUpdateTemplate() {
  return useOptimistic(
    (t: ExpenseTemplate) => api<ExpenseTemplate>('PUT', `/templates/${t.id}`, stripId(t)),
    (data, t) => ({ ...data, templates: data.templates.map((x) => (x.id === t.id ? t : x)) }),
  );
}

export function useDeleteTemplate() {
  return useOptimistic(
    (id: string) => api('DELETE', `/templates/${id}`),
    (data, id) => ({ ...data, templates: data.templates.filter((x) => x.id !== id) }),
  );
}

/** Enable / change / disable the password. Stores the rotated session token. */
export async function manageAuth(body: { current?: string; next?: string; enabled: boolean }) {
  const res = await api<{ enabled: boolean; token: string | null }>('POST', '/auth', body);
  setAuthKey(res.token ?? '');
  return res;
}

export type PlanInput = Omit<PaymentPlan, 'id'>;

export function useAddPlan() {
  return useOptimistic(
    (p: PlanInput) => api<PaymentPlan>('POST', '/plans', p),
    (data, p) => ({ ...data, plans: [...data.plans, { ...p, id: tempId() }] }),
  );
}

export function useUpdatePlan() {
  return useOptimistic(
    (p: PaymentPlan) => api<PaymentPlan>('PUT', `/plans/${p.id}`, stripId(p)),
    (data, p) => ({ ...data, plans: data.plans.map((x) => (x.id === p.id ? p : x)) }),
  );
}

export function useDeletePlan() {
  return useOptimistic(
    (id: string) => api('DELETE', `/plans/${id}`),
    (data, id) => ({
      ...data,
      plans: data.plans.filter((x) => x.id !== id),
      planPayments: data.planPayments.filter((p) => p.planId !== id),
    }),
  );
}

export function useSetPlanPayment() {
  return useOptimistic(
    (v: { planId: string; month: string; amountPaid: number }) =>
      api('PUT', `/plans/${v.planId}/payments/${v.month}`, { amountPaid: v.amountPaid }),
    (data, v) => ({
      ...data,
      planPayments: [
        ...data.planPayments.filter((p) => !(p.planId === v.planId && p.month === v.month)),
        v,
      ],
    }),
  );
}

export function useClearPlanPayment() {
  return useOptimistic(
    (v: { planId: string; month: string }) =>
      api('DELETE', `/plans/${v.planId}/payments/${v.month}`),
    (data, v) => ({
      ...data,
      planPayments: data.planPayments.filter(
        (p) => !(p.planId === v.planId && p.month === v.month),
      ),
    }),
  );
}

export function useUpdateSettings() {
  return useOptimistic(
    (s: Partial<Settings>) => api<Settings>('PUT', '/settings', s),
    (data, s) => ({ ...data, settings: { ...data.settings, ...s } }),
  );
}

export async function importData(qc: QueryClient, payload: unknown) {
  await api('POST', '/import', payload);
  await qc.invalidateQueries({ queryKey: KEY });
}

function stripId<T extends { id: string }>(obj: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = obj;
  return rest;
}
