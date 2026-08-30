import { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Clock,
  RefreshCw,
  XCircle,
} from 'lucide-react';

import AdminUserDetails from './AdminUserDetails';
import { protectedGet, protectedPatch } from '@/lib/protectedApi';

interface AdminApprovalProfile {
  id: string;
  role: string | null;
  is_agency: boolean | null;
  real_estate_application_status: string | null;
}

type Status = 'pending' | 'approved' | 'rejected';

const normalize = (value: string | null | undefined) =>
  String(value || '').trim().toLowerCase();

export default function AdminUserDetailsRoute({
  userId,
  onBack,
}: {
  userId: string;
  onBack?: () => void;
}) {
  const [profile, setProfile] = useState<AdminApprovalProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const rows = await protectedGet<AdminApprovalProfile[]>(
        `/rest/v1/profiles?select=id,role,is_agency,real_estate_application_status&id=eq.${encodeURIComponent(userId)}&limit=1`
      );
      setProfile(rows?.[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load approval status.');
    }
  };

  useEffect(() => {
    void load();
  }, [userId]);

  const isRealEstate =
    normalize(profile?.role) === 'real_estate' || profile?.is_agency === true;

  const updateStatus = async (status: Status) => {
    if (!profile || saving) return;

    setSaving(true);
    setError(null);

    try {
      await protectedPatch(
        `/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`,
        {
          real_estate_application_status: status,
          verification_status:
            status === 'approved'
              ? 'verified'
              : status === 'rejected'
                ? 'rejected'
                : 'pending_verification',
          kyc_completed: status === 'approved',
          updated_at: new Date().toISOString(),
        }
      );

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update real-estate approval.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {isRealEstate && (
        <div className="mx-auto max-w-7xl px-2 pt-6 sm:px-6 lg:px-8">
          <div className="card overflow-hidden">
            <div className="border-b border-gray-200 bg-gradient-to-r from-accent-50 to-accent-100 px-5 py-4 dark:border-brand-800 dark:from-accent-900/20 dark:to-brand-900/30">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-accent-600" />
                <div>
                  <h2 className="font-bold text-gray-900 dark:text-white">
                    Real Estate Approval
                  </h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Review and manage this real-estate application.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Application Status
                </p>
                <div className="mt-2 flex items-center gap-2">
                  {normalize(profile?.real_estate_application_status) === 'approved' ? (
                    <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                      <CheckCircle2 className="h-3 w-3" /> Approved
                    </span>
                  ) : normalize(profile?.real_estate_application_status) === 'rejected' ? (
                    <span className="badge bg-error-50 text-error-700 dark:bg-error-900/30 dark:text-error-400">
                      <XCircle className="h-3 w-3" /> Rejected
                    </span>
                  ) : (
                    <span className="badge bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
                      <Clock className="h-3 w-3" /> Pending
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void updateStatus('rejected')}
                  className="btn-secondary text-error-600 disabled:opacity-50"
                >
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Reject
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void updateStatus('pending')}
                  className="btn-secondary disabled:opacity-50"
                >
                  <Clock className="h-4 w-4" />
                  Pending
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void updateStatus('approved')}
                  className="btn-primary disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </button>
              </div>
            </div>

            {error && (
              <div className="border-t border-error-100 bg-error-50 px-5 py-3 text-sm text-error-700 dark:border-error-900/30 dark:bg-error-900/20 dark:text-error-400">
                {error}
              </div>
            )}
          </div>
        </div>
      )}

      <AdminUserDetails userId={userId} onBack={onBack} />
    </div>
  );
}
