import { describe, expect, it } from 'vitest';
import { buildEmptyData, buildSampleData } from '../src/shared/sampleData';
import { currentCycleKey, rangeMonths, summarize } from '../src/shared/calc';
import { upcomingView } from '../src/shared/upcoming';
import { isFreshInstall } from '../src/client/components/Onboarding';
import type { AppData } from '../src/shared/types';

const TODAY = '2026-06-16';
const asAppData = (p: ReturnType<typeof buildSampleData>): AppData => ({ ...p, auth: { enabled: false } });

describe('sample data', () => {
  const data = asAppData(buildSampleData(TODAY));

  it('lands the user on a populated (non-fresh) install', () => {
    expect(isFreshInstall(data)).toBe(false);
    expect(data.transactions.length).toBeGreaterThan(10);
    expect(data.incomes.length).toBe(1);
    expect(data.bills.length).toBeGreaterThan(0);
    expect(data.subscriptions.length).toBeGreaterThan(0);
    expect(data.plans.length).toBe(1);
  });

  it('reconciles to sane, non-NaN numbers', () => {
    const cycle = currentCycleKey(data.settings, TODAY);
    const months = rangeMonths(data, 'month', cycle);
    const sum = summarize(data, months);
    for (const v of Object.values(sum)) {
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    }
    expect(sum.income).toBeGreaterThan(0);
    expect(sum.expenses).toBeGreaterThan(0);
  });

  it('produces a real payday verdict', () => {
    const v = upcomingView(data, TODAY);
    expect(['okay', 'tight', 'trouble']).toContain(v.status);
    expect(Number.isFinite(v.leftUntilPayday)).toBe(true);
    expect(Number.isFinite(v.buffer)).toBe(true);
    expect(v.payday.amount).toBeGreaterThan(0); // next salary is known
  });

  it('buildEmptyData is a fresh install', () => {
    expect(isFreshInstall(asAppData(buildEmptyData()))).toBe(true);
  });
});
