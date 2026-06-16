import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { SAMPLE_MARKER } from '../../shared/sampleData';
import { clearAllData } from '../api/data';
import { useToast } from './ui/Toast';
import { Icon } from './ui/Icon';

/**
 * Shown while the "Explore" sample dataset is loaded, so it's never mistaken for
 * real data. One tap clears everything back to a fresh install.
 */
export function SampleBanner() {
  const qc = useQueryClient();
  const toast = useToast();
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(SAMPLE_MARKER) === '1';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);

  if (!on) return null;

  const clear = async () => {
    if (!confirm('Clear the sample data and start fresh? This removes everything.')) return;
    setBusy(true);
    try {
      await clearAllData(qc);
      setOn(false);
      toast.show('Sample data cleared');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not clear data', { error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="update-banner" role="status">
      <span className="dot" style={{ background: 'var(--investment)' }} />
      <span className="update-banner__text">
        Exploring with <strong>sample data</strong>
      </span>
      <button className="btn btn--sm btn--ghost" type="button" disabled={busy} onClick={clear}>
        <Icon name="trash" size={13} />
        Start fresh
      </button>
    </div>
  );
}
