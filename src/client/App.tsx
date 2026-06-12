import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Route, BrowserRouter, Routes, useLocation } from 'react-router-dom';
import { useAppData } from './api/data';
import { configureFormat } from '../shared/format';
import { History } from './screens/History';
import { Subscriptions } from './screens/Subscriptions';
import { Layout } from './components/Layout';
import { QuickAddProvider } from './components/QuickAdd';
import { ToastProvider } from './components/ui/Toast';
import { Dashboard } from './screens/Dashboard';
import { MonthView } from './screens/MonthView';
import { Plans } from './screens/Plans';
import { Settings } from './screens/Settings';

function PasswordGate({ children }: { children: React.ReactNode }) {
  const { data, error, refetch } = useAppData();
  const [pw, setPw] = useState('');
  const [wrong, setWrong] = useState(false);
  if ((error as { status?: number } | null)?.status !== 401) {
    // apply the persisted currency/locale before anything renders amounts
    if (data) configureFormat(data.settings.currency, data.settings.locale);
    return <>{children}</>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // success sets the httpOnly session cookie; nothing is stored client-side
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      setPw('');
      refetch();
    } else {
      setWrong(true);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <form className="card qa-form" style={{ width: 'min(92vw, 360px)' }} onSubmit={submit}>
        <h2 className="sheet__title" style={{ marginBottom: 0 }}>Tower Finance</h2>
        <div className="field">
          <label className="label" htmlFor="gate-pw">Password</label>
          <input
            id="gate-pw"
            className="input"
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => { setPw(e.target.value); setWrong(false); }}
          />
        </div>
        {wrong && <span style={{ color: 'var(--expense)', fontSize: 'var(--text-sm)' }}>Wrong password</span>}
        <button type="submit" className="btn btn--primary">Unlock</button>
      </form>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // a 401 means locked — show the gate immediately, never retry it
            retry: (failureCount, error) =>
              (error as { status?: number })?.status !== 401 && failureCount < 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <ScrollToTop />
          <QuickAddProvider>
            <PasswordGate>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="months" element={<MonthView />} />
                <Route path="plans" element={<Plans />} />
                <Route path="subscriptions" element={<Subscriptions />} />
                <Route path="history" element={<History />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Routes>
            </PasswordGate>
          </QuickAddProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
