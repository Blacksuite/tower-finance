import { useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router-dom';
import { lockApp, useAppData } from '../api/data';
import { Icon, type IconName } from './ui/Icon';
import { UpdateBanner } from './UpdateBanner';
import { useQuickAdd } from './QuickAdd';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Dashboard', icon: 'grid' },
  { to: '/months', label: 'Months', icon: 'calendar' },
  { to: '/insights', label: 'Insights', icon: 'trend' },
  { to: '/plans', label: 'Plans', icon: 'layers' },
  { to: '/bills', label: 'Bills', icon: 'wallet' },
  { to: '/subscriptions', label: 'Subscriptions', icon: 'repeat' },
  { to: '/history', label: 'History', icon: 'filter' },
  { to: '/settings', label: 'Settings', icon: 'gear' },
];

// Mobile tab bar: five destinations + the FAB. Settings lives in the top bar
// (gear); Bills & Subscriptions live in the labeled Plans ⇄ Bills ⇄
// Subscriptions switcher under the Plans tab. Rendered 2 + FAB + 3.
const TABS = [NAV[0], NAV[1], NAV[2], NAV[3], NAV[6]];

function BrandMark() {
  return (
    <svg className="sidebar__brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="var(--surface-2)" />
      <rect x="9" y="4" width="6" height="5" rx="1" fill="var(--income)" />
      <rect x="7.5" y="10" width="9" height="4.5" rx="1" fill="var(--saving)" />
      <rect x="6" y="15.5" width="12" height="4.5" rx="1" fill="var(--investment)" />
    </svg>
  );
}

/** Revokes this device's session; the next fetch returns 401 → login gate. */
function useLock() {
  const qc = useQueryClient();
  return async () => {
    await lockApp();
    await qc.refetchQueries({ queryKey: ['bootstrap'] });
  };
}

export function Layout() {
  const { openNew } = useQuickAdd();
  const { data } = useAppData();
  const lock = useLock();
  const authEnabled = data?.auth.enabled ?? false;

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="sidebar__brand">
          <BrandMark />
          Tower Finance
        </div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) => `sidebar__item${isActive ? ' is-active' : ''}`}
          >
            <Icon name={n.icon} size={17} />
            {n.label}
          </NavLink>
        ))}
        <button className="btn btn--primary sidebar__add" onClick={() => openNew()}>
          <Icon name="plus" size={16} />
          Add transaction
        </button>
        <div className="sidebar__foot">
          {authEnabled && (
            <button className="sidebar__item" style={{ width: '100%' }} onClick={lock}>
              <Icon name="lock" size={16} />
              Lock app
            </button>
          )}
          <span style={{ padding: '8px 12px', display: 'block' }}>v{__APP_VERSION__}</span>
        </div>
      </nav>

      <header className="topbar">
        <span className="topbar__brand">
          <BrandMark />
          Tower
        </span>
        <span className="topbar__actions">
          {authEnabled && (
            <button className="icon-btn" onClick={lock} aria-label="Lock app">
              <Icon name="lock" size={18} />
            </button>
          )}
          <NavLink to="/settings" className="icon-btn" aria-label="Settings">
            <Icon name="gear" size={18} />
          </NavLink>
        </span>
      </header>

      <main className="main">
        <UpdateBanner />
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.slice(0, 2).map((n) => (
          <TabItem key={n.to} {...n} />
        ))}
        <div className="tabbar__fab-slot">
          <button className="fab" onClick={() => openNew()} aria-label="Add transaction">
            <Icon name="plus" size={24} strokeWidth={2.2} />
          </button>
        </div>
        {TABS.slice(2).map((n) => (
          <TabItem key={n.to} {...n} />
        ))}
      </nav>
    </div>
  );
}

function TabItem({ to, label, icon }: { to: string; label: string; icon: IconName }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => `tabbar__item${isActive ? ' is-active' : ''}`}
    >
      <Icon name={icon} size={20} />
      {label}
    </NavLink>
  );
}
