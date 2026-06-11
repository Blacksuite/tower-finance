import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Route, BrowserRouter, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { QuickAddProvider } from './components/QuickAdd';
import { ToastProvider } from './components/ui/Toast';
import { Dashboard } from './screens/Dashboard';
import { MonthView } from './screens/MonthView';
import { Plans } from './screens/Plans';
import { Settings } from './screens/Settings';

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
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <ScrollToTop />
          <QuickAddProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="months" element={<MonthView />} />
                <Route path="plans" element={<Plans />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Routes>
          </QuickAddProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
