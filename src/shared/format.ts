// Locale/currency-aware formatting. Defaults to EUR + nl-NL; the client calls
// configureFormat() with the persisted settings once data loads. All amounts
// render with tabular numerals via CSS; this module only handles strings.
import { cycleBounds } from './cycles';

function build(currency: string, locale: string) {
  try {
    return {
      eur: new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      eurWhole: new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }),
      pct: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
      dayMonth: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }),
      monthYear: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
      monthShort: new Intl.DateTimeFormat(locale, { month: 'short' }),
    };
  } catch {
    return build('EUR', 'nl-NL'); // invalid user input falls back to defaults
  }
}

let f = build('EUR', 'nl-NL');

export function configureFormat(currency: string, locale: string): void {
  f = build(currency || 'EUR', locale || 'nl-NL');
}

export function fmtEUR(n: number): string {
  return f.eur.format(roundSafe(n));
}

/** Compact form without cents, for chart labels and dense ribbons. */
export function fmtEURWhole(n: number): string {
  return f.eurWhole.format(roundSafe(n));
}

/** Signed amount for transaction rows: expenses −, income +. */
export function fmtSigned(n: number, sign: '+' | '-' | ''): string {
  return sign === '' ? fmtEUR(n) : `${sign === '-' ? '−' : '+'} ${fmtEUR(Math.abs(n))}`;
}

export function fmtPct(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${f.pct.format(ratio * 100)}%`;
}

/** "11 jun" from YYYY-MM-DD */
export function fmtDate(date: string): string {
  return f.dayMonth.format(parseLocal(date));
}

/** "juni 2026" from YYYY-MM */
export function fmtMonth(month: string): string {
  return f.monthYear.format(parseLocal(`${month}-01`));
}

/**
 * Primary label for a salary cycle: the month name when cycles are calendar
 * months (salaryDay 1), otherwise the actual date range with year.
 */
export function fmtCycle(label: string, s: { salaryDay: number; weekendRule: 'previous' | 'exact' | 'next' }): string {
  if (s.salaryDay === 1) return fmtMonth(label);
  const { start, end } = cycleBounds(label, s);
  return `${fmtDate(start)} – ${fmtDate(end)} ${end.slice(0, 4)}`;
}

/** "jun" / "jun '26" from YYYY-MM, for chart axes */
export function fmtMonthTick(month: string, withYear = false): string {
  const m = f.monthShort.format(parseLocal(`${month}-01`)).replace('.', '');
  return withYear ? `${m} '${month.slice(2, 4)}` : m;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function currentMonthISO(): string {
  return todayISO().slice(0, 7);
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
