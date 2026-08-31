import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  Truck,
  Home,
  ShieldCheck,
  Clock,
  XCircle,
  CheckCircle2,
  CreditCard,
  Search,
  Eye,
  Pencil,
  ChevronRight,
  UserCheck,
  UserX,
  RefreshCw,
  Mail,
  Phone,
  CalendarDays,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { protectedGet, protectedPatch } from '@/lib/protectedApi';
import { cn } from '@/lib/utils';

/* ============================================================
 * TYPES
 * ============================================================ */

type UserRole = 'landlord' | 'real_estate' | 'mover' | 'renter' | 'admin';
type VerificationFilter = 'all' | 'pending' | 'approved' | 'rejected';
type ApplicationStatus = 'pending' | 'approved' | 'rejected';

type DashboardSection =
  | 'overview'
  | 'users'
  | 'landlords'
  | 'real_estate'
  | 'movers'
  | 'renters'
  | 'subscribed_landlords'
  | 'landlord_verification'
  | 'real_estate_verification'
  | 'mover_verification'
  | 'admin_users';

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  role: UserRole | string;
  verification_status: string | null;
  landlord_application_status: string | null;
  mover_application_status: string | null;
  real_estate_application_status: string | null;
  national_id: string | null;
  phone: string | null;
  profile_photo_url: string | null;
  id_photo_url: string | null;
  id_document_url: string | null;
  id_document_type: string | null;
  selfie_url: string | null;
  city: string | null;
  county: string | null;
  is_agency: boolean | null;
  free_listings_used: number | null;
  email_verified: boolean | null;
  role_selected_at: string | null;
  kyc_completed: boolean | null;
  admin_review_note: string | null;
  created_at: string;
  updated_at: string;
}

interface MoverApplication {
  id: string;
  applicant_id: string;
  status: string | null;
  review_notes: string | null;
}

interface MoverRecord {
  id: string;
  user_id: string;
  approval_status: string | null;
}

interface SubscriptionPlan {
  id: string;
  name: string | null;
}

interface Subscription {
  id: string;
  landlord_id: string;
  status: string | null;
  current_period_end: string | null;
  plan?: SubscriptionPlan | null;
}

interface UserWithSubscription extends AdminUser {
  subscription?: Subscription | null;
  moverApplication?: MoverApplication | null;
  moverRecord?: MoverRecord | null;
}

/* ============================================================
 * HELPERS
 * ============================================================ */

const normalizeStatus = (value: string | null | undefined) =>
  String(value || '').trim().toLowerCase();

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const getDisplayName = (user: AdminUser) =>
  user.full_name?.trim() ||
  [user.first_name, user.middle_name, user.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() ||
  'Unnamed User';

const getInitials = (user: AdminUser) =>
  getDisplayName(user)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'U';

const getMoverApplicationStatus = (user: UserWithSubscription) =>
  normalizeStatus(
    user.moverApplication?.status ||
      user.moverRecord?.approval_status ||
      user.mover_application_status
  );

const getApplicationStatus = (user: UserWithSubscription) => {
  const role = normalizeStatus(user.role);

  if (role === 'landlord') {
    return normalizeStatus(user.landlord_application_status);
  }

  if (role === 'real_estate') {
    return normalizeStatus(user.real_estate_application_status);
  }

  if (role === 'mover') {
    return getMoverApplicationStatus(user);
  }

  return normalizeStatus(user.verification_status);
};

const isApproved = (user: UserWithSubscription) =>
  ['approved', 'verified'].includes(getApplicationStatus(user));

const isRejected = (user: UserWithSubscription) =>
  getApplicationStatus(user) === 'rejected';

const isPending = (user: UserWithSubscription) =>
  ['pending', 'pending_review', 'pending_verification'].includes(
    getApplicationStatus(user)
  );

/* ============================================================
 * COMPONENT
 * ============================================================ */

export default function AdminDashboard() {
  const { profile } = useAuth();
  const { navigate } = useNav();

  const isAdmin = profile?.is_admin === true || profile?.role === 'admin';

  const [users, setUsers] = useState<UserWithSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<DashboardSection>('overview');
  const [search, setSearch] = useState('');
  const [verificationFilter, setVerificationFilter] =
    useState<VerificationFilter>('all');
  const [editingUser, setEditingUser] =
    useState<UserWithSubscription | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    city: '',
    county: '',
    role: '',
    verification_status: '',
    landlord_application_status: '',
    mover_application_status: '',
    real_estate_application_status: '',
  });

  const loadDashboard = async () => {
    setError(null);

    try {
      const [profileRows, subscriptionRows, moverRows, applicationRows] =
        await Promise.all([
          protectedGet<AdminUser[]>(
            `/rest/v1/profiles?select=id,email,full_name,first_name,middle_name,last_name,role,verification_status,landlord_application_status,mover_application_status,real_estate_application_status,national_id,phone,profile_photo_url,id_photo_url,id_document_url,id_document_type,selfie_url,city,county,is_agency,free_listings_used,email_verified,role_selected_at,kyc_completed,admin_review_note,created_at,updated_at&order=created_at.desc`
          ),
          protectedGet<Subscription[]>(
            `/rest/v1/landlord_subscriptions?select=id,landlord_id,status,current_period_end,plan:subscription_plans(id,name)&order=created_at.desc`
          ),
          protectedGet<MoverRecord[]>(
            `/rest/v1/movers?select=id,user_id,approval_status&order=created_at.desc`
          ),
          protectedGet<MoverApplication[]>(
            `/rest/v1/mover_applications?select=id,applicant_id,status,review_notes&order=created_at.desc`
          ),
        ]);

      const subscriptions = subscriptionRows || [];
      const movers = moverRows || [];
      const applications = applicationRows || [];

      setUsers(
        (profileRows || []).map((user) => {
          const userMover =
            movers.find((mover) => mover.user_id === user.id) || null;

          const userApplication =
            applications.find(
              (application) => application.applicant_id === user.id
            ) || null;

          const userSubscriptions = subscriptions.filter(
            (subscription) => subscription.landlord_id === user.id
          );

          const activeSubscription = userSubscriptions.find(
            (subscription) =>
              normalizeStatus(subscription.status) === 'active'
          );

          return {
            ...user,
            subscription:
              activeSubscription || userSubscriptions[0] || null,
            moverApplication: userApplication,
            moverRecord: userMover,
          };
        })
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load admin dashboard.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    void loadDashboard();
  }, [isAdmin]);

  /* ============================================================
   * GROUPS
   * ============================================================ */

  const landlords = useMemo(
    () =>
      users.filter(
        (user) => normalizeStatus(user.role) === 'landlord'
      ),
    [users]
  );

  const movers = useMemo(
    () =>
      users.filter(
        (user) => normalizeStatus(user.role) === 'mover'
      ),
    [users]
  );

  const renters = useMemo(
    () =>
      users.filter(
        (user) => normalizeStatus(user.role) === 'renter'
      ),
    [users]
  );

  const realEstate = useMemo(
    () =>
      users.filter(
        (user) =>
          normalizeStatus(user.role) === 'real_estate' ||
          user.is_agency === true
      ),
    [users]
  );

  const subscribedLandlords = useMemo(
    () =>
      landlords.filter(
        (user) =>
          normalizeStatus(user.subscription?.status) === 'active'
      ),
    [landlords]
  );

  const pendingLandlords = useMemo(
    () => landlords.filter(isPending),
    [landlords]
  );

  const approvedLandlords = useMemo(
    () => landlords.filter(isApproved),
    [landlords]
  );

  const rejectedLandlords = useMemo(
    () => landlords.filter(isRejected),
    [landlords]
  );

  const pendingMovers = useMemo(
    () => movers.filter(isPending),
    [movers]
  );

  const approvedMovers = useMemo(
    () => movers.filter(isApproved),
    [movers]
  );

  const rejectedMovers = useMemo(
    () => movers.filter(isRejected),
    [movers]
  );

  const pendingRealEstate = useMemo(
    () =>
      realEstate.filter(
        (user) =>
          normalizeStatus(user.real_estate_application_status) ===
            'pending'
      ),
    [realEstate]
  );

  const approvedRealEstate = useMemo(
    () =>
      realEstate.filter(
        (user) =>
          normalizeStatus(user.real_estate_application_status) ===
            'approved'
      ),
    [realEstate]
  );

  const rejectedRealEstate = useMemo(
    () =>
      realEstate.filter(
        (user) =>
          normalizeStatus(user.real_estate_application_status) ===
            'rejected'
      ),
    [realEstate]
  );

  /* ============================================================
   * FILTERED LIST
   * ============================================================ */

  const displayedUsers = useMemo(() => {
    let result: UserWithSubscription[];

    switch (section) {
      case 'users':
        result = users;
        break;
      case 'landlords':
        result = landlords;
        break;
      case 'real_estate':
        result = realEstate;
        break;
      case 'movers':
        result = movers;
        break;
      case 'renters':
        result = renters;
        break;
      case 'subscribed_landlords':
        result = subscribedLandlords;
        break;
      case 'landlord_verification':
        result = landlords;
        break;
      case 'real_estate_verification':
        result = realEstate;
        break;
      case 'mover_verification':
        result = movers;
        break;
      case 'admin_users':
        result = users.filter(
          (user) => normalizeStatus(user.role) === 'admin'
        );
        break;
      default:
        result = [];
    }

    if (
      section === 'landlord_verification' ||
      section === 'real_estate_verification' ||
      section === 'mover_verification'
    ) {
      if (verificationFilter === 'pending') {
        result = result.filter(isPending);
      }

      if (verificationFilter === 'approved') {
        result = result.filter(isApproved);
      }

      if (verificationFilter === 'rejected') {
        result = result.filter(isRejected);
      }
    }

    const query = search.trim().toLowerCase();

    if (!query) return result;

    return result.filter((user) =>
      [
        getDisplayName(user),
        user.email,
        user.phone,
        user.city,
        user.county,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        )
    );
  }, [
    section,
    verificationFilter,
    search,
    users,
    landlords,
    realEstate,
    movers,
    renters,
    subscribedLandlords,
  ]);

  /* ============================================================
   * APPROVAL
   * ============================================================ */

  const updateApplicationStatus = async (
    user: UserWithSubscription,
    status: ApplicationStatus
  ) => {
    if (saving) return;

    setSaving(true);
    setError(null);

    try {
      const now = new Date().toISOString();
      const role = normalizeStatus(user.role);

      if (role === 'mover') {
        if (user.moverApplication?.id) {
          await protectedPatch(
            `/rest/v1/mover_applications?id=eq.${encodeURIComponent(user.moverApplication.id)}`,
            {
              status,
              reviewed_at: now,
              review_notes: user.moverApplication.review_notes || null,
            }
          );
        }

        if (user.moverRecord?.id) {
          await protectedPatch(
            `/rest/v1/movers?id=eq.${encodeURIComponent(user.moverRecord.id)}`,
            {
              approval_status:
                status === 'pending' ? 'pending_review' : status,
              updated_at: now,
            }
          );
        }

        await protectedPatch(
          `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`,
          {
            mover_application_status: status,
            verification_status:
              status === 'approved'
                ? 'verified'
                : status === 'rejected'
                  ? 'rejected'
                  : 'pending_verification',
            kyc_completed: status === 'approved',
            updated_at: now,
          }
        );
      } else if (role === 'landlord') {
        await protectedPatch(
          `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`,
          {
            landlord_application_status: status,
            verification_status:
              status === 'approved'
                ? 'verified'
                : status === 'rejected'
                  ? 'rejected'
                  : 'pending_verification',
            kyc_completed: status === 'approved',
            updated_at: now,
          }
        );
      } else if (role === 'real_estate') {
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
            updated_at: now,
          }
        );
      } else {
        throw new Error(
          'Application status can only be updated for landlords, real-estate users, and movers.'
        );
      }

      await loadDashboard();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update application status.'
      );
    } finally {
      setSaving(false);
    }
  };

  /* ============================================================
   * EDIT USER
   * ============================================================ */

  const openEdit = (user: UserWithSubscription) => {
    setEditingUser(user);
    setEditForm({
      full_name: user.full_name || '',
      email: user.email || '',
      phone: user.phone || '',
      city: user.city || '',
      county: user.county || '',
      role: user.role || '',
      verification_status: user.verification_status || '',
      landlord_application_status:
        user.landlord_application_status || '',
      mover_application_status:
        user.mover_application_status || '',
      real_estate_application_status:
        user.real_estate_application_status || '',
    });
  };

  const saveUser = async () => {
    if (!editingUser || saving) return;

    setSaving(true);
    setError(null);

    try {
      const role =
        editForm.role.trim() || editingUser.role;

      await protectedPatch(
        `/rest/v1/profiles?id=eq.${encodeURIComponent(editingUser.id)}`,
        {
          full_name: editForm.full_name.trim() || null,
          email: editForm.email.trim(),
          phone: editForm.phone.trim() || null,
          city: editForm.city.trim() || null,
          county: editForm.county.trim() || null,
          role,
          verification_status:
            editForm.verification_status || null,
          landlord_application_status:
            role === 'landlord'
              ? editForm.landlord_application_status || null
              : null,
          mover_application_status:
            role === 'mover'
              ? editForm.mover_application_status || null
              : null,
          real_estate_application_status:
            role === 'real_estate'
              ? editForm.real_estate_application_status || null
              : null,
          updated_at: new Date().toISOString(),
        }
      );

      setEditingUser(null);
      await loadDashboard();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update user.'
      );
    } finally {
      setSaving(false);
    }
  };

  /* ============================================================
   * BADGE
   * ============================================================ */

  const verificationBadge = (user: UserWithSubscription) => {
    if (isApproved(user)) {
      return (
        <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
          <CheckCircle2 className="h-3 w-3" />
          Approved
        </span>
      );
    }

    if (isRejected(user)) {
      return (
        <span className="badge bg-error-50 text-error-700 dark:bg-error-900/30 dark:text-error-400">
          <XCircle className="h-3 w-3" />
          Rejected
        </span>
      );
    }

    if (isPending(user)) {
      return (
        <span className="badge bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      );
    }

    return (
      <span className="badge bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-400">
        Unverified
      </span>
    );
  };

  if (!profile) {
    return (
      <div className="mx-auto max-w-5xl px-2 py-20 text-center text-gray-500">
        Please sign in to continue.
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-5xl px-2 py-20 text-center">
        <div className="card p-8">
          <ShieldCheck className="mx-auto h-12 w-12 text-error-500" />
          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
            Admin Access Required
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            You do not have permission to access the administration dashboard.
          </p>
        </div>
      </div>
    );
  }

  const stats = [
    ['Total Users', users.length, Users, 'users' as DashboardSection],
    ['Landlords', landlords.length, Building2, 'landlords' as DashboardSection],
    ['Real Estate', realEstate.length, Building2, 'real_estate' as DashboardSection],
    ['Movers', movers.length, Truck, 'movers' as DashboardSection],
    ['Renters', renters.length, Home, 'renters' as DashboardSection],
    ['Subscribed Landlords', subscribedLandlords.length, CreditCard, 'subscribed_landlords' as DashboardSection],
  ] as const;

  return (
    <div className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <LayoutDashboard className="h-6 w-6 text-brand-600" />
            Admin Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage users, landlords, real-estate users, movers, renters, verification, and subscriptions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            void loadDashboard();
          }}
          disabled={refreshing}
          className="btn-secondary"
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="card flex min-h-[300px] items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : (
        <>
          {section === 'overview' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {stats.map(([label, value, Icon, target]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setSection(target)}
                    className="card group p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
                        <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
                      </div>
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-800 dark:text-brand-300">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center text-xs font-semibold text-brand-600 dark:text-brand-400">
                      Manage
                      <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-3">
                <VerificationCard
                  title="Landlord Verification"
                  description="Review landlord applications."
                  icon={Building2}
                  pending={pendingLandlords.length}
                  approved={approvedLandlords.length}
                  rejected={rejectedLandlords.length}
                  onOpen={() => {
                    setSection('landlord_verification');
                    setVerificationFilter('pending');
                  }}
                />

                <VerificationCard
                  title="Real Estate Verification"
                  description="Review real-estate applications."
                  icon={Building2}
                  pending={pendingRealEstate.length}
                  approved={approvedRealEstate.length}
                  rejected={rejectedRealEstate.length}
                  onOpen={() => {
                    setSection('real_estate_verification');
                    setVerificationFilter('pending');
                  }}
                />

                <VerificationCard
                  title="Mover Verification"
                  description="Review mover applications."
                  icon={Truck}
                  pending={pendingMovers.length}
                  approved={approvedMovers.length}
                  rejected={rejectedMovers.length}
                  onOpen={() => {
                    setSection('mover_verification');
                    setVerificationFilter('pending');
                  }}
                />
              </div>
            </>
          ) : (
            <div className="card overflow-hidden">
              <div className="border-b border-gray-200 bg-brand-50 px-5 py-4 dark:border-brand-800 dark:bg-brand-900/30">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <button
                      type="button"
                      onClick={() => setSection('overview')}
                      className="mb-2 text-xs font-semibold text-brand-600 dark:text-brand-400"
                    >
                      ← Dashboard
                    </button>
                    <h2 className="text-xl font-bold capitalize text-gray-900 dark:text-white">
                      {section.replace(/_/g, ' ')}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {displayedUsers.length} record{displayedUsers.length === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search users..."
                        className="input-field w-full pl-9 sm:w-64"
                      />
                    </div>

                    {(section === 'landlord_verification' ||
                      section === 'real_estate_verification' ||
                      section === 'mover_verification') && (
                      <select
                        value={verificationFilter}
                        onChange={(event) =>
                          setVerificationFilter(
                            event.target.value as VerificationFilter
                          )
                        }
                        className="input-field sm:w-40"
                      >
                        <option value="all">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    )}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500 dark:bg-brand-900/40 dark:text-gray-400">
                      <th className="px-5 py-3">User</th>
                      <th className="px-5 py-3">Role</th>
                      <th className="px-5 py-3">Contact</th>
                      <th className="px-5 py-3">Verification</th>
                      <th className="px-5 py-3">Created</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100 dark:divide-brand-800">
                    {displayedUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-brand-900/30">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-brand-100 font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                              {user.profile_photo_url ? (
                                <img
                                  src={user.profile_photo_url}
                                  alt={getDisplayName(user)}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                getInitials(user)
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-white">{getDisplayName(user)}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span className="badge bg-brand-50 capitalize text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                            {String(user.role).replace(/_/g, ' ')}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400">
                          <div className="space-y-1">
                            {user.phone && (
                              <p className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {user.phone}
                              </p>
                            )}
                            <p className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {user.email}
                            </p>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          {verificationBadge(user)}
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(user.created_at)}
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => navigate('admin-user-details', user.id)}
                              className="btn-secondary px-3 py-2 text-xs"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Manage
                            </button>

                            <button
                              type="button"
                              onClick={() => openEdit(user)}
                              className="btn-primary px-3 py-2 text-xs"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {displayedUsers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-16 text-center text-gray-500 dark:text-gray-400">
                          No users found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {(section === 'landlord_verification' ||
                section === 'real_estate_verification' ||
                section === 'mover_verification') &&
                displayedUsers.length > 0 && (
                <div className="border-t border-gray-200 p-4 dark:border-brand-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Select <strong>Manage</strong> to open the full user review page. Approval changes are synchronized with the application record and profile projections.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-brand-950">
            <div className="flex items-center justify-between border-b border-gray-200 p-5 dark:border-brand-800">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Edit User</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{getDisplayName(editingUser)}</p>
              </div>
              <button type="button" onClick={() => setEditingUser(null)} className="text-gray-500 hover:text-gray-900 dark:hover:text-white">
                ×
              </button>
            </div>

            <div className="space-y-4 p-5">
              <Input label="Full Name" value={editForm.full_name} onChange={(value) => setEditForm((form) => ({ ...form, full_name: value }))} />
              <Input label="Email" value={editForm.email} onChange={(value) => setEditForm((form) => ({ ...form, email: value }))} />
              <Input label="Phone" value={editForm.phone} onChange={(value) => setEditForm((form) => ({ ...form, phone: value }))} />
              <Input label="City" value={editForm.city} onChange={(value) => setEditForm((form) => ({ ...form, city: value }))} />
              <Input label="County" value={editForm.county} onChange={(value) => setEditForm((form) => ({ ...form, county: value }))} />

              <SelectField label="Role" value={editForm.role} onChange={(value) => setEditForm((form) => ({ ...form, role: value }))} options={[
                ['renter', 'Renter'],
                ['landlord', 'Landlord'],
                ['real_estate', 'Real Estate'],
                ['mover', 'Mover'],
                ['admin', 'Admin'],
              ]} />

              <SelectField label="Verification Status" value={editForm.verification_status} onChange={(value) => setEditForm((form) => ({ ...form, verification_status: value }))} options={[
                ['unverified', 'Unverified'],
                ['pending_verification', 'Pending Verification'],
                ['verified', 'Verified'],
                ['rejected', 'Rejected'],
              ]} />
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 p-5 dark:border-brand-800">
              <button type="button" onClick={() => setEditingUser(null)} className="btn-secondary">Cancel</button>
              <button type="button" disabled={saving} onClick={() => void saveUser()} className="btn-primary">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * PRESENTATION COMPONENTS
 * ============================================================ */

function VerificationCard({
  title,
  description,
  icon: Icon,
  pending,
  approved,
  rejected,
  onOpen,
}: {
  title: string;
  description: string;
  icon: typeof Truck;
  pending: number;
  approved: number;
  rejected: number;
  onOpen: () => void;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-gray-200 bg-gradient-to-r from-warning-50 to-warning-100 px-5 py-4 dark:border-brand-800 dark:from-warning-900/20 dark:to-brand-900/30">
        <h3 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
          <Icon className="h-5 w-5 text-warning-600" />
          {title}
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>

      <div className="grid grid-cols-3 divide-x divide-gray-200 dark:divide-brand-800">
        <Summary label="Pending" value={pending} icon={Clock} />
        <Summary label="Approved" value={approved} icon={CheckCircle2} />
        <Summary label="Rejected" value={rejected} icon={XCircle} />
      </div>

      <div className="border-t border-gray-200 p-4 dark:border-brand-800">
        <button type="button" onClick={onOpen} className="btn-primary w-full">
          <UserCheck className="h-4 w-4" />
          Review Pending
        </button>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
}) {
  return (
    <div className="p-4 text-center">
      <Icon className="mx-auto h-5 w-5 text-brand-600" />
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input-field mt-1"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input-field mt-1"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
