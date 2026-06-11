import { describe, expect, it } from 'vitest';
import { fmtDate, fmtEUR, fmtMonth, fmtPct, fmtSigned } from '../src/shared/format';

// nl-NL uses a non-breaking space between € and the number
const nb = (s: string) => s.replace(/ /g, ' ');

describe('nl-NL formatting', () => {
  it('formats EUR with dots for thousands and comma decimals', () => {
    expect(nb(fmtEUR(1234.56))).toBe('€ 1.234,56');
    expect(nb(fmtEUR(0))).toBe('€ 0,00');
    expect(nb(fmtEUR(-0.001))).toBe('€ 0,00'); // never "-€ 0,00"
  });

  it('formats signed amounts for transaction rows', () => {
    expect(nb(fmtSigned(42.5, '-'))).toBe('− € 42,50');
    expect(nb(fmtSigned(42.5, '+'))).toBe('+ € 42,50');
  });

  it('formats dates as "11 jun"', () => {
    expect(fmtDate('2026-06-11')).toBe('11 jun');
  });

  it('formats months as "juni 2026"', () => {
    expect(fmtMonth('2026-06')).toBe('juni 2026');
  });

  it('formats percentages and guards non-finite ratios', () => {
    expect(fmtPct(0.2)).toBe('20%');
    expect(fmtPct(Infinity)).toBe('—');
    expect(fmtPct(NaN)).toBe('—');
  });
});
