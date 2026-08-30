import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';

import { protectedGet, protectedPatch } from '@/lib/protectedApi';

interface RealEstateApplicant {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  city: string | null;
  county: string | null;
  is_agency: boolean | null;
  real_estate_application_status: string | null;
  verification_status: string | null;
  kyc_completed: boolean | null;
  admin_review_note: string | null;
  created_at: string;
}

type Filter = 'all' | 'pending' | 'approved' | 'rejected';

type Status = 'pending' | 'approved' | 'rejected';

const normalize = (value: string | null | undefined) =>
  String(value || '').trim().toLowerCase();

const nameOf = (user: RealEstateApplicant) =>
  user.full_name?.trim() ||
  [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
  'Unnamed User';

const isStatus = (user: RealEstateApplicant, status: Status) =>
  normalize(user.real_estate_application_status) === status;

export default function AdminRealEstateApprovalPanel() {
  const [users, setUsers] = useState<RealEstateApplicant[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const rows = await protectedGet<RealEstateApplicant[]>(
        `/rest/v1/profiles?select=id,email,full_name,first_name,last_name,phone,city,county,is_agency,real_estate_application_status,verification_status,kyc_completed,admin_review_note,created_at&or=(role.eq.real_estate,is_agency.eq.true)&order=created_at.desc`
      );
      setUsers(rows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load real-estate applications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(
    () => ({
      pending: users.filter((user) => isStatus(user, 'pending')).length,
      approved: users.filter((user) => isStatus(user, 'approved')).length,
      rejected: users.filter((user) => isStatus(user, 'rejected')).length,
    }),
    [users]
  );

  const displayed = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesFilter =
        filter === 'all' || isStatus(user, filter as Status);
      const matchesSearch =
        !query ||
        [nameOf(user), user.email, user.phone, user.city, user.county]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      return matchesFilter && matchesSearch;
    });
  }, [users, filter, search]);

  const updateStatus = async (user: RealEstateApplicant, status: Status) => {
    if (savingId) return;
    setSavingId(user.id);
    setError(null);

    try {
      await protectedPatch(
        `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`,
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
      setError(err instanceof Error ? err.message : 'Failed to update real-estate application.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="card mb-6 overflow-hidden">
      <div className="border-b border-gray-200 bg-gradient-to-r from-accent-50 to-accent-100 px-5 py-4 dark:border-brand-800 dark:from-accent-900/20 dark:to-brand-900/30">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
              <Building2 className="h-5 w-5 text-accent-600" />
              Real Estate Approval
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Approve, reject, or return real-estate applications to pending review.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || !!savingId}
            className="btn-secondary text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-gray-200 dark:divide-brand-800">
        <Summary label="Pending" value={counts.pending} icon={Clock} />
        <Summary label="Approved" value={counts.approved} icon={CheckCircle2} />
        <Summary label="Rejected" value={counts.rejected} icon={XCircle} />
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-200 p-4 sm:flex-row dark:border-brand-800">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search real-estate applicants..."
            className="input-field w-full pl-9"
          />
        </div>

        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
          className="input-field sm:w-44"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {error && (
        <div className="mx-4 mb-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-10 text-center">
          <RefreshCw className="mx-auto h-7 w-7 animate-spin text-brand-600" />
          <p className="mt-3 text-sm text-gray-500">Loading real-estate applications...</p>
        </div>
      ) : displayed.length === 0 ? (
        <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No real-estate applications match the current filter.
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-brand-800">
          {displayed.map((user) => {
            const status = normalize(user.real_estate_application_status);
            const saving = savingId === user.id;

            return (
              <div key={user.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white">{nameOf(user)}</h3>
                    <span className="badge bg-brand-50 capitalize text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                      {user.is_agency ? 'Agency' : 'Real Estate'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {[user.city, user.county].filter(Boolean).join(', ') || 'Location not provided'}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Submitted {new Date(user.created_at).toLocaleDateString('en-KE')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={status} />

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void updateStatus(user, 'rejected')}
                    className="btn-secondary text-error-600 disabled:opacity-50"
                  >
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Reject
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void updateStatus(user, 'pending')}
                    className="btn-secondary disabled:opacity-50"
                  >
                    <Clock className="h-4 w-4" />
                    Pending
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void updateStatus(user, 'approved')}
                    className="btn-primary disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Summary({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Clock }) {
  return (
    <div className="p-4 text-center">
      <Icon className="mx-auto h-5 w-5 text-brand-600" />
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved') {
    return <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400"><CheckCircle2 className="h-3 w-3" />Approved</span>;
  }
  if (status === 'rejected') {
    return <span className="badge bg-error-50 text-error-700 dark:bg-error-900/30 dark:text-error-400"><XCircle className="h-3 w-3" />Rejected</span>;
  }
  return <span className="badge bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400"><Clock className="h-3 w-3" />Pending</span>;
}
