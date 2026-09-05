import { useEffect, useState } from 'react';
import { AlertCircle, Building2, CheckCircle2, Clock3, Home, Loader2, ShieldCheck } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { protectedGet, protectedPost } from '@/lib/djangoApi';

type InvitationPreview = {
  invitation_status: string;
  renter_name: string;
  renter_email?: string | null;
  property_title: string;
  property_city?: string | null;
  unit_number: string;
  unit_type?: string | null;
  rent_amount: string | number;
};

const formatKES = (value: string | number) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'KES 0';
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function ClaimRentalPage({ token }: { token: string }) {
  const { profile, loading: authLoading } = useAuth();
  const { navigate, setAuthModalOpen, setAuthMode } = useNav();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);

    protectedGet<InvitationPreview>(`/api/core/renter-invitations/${encodeURIComponent(token)}/preview/`)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPreviewError(err instanceof Error ? err.message : 'Unable to load this invitation.');
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleClaim = async () => {
    setClaiming(true);
    setClaimError(null);
    try {
      await protectedPost(`/api/core/renter-invitations/${encodeURIComponent(token)}/claim/`, {});
      setClaimed(true);
    } catch (err: unknown) {
      setClaimError(err instanceof Error ? err.message : 'Unable to claim this rental.');
    } finally {
      setClaiming(false);
    }
  };

  if (previewLoading || authLoading) {
    return <div className="flex min-h-[400px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }

  if (previewError || !preview) {
    return (
      <div className="mx-auto max-w-md px-2 py-20 text-center">
        <div className="card p-8">
          <AlertCircle className="mx-auto h-10 w-10 text-error-600" />
          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Invitation not found</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{previewError || 'This invitation link is invalid.'}</p>
        </div>
      </div>
    );
  }

  if (preview.invitation_status === 'EXPIRED') {
    return (
      <div className="mx-auto max-w-md px-2 py-20 text-center">
        <div className="card p-8">
          <Clock3 className="mx-auto h-10 w-10 text-warning-600" />
          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">This invitation has expired</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Ask your landlord to send a new invitation.</p>
        </div>
      </div>
    );
  }

  if (preview.invitation_status === 'ACTIVE' && !claimed) {
    return (
      <div className="mx-auto max-w-md px-2 py-20 text-center">
        <div className="card p-8">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success-600" />
          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Already claimed</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">This rental has already been connected to an account.</p>
          {profile && <button type="button" onClick={() => navigate('dashboard')} className="btn-primary mt-6">Go to My Rental</button>}
        </div>
      </div>
    );
  }

  if (claimed) {
    return (
      <div className="mx-auto max-w-md px-2 py-20 text-center">
        <div className="card p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-50 dark:bg-success-900/30"><CheckCircle2 className="h-7 w-7 text-success-600" /></div>
          <h2 className="mt-5 text-2xl font-bold text-gray-900 dark:text-white">Rental claimed</h2>
          <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">{preview.property_title} · Unit {preview.unit_number} is now connected to your account.</p>
          <button type="button" onClick={() => navigate('dashboard')} className="btn-primary mt-6">Go to My Rental</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-2 py-16">
      <div className="card p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/30"><Building2 className="h-7 w-7 text-brand-600" /></div>
        <h2 className="mt-5 text-2xl font-bold text-gray-900 dark:text-white">You've been invited to SakaCrib</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Hi {preview.renter_name}, your landlord has invited you to connect your rental.</p>

        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-5 text-left dark:border-brand-700 dark:bg-brand-800/30">
          <div className="flex items-center gap-3">
            <Home className="h-5 w-5 text-brand-600" />
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">{preview.property_title}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{preview.property_city || '—'} · Unit {preview.unit_number} ({preview.unit_type || '—'})</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3 dark:border-brand-700">
            <span className="text-sm text-gray-500 dark:text-gray-400">Monthly rent</span>
            <span className="font-semibold text-gray-900 dark:text-white">{formatKES(preview.rent_amount)}</span>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-4 text-left dark:border-brand-700 dark:bg-brand-900/20">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            <div className="text-sm leading-6 text-brand-700 dark:text-brand-300">
              <p className="font-semibold text-brand-900 dark:text-brand-200">Connecting gives you access to:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>Digital invoices and payment history</li>
                <li>Transparent record of confirmed and pending payments</li>
                <li>All your rental information in one place</li>
              </ul>
            </div>
          </div>
        </div>

        {claimError && <div className="mt-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-900 dark:bg-error-900/20 dark:text-error-400">{claimError}</div>}

        {!profile ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">Sign in or create an account to claim this rental.</p>
            <button type="button" onClick={() => { setAuthMode('signin'); setAuthModalOpen(true); }} className="btn-primary w-full">Sign In</button>
            <button type="button" onClick={() => { setAuthMode('signup'); setAuthModalOpen(true); }} className="btn-secondary w-full">Create Account</button>
          </div>
        ) : (
          <button type="button" onClick={handleClaim} disabled={claiming} className="btn-primary mt-6 w-full inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {claiming && <Loader2 className="h-4 w-4 animate-spin" />}
            Claim This Rental
          </button>
        )}
      </div>
    </div>
  );
}
