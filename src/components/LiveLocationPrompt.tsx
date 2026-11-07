import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Navigation } from 'lucide-react';

import { describeLocationError, prepareLiveMapLocation, type DevicePosition } from '@/lib/location';

interface LiveLocationPromptProps {
  /** Only prompt while a live map/journey is actually open. */
  active: boolean;
  /** Called once location permission is granted and Location/GPS is switched on. */
  onReady?: (position: DevicePosition) => void;
  message?: string;
}

/**
 * Uses the normal Android "Allow while using this app" permission prompt and reads the
 * current position. It never opens device Settings or launches a separate GPS-enable dialog.
 */
export default function LiveLocationPrompt({ active, onReady, message }: LiveLocationPromptProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const startedRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const position = await prepareLiveMapLocation();
      setReady(true);
      onReadyRef.current?.(position);
    } catch (err) {
      setReady(false);
      setError(describeLocationError(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;
    void enable();
  }, [active, enable]);

  if (!active) return null;
  if (ready && !error) {
    return <p className="mb-4 flex items-center gap-2 rounded-xl border border-success-200 bg-success-50 px-3 py-2 text-xs font-medium text-success-700 dark:border-success-800 dark:bg-success-900/20 dark:text-success-300"><CheckCircle2 className="h-4 w-4" />Location access is on.</p>;
  }
  if (busy && !error) {
    return <p className="mb-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />Requesting location access...</p>;
  }
  if (!error) return null;
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200" role="alert">
      <p>{error}</p>
      {message && <p className="text-xs opacity-80">{message}</p>}
      <button type="button" onClick={() => void enable()} disabled={busy} className="inline-flex w-fit items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}{busy ? 'Getting location...' : 'Try again'}
      </button>
    </div>
  );
}
