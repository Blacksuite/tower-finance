// nl-NL formatting for EUR amounts and dates. All amounts render with
// tabular numerals via CSS; this module only handles locale strings.

const eur = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const eurWhole = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function fmtEUR(n: number): string {
  return eur.format(roundSafe(n));
}

/** Compact form without cents, for chart labels and dense ribbons. */
export function fmtEURWhole(n: number): string {
  return eurWhole.format(roundSafe(n));
}

/** Signed amount for transaction rows: expenses −, income +. */
export function fmtSigned(n: number, sign: '+' | '-' | ''): string {
  return sign === '' ? fmtEUR(n) : `${sign === '-' ? '−' : '+'} ${fmtEUR(Math.abs(n))}`;
}

export function fmtPct(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(ratio * 100)}%`;
}

const dayMonth = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' });
const monthYear = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' });
const monthShort = new Intl.DateTimeFormat('nl-NL', { month: 'short' });

/** "11 jun" from YYYY-MM-DD */
export function fmtDate(date: string): string {
  return dayMonth.format(parseLocal(date));
}

/** "juni 2026" from YYYY-MM */
export function fmtMonth(month: string): string {
  return monthYear.format(parseLocal(`${month}-01`));
}

/** "jun" / "jun '26" from YYYY-MM, for chart axes */
export function fmtMonthTick(month: string, withYear = false): string {
  const d = parseLocal(`${month}-01`);
  const m = monthShort.format(d).replace('.', '');
  return withYear ? `${m} '${month.slice(2, 4)}` : m;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function currentMonthISO(): string {
  return todayISO().slice(0, 7);
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseLocal(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function roundSafe(n: number): number {
  if (!Number.isFinite(n)) return 0;
  // avoid "-€ 0,00" from floating point dust
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}
