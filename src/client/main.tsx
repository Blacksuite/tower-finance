import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './theme/tokens.css';
import './theme/base.css';
import './theme/layout.css';
import './theme/components.css';
import './theme/overlays.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';

// autoUpdate applies a new service worker as soon as one is found and reloads
// the page — but an installed/open PWA never re-checks on its own, so a fresh
// deploy could sit unseen until the user cleared site data. Re-check on an
// interval and whenever the tab regains focus so updates land on their own.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, r) {
    if (!r) return;
    const check = () => r.update().catch(() => {});
    setInterval(check, 60 * 60 * 1000); // hourly
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  },
});

// older builds runtime-cached /api responses; make sure none linger on disk
if ('caches' in window) caches.delete('api-cache').catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
