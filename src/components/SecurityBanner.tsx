import { ShieldAlert, X } from 'lucide-react';
import { useState } from 'react';

export default function SecurityBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="relative bg-gradient-to-r from-error-600 to-error-700 text-white">
      <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 animate-pulse" />
          <p className="text-xs font-medium leading-snug sm:text-sm">
            <span className="font-bold">SECURITY NOTICE:</span>{' '}
            Renters are strictly advised to make all payments through the Saka Krib website.
            Any off-platform payments (e.g., direct cash or private M-Pesa to movers/landlords)
            will NOT be tracked and are entirely out of Saka Krib's hands or liability.
          </p>
          <button
            onClick={() => setDismissed(true)}
            className="ml-auto shrink-0 rounded p-1 transition-colors hover:bg-white/20"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
