import { useEffect, useState } from 'react';
import { Icon } from './ui/Icon';

// Canonical repo; forks should change this (or remove the banner).
const REPO = 'Blacksuite/tower-finance';
const CACHE_KEY = 'tower-update-check';
const DISMISS_KEY = 'tower-update-dismissed';
const CACHE_TTL = 20 * 60 * 60 * 1000; // re-check at most once per ~day

interface CheckCache {
  latest: string;
  at: number;
}

/** true when a is a higher semver than b */
function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

function readCache(): CheckCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CheckCache;
    return typeof c.latest === 'string' && Date.now() - c.at < CACHE_TTL ? c : null;
  } catch {
    return null;
  }
}

/**
 * Slim banner shown when a newer version tag exists on GitHub. Anonymous API
 * call (public repo), cached for a day, dismissible per version. Fails silent
 * — a LAN-only device without internet simply never shows it.
 */
export function UpdateBanner() {
  const [latest, setLatest] = useState<string | null>(() => readCache()?.latest ?? null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY));

  useEffect(() => {
    if (readCache() || __APP_VERSION__ === 'dev') return;
    fetch(`https://api.github.com/repos/${REPO}/tags?per_page=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((tags: { name: string }[]) => {
        const name = tags[0]?.name;
        if (!name) return;
        localStorage.setItem(CACHE_KEY, JSON.stringify({ latest: name, at: Date.now() }));
        setLatest(name);
      })
      .catch(() => {});
  }, []);

  if (!latest || !isNewer(latest, __APP_VERSION__) || dismissed === latest) return null;

  return (
    <div className="update-banner" role="status">
      <span className="dot" style={{ background: 'var(--saving)' }} />
      <span className="update-banner__text">
        <strong>{latest}</strong> is available — you're on v{__APP_VERSION__}.
      </span>
      <a
        className="update-banner__link"
        href={`https://github.com/${REPO}/blob/main/docs/UPGRADING.md`}
        target="_blank"
        rel="noreferrer"
      >
        How to update
      </a>
      <button
        className="icon-btn"
        style={{ width: 32, height: 32 }}
        aria-label="Dismiss update notice"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, latest);
          setDismissed(latest);
        }}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
