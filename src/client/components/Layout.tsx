import { NavLink, Outlet } from 'react-router-dom';
import { Icon, type IconName } from './ui/Icon';
import { useQuickAdd } from './QuickAdd';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Dashboard', icon: 'grid' },
  { to: '/months', label: 'Months', icon: 'calendar' },
  { to: '/plans', label: 'Plans', icon: 'layers' },
  { to: '/subscriptions', label: 'Subscriptions', icon: 'repeat' },
  { to: '/history', label: 'History', icon: 'filter' },
  { to: '/settings', label: 'Settings', icon: 'gear' },
];

// mobile tab bar stays at four items + FAB; Subscriptions and History are
// reachable from the Plans/Months headers respectively
const TABS = [NAV[0], NAV[1], NAV[2], NAV[5]];

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

export function Layout() {
  const { openNew } = useQuickAdd();

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
        <div className="sidebar__foot">The-Tower · local</div>
      </nav>

      <main className="main">
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
