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
  X,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import AdminUserDetails from '@/pages/AdminUserDetails';


type UserRole = 'landlord' | 'real_estate' | 'mover' | 'renter' | 'admin';



type VerificationFilter =
  | 'all'
  | 'pending'
  | 'approved'
  | 'rejected';

type DashboardSection =
  | 'overview'
  | 'users'
  | 'landlords'
  | 'real_estate'
  | 'movers'
  | 'renters'
  | 'subscribed_landlords'
  | 'landlord_verification'
  | 'mover_verification'
  | 'admin_users';

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  middle_name: string | null;
  role: UserRole | string;
  verification_status: string | null;
  national_id: string | null;
  phone: string | null;
  profile_photo_url: string | null;
  id_photo_url: string | null;
  id_document_url: string | null;
  selfie_url: string | null;
  city: string | null;
  county: string | null;
  is_agency: boolean | null;
  free_listings_used: number | null;
  created_at: string;
  updated_at: string;
  landlord_application_status: string | null;
  mover_application_status: string | null;
  email_verified: boolean | null;
  role_selected_at: string | null;
  kyc_completed: boolean | null;
}
interface Subscription {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UserWithSubscription extends AdminUser {
  subscription?: Subscription | null;
}

const normalizeStatus = (value: string | null | undefined) =>
  (value || '').toLowerCase();

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const getDisplayName = (user: AdminUser) => {
  if (user.full_name?.trim()) return user.full_name;

  return [user.first_name, user.middle_name, user.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Unnamed User';
};

const getInitials = (user: AdminUser) => {
  const name = getDisplayName(user);

  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
};

const getVerificationStatus = (user: AdminUser) => {
  if (user.role === 'landlord') {
    return normalizeStatus(user.landlord_application_status);
  }

  if (user.role === 'mover') {
    return normalizeStatus(user.mover_application_status);
  }

  return normalizeStatus(user.verification_status);
};

const isApproved = (user: AdminUser) => {
  const status = getVerificationStatus(user);

  return (
    status === 'approved' ||
    status === 'verified' ||
    user.verification_status === 'verified'
  );
};

const isPending = (user: AdminUser) => {
  const status = getVerificationStatus(user);

  return (
    status === 'pending' ||
    status === 'pending_verification' ||
    status === 'pending_review'
  );
};

const isRejected = (user: AdminUser) => {
  const status = getVerificationStatus(user);

  return status === 'rejected';
};

export default function AdminDashboard() {
  const { profile } = useAuth();

  const [users, setUsers] = useState<UserWithSubscription[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  // Add these with your other useState declarations 
const [showKycModal, setShowKycModal] = useState(false); 
const [showVerificationModal, setShowVerificationModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [section, setSection] =
    useState<DashboardSection>('overview');

  const [search, setSearch] = useState('');
  const [verificationFilter, setVerificationFilter] =
    useState<VerificationFilter>('all');

  const [selectedUser, setSelectedUser] =
    useState<UserWithSubscription | null>(null);

  const [editingUser, setEditingUser] =
    useState<UserWithSubscription | null>(null);

  const [saving, setSaving] = useState(false);
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
  });

  const isAdmin =
    profile?.is_admin === true ||
    profile?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;

    loadDashboard();
  }, [isAdmin]);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);

    try {
      const [
        { data: profileData, error: profilesError },
        { data: subscriptionData, error: subscriptionsError },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select(`
            id,
            email,
            full_name,
            first_name,
            last_name,
            middle_name,
            role,
            verification_status,
            national_id,
            phone,
            profile_photo_url,
            id_photo_url,
            selfie_url,
            city,
            county,
            is_agency,
            free_listings_used,
            created_at,
            updated_at,
            landlord_application_status,
            mover_application_status,
            email_verified,
            role_selected_at,
            kyc_completed
          `)
          .order('created_at', { ascending: false }),

        supabase
          .from('subscriptions')
          .select(`
            id,
            user_id,
            plan,
            status,
            starts_at,
            expires_at,
            created_at,
            updated_at
          `)
          .order('created_at', { ascending: false }),
      ]);

      if (profilesError) throw profilesError;
      if (subscriptionsError) throw subscriptionsError;

      setUsers((profileData || []) as UserWithSubscription[]);
      setSubscriptions(subscriptionData || []);
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


//   selected user details


  const refreshDashboard = async () => {
    setRefreshing(true);
    await loadDashboard();
  };

  const usersWithSubscriptions = useMemo(() => {
    return users.map((user) => ({
      ...user,
      subscription:
        subscriptions.find(
          (subscription) =>
            subscription.user_id === user.id &&
            normalizeStatus(subscription.status) === 'active'
        ) ||
        subscriptions.find(
          (subscription) =>
            subscription.user_id === user.id
        ) ||
        null,
    }));
  }, [users, subscriptions]);

  const landlords = useMemo(
    () =>
      usersWithSubscriptions.filter(
        (user) => user.role === 'landlord'
      ),
    [usersWithSubscriptions]
  );

  const realEstateUsers = useMemo(
    () =>
      usersWithSubscriptions.filter(
        (user) =>
          user.role === 'real_estate' ||
          user.is_agency === true
      ),
    [usersWithSubscriptions]
  );

  const movers = useMemo(
    () =>
      usersWithSubscriptions.filter(
        (user) => user.role === 'mover'
      ),
    [usersWithSubscriptions]
  );

  const renters = useMemo(
    () =>
      usersWithSubscriptions.filter(
        (user) => user.role === 'renter'
      ),
    [usersWithSubscriptions]
  );

  const subscribedLandlords = useMemo(
    () =>
      landlords.filter(
        (user) =>
          user.subscription &&
          normalizeStatus(user.subscription.status) === 'active'
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

  const activeUsers = useMemo(
    () =>
      users.filter(
        (user) =>
          normalizeStatus(user.verification_status) ===
          'verified'
      ),
    [users]
  );

  const getSectionUsers = () => {
    let result: UserWithSubscription[] = [];

    switch (section) {
      case 'users':
        result = usersWithSubscriptions;
        break;

      case 'landlords':
        result = landlords;
        break;

      case 'real_estate':
        result = realEstateUsers;
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

      case 'mover_verification':
        result = movers;
        break;

      default:
        result = [];
    }

    if (
      section === 'landlord_verification' ||
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

    return result.filter((user) => {
      const name = getDisplayName(user).toLowerCase();

      return (
        name.includes(query) ||
        user.email?.toLowerCase().includes(query) ||
        user.phone?.toLowerCase().includes(query) ||
        user.city?.toLowerCase().includes(query) ||
        user.county?.toLowerCase().includes(query)
      );
    });
  };

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
    });
  };

  const saveUser = async () => {
    if (!editingUser) return;

    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: editForm.full_name.trim() || null,
          email: editForm.email.trim(),
          phone: editForm.phone.trim() || null,
          city: editForm.city.trim() || null,
          county: editForm.county.trim() || null,
          role: editForm.role,
          verification_status:
            editForm.verification_status || null,
          landlord_application_status:
            editForm.landlord_application_status || null,
          mover_application_status:
            editForm.mover_application_status || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingUser.id);

      if (updateError) throw updateError;

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

  const updateApplicationStatus = async (
    user: UserWithSubscription,
    status: 'pending' | 'approved' | 'rejected'
  ) => {
    setError(null);

    try {
      const update: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (user.role === 'landlord') {
        update.landlord_application_status = status;

        if (status === 'approved') {
          update.verification_status = 'verified';
          update.kyc_completed = true;
        }

        if (status === 'rejected') {
          update.verification_status = 'rejected';
        }
      }

      if (user.role === 'mover') {
        update.mover_application_status = status;

        if (status === 'approved') {
          update.verification_status = 'verified';
          update.kyc_completed = true;
        }

        if (status === 'rejected') {
          update.verification_status = 'rejected';
        }
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', user.id);

      if (updateError) throw updateError;

      await loadDashboard();

      if (selectedUser?.id === user.id) {
        setSelectedUser(null);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update verification status.'
      );
    }
  };

  const verificationBadge = (user: AdminUser) => {
    if (isApproved(user)) {
      return (
        <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
          <CheckCircle2 className="h-3 w-3" />
          Approved
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

    if (isRejected(user)) {
      return (
        <span className="badge bg-error-50 text-error-700 dark:bg-error-900/30 dark:text-error-400">
          <XCircle className="h-3 w-3" />
          Rejected
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
      <div className="mx-auto max-w-5xl px-4 py-20 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Please sign in to continue.
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-20 text-center">
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

  const displayedUsers = getSectionUsers();

  const statCards = [
    {
      label: 'Total Users',
      value: users.length,
      icon: Users,
      section: 'users' as DashboardSection,
      color: 'brand',
    },
    {
      label: 'Landlords',
      value: landlords.length,
      icon: Building2,
      section: 'landlords' as DashboardSection,
      color: 'success',
    },
    {
      label: 'Real Estate',
      value: realEstateUsers.length,
      icon: Building2,
      section: 'real_estate' as DashboardSection,
      color: 'accent',
    },
    {
      label: 'Movers',
      value: movers.length,
      icon: Truck,
      section: 'movers' as DashboardSection,
      color: 'warning',
    },
    {
      label: 'Renters',
      value: renters.length,
      icon: Home,
      section: 'renters' as DashboardSection,
      color: 'brand',
    },
    {
      label: 'Subscribed Landlords',
      value: subscribedLandlords.length,
      icon: CreditCard,
      section: 'subscribed_landlords' as DashboardSection,
      color: 'success',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <LayoutDashboard className="h-6 w-6 text-brand-600" />
            Admin Dashboard
          </h1>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage users, verification, subscriptions, and platform activity.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshDashboard}
          disabled={refreshing}
          className="btn-secondary"
        >
          <RefreshCw
            className={cn(
              'h-4 w-4',
              refreshing && 'animate-spin'
            )}
          />
          Refresh
        </button>
      </div>

      {/* Admin Profile */}
      <div className="card mb-6 overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-4 py-2.5 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
            <ShieldCheck className="h-4 w-4" />
            Administrator Profile
          </p>
        </div>

        <div className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-100 text-xl font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                {profile.profile_photo_url ? (
                  <img
                    src={profile.profile_photo_url}
                    alt={profile.full_name || 'Admin'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  profile.full_name?.charAt(0).toUpperCase() || 'A'
                )}
              </div>

              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  {profile.full_name || 'Administrator'}
                </h2>

                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {profile.email}
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="badge bg-brand-50 text-brand-700 capitalize dark:bg-brand-800 dark:text-brand-200">
                    Administrator
                  </span>

                  <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                    <ShieldCheck className="h-3 w-3" />
                    Admin Access
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                window.location.hash = '#profile';
              }}
              className="btn-secondary text-sm"
            >
              <Pencil className="h-4 w-4" />
              Edit Profile
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="card flex min-h-[300px] items-center justify-center">
          <div className="text-center">
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-brand-600" />

            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Loading administration dashboard...
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Statistics */}
          {section === 'overview' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {statCards.map((stat) => (
                  <button
                    key={stat.label}
                    type="button"
                    onClick={() => setSection(stat.section)}
                    className="card group p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          {stat.label}
                        </p>

                        <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                          {stat.value}
                        </p>
                      </div>

                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-800 dark:text-brand-300">
                        <stat.icon className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center text-xs font-semibold text-brand-600 dark:text-brand-400">
                      Manage
                      <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </button>
                ))}
              </div>

              {/* Verification cards */}
              <div className="mt-6 grid gap-6 lg:grid-cols-2">

                {/* Landlords */}
                <div className="card overflow-hidden">
                  <div className="border-b border-gray-200 bg-gradient-to-r from-warning-50 to-warning-100 px-5 py-4 dark:border-brand-800 dark:from-warning-900/20 dark:to-brand-900/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                          <Building2 className="h-5 w-5 text-warning-600" />
                          Landlord Verification
                        </h3>

                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Review landlord applications.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 divide-x divide-gray-200 dark:divide-brand-800">
                    <button
                      type="button"
                      onClick={() => {
                        setSection('landlord_verification');
                        setVerificationFilter('pending');
                      }}
                      className="p-5 text-center hover:bg-gray-50 dark:hover:bg-brand-800/30"
                    >
                      <Clock className="mx-auto h-5 w-5 text-warning-600" />

                      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                        {pendingLandlords.length}
                      </p>

                      <p className="text-xs text-gray-500">
                        Pending
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSection('landlord_verification');
                        setVerificationFilter('approved');
                      }}
                      className="p-5 text-center hover:bg-gray-50 dark:hover:bg-brand-800/30"
                    >
                      <CheckCircle2 className="mx-auto h-5 w-5 text-success-600" />

                      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                        {approvedLandlords.length}
                      </p>

                      <p className="text-xs text-gray-500">
                        Approved
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSection('landlord_verification');
                        setVerificationFilter('rejected');
                      }}
                      className="p-5 text-center hover:bg-gray-50 dark:hover:bg-brand-800/30"
                    >
                      <XCircle className="mx-auto h-5 w-5 text-error-600" />

                      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                        {rejectedLandlords.length}
                      </p>

                      <p className="text-xs text-gray-500">
                        Rejected
                      </p>
                    </button>
                  </div>

                  <div className="border-t border-gray-200 p-4 dark:border-brand-800">
                    <button
                      type="button"
                      onClick={() => {
                        setSection('landlord_verification');
                        setVerificationFilter('pending');
                      }}
                      className="btn-primary w-full"
                    >
                      <UserCheck className="h-4 w-4" />
                      Review Pending Landlords
                    </button>
                  </div>
                </div>

                {/* Movers */}
                <div className="card overflow-hidden">
                  <div className="border-b border-gray-200 bg-gradient-to-r from-accent-50 to-accent-100 px-5 py-4 dark:border-brand-800 dark:from-accent-900/20 dark:to-brand-900/30">
                    <h3 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                      <Truck className="h-5 w-5 text-accent-600" />
                      Mover Verification
                    </h3>

                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Review mover applications.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 divide-x divide-gray-200 dark:divide-brand-800">
                    <button
                      type="button"
                      onClick={() => {
                        setSection('mover_verification');
                        setVerificationFilter('pending');
                      }}
                      className="p-5 text-center hover:bg-gray-50 dark:hover:bg-brand-800/30"
                    >
                      <Clock className="mx-auto h-5 w-5 text-warning-600" />

                      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                        {pendingMovers.length}
                      </p>

                      <p className="text-xs text-gray-500">
                        Pending
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSection('mover_verification');
                        setVerificationFilter('approved');
                      }}
                      className="p-5 text-center hover:bg-gray-50 dark:hover:bg-brand-800/30"
                    >
                      <CheckCircle2 className="mx-auto h-5 w-5 text-success-600" />

                      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                        {approvedMovers.length}
                      </p>

                      <p className="text-xs text-gray-500">
                        Approved
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSection('mover_verification');
                        setVerificationFilter('rejected');
                      }}
                      className="p-5 text-center hover:bg-gray-50 dark:hover:bg-brand-800/30"
                    >
                      <XCircle className="mx-auto h-5 w-5 text-error-600" />

                      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                        {rejectedMovers.length}
                      </p>

                      <p className="text-xs text-gray-500">
                        Rejected
                      </p>
                    </button>
                  </div>

                  <div className="border-t border-gray-200 p-4 dark:border-brand-800">
                    <button
                      type="button"
                      onClick={() => {
                        setSection('mover_verification');
                        setVerificationFilter('pending');
                      }}
                      className="btn-primary w-full"
                    >
                      <Truck className="h-4 w-4" />
                      Review Pending Movers
                    </button>
                  </div>
                </div>
              </div>

              {/* Platform summary */}
              <div className="card mt-6 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Platform Summary
                </h3>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <SummaryItem
                    label="Verified Users"
                    value={activeUsers.length}
                    icon={ShieldCheck}
                  />

                  <SummaryItem
                    label="Pending Landlords"
                    value={pendingLandlords.length}
                    icon={Clock}
                  />

                  <SummaryItem
                    label="Pending Movers"
                    value={pendingMovers.length}
                    icon={Clock}
                  />

                  <SummaryItem
                    label="Active Subscriptions"
                    value={subscribedLandlords.length}
                    icon={CreditCard}
                  />
                </div>
              </div>
            </>
          )}

          {/* Management section */}
          {section !== 'overview' && (
            <div className="card overflow-hidden">

              {/* Section header */}
              <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-5 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

                  <div>
                    <button
                      type="button"
                      onClick={() => setSection('overview')}
                      className="mb-2 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                    >
                      <ChevronRight className="h-3 w-3 rotate-180" />
                      Dashboard
                    </button>

                    <h2 className="text-xl font-bold capitalize text-gray-900 dark:text-white">
                      {section === 'subscribed_landlords'
                        ? 'Subscribed Landlords'
                        : section === 'landlord_verification'
                        ? 'Landlord Verification'
                        : section === 'mover_verification'
                        ? 'Mover Verification'
                        : section.replace('_', ' ')}
                    </h2>

                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {displayedUsers.length} record
                      {displayedUsers.length === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search users..."
                        className="input-field w-full pl-9 sm:w-64"
                      />
                    </div>

                    {(section === 'landlord_verification' ||
                      section === 'mover_verification') && (
                      <select
                        value={verificationFilter}
                        onChange={(e) =>
                          setVerificationFilter(
                            e.target.value as VerificationFilter
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

              {/* User table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-brand-800 dark:bg-brand-900/30 dark:text-gray-400">
                      <th className="px-5 py-3">User</th>
                      <th className="px-5 py-3">Role</th>
                      <th className="px-5 py-3">Contact</th>
                      <th className="px-5 py-3">Verification</th>
                      <th className="px-5 py-3">Subscription</th>
                      <th className="px-5 py-3">Created</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100 dark:divide-brand-800">
                    {displayedUsers.map((user) => (
                      <tr
                        key={user.id}
                        className="transition-colors hover:bg-gray-50 dark:hover:bg-brand-900/30"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
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
                              <p className="font-semibold text-gray-900 dark:text-white">
                                {getDisplayName(user)}
                              </p>

                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span className="badge bg-brand-50 capitalize text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                            {user.role?.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
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

                        <td className="px-5 py-4">
                          {user.subscription ? (
                            <div>
                              <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                                <CreditCard className="h-3 w-3" />
                                {user.subscription.plan}
                              </span>

                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {user.subscription.expires_at
                                  ? `Expires ${formatDate(
                                      user.subscription.expires_at
                                    )}`
                                  : 'No expiry'}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">
                              No active subscription
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(user.created_at)}
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            {/* pending user button */}
                            <button
                              type="button"
                              onClick={() => setSelectedUser(user)}
                              className="btn-secondary px-3 py-2 text-xs"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
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
                        <td
                          colSpan={7}
                          className="px-5 py-16 text-center"
                        >
                          <Users className="mx-auto h-10 w-10 text-gray-300 dark:text-brand-700" />

                          <p className="mt-3 font-medium text-gray-700 dark:text-gray-300">
                            No users found
                          </p>

                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Try changing your search or filter.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* View User Modal */}
      {selectedUser && (
  <>
    {/* =========================================================
        MAIN USER DETAILS MODAL
    ========================================================= */}
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-brand-950">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4 dark:border-brand-800 dark:bg-brand-950">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              User Details
            </h2>

            <p className="text-xs text-gray-500">
              {getDisplayName(selectedUser)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSelectedUser(null)}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-brand-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main Content */}
        <div className="space-y-6 p-5">

          {/* =====================================================
              PROFILE
          ===================================================== */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-100 text-2xl font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
              {selectedUser.profile_photo_url ? (
                <img
                  src={selectedUser.profile_photo_url}
                  alt={getDisplayName(selectedUser)}
                  className="h-full w-full object-cover"
                />
              ) : (
                getInitials(selectedUser)
              )}
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {getDisplayName(selectedUser)}
              </h3>

              <p className="text-sm text-gray-500">
                {selectedUser.email}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                <span className="badge bg-brand-50 capitalize text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                  {selectedUser.role}
                </span>

                {verificationBadge(selectedUser)}
              </div>
            </div>
          </div>

          {/* =====================================================
              BASIC INFORMATION
          ===================================================== */}
          <div>
            <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">
              Account Information
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem
                label="Email"
                value={selectedUser.email}
                icon={Mail}
              />

              <DetailItem
                label="Phone"
                value={selectedUser.phone}
                icon={Phone}
              />

              <DetailItem
                label="City"
                value={selectedUser.city}
                icon={Home}
              />

              <DetailItem
                label="County"
                value={selectedUser.county}
                icon={Home}
              />

              <DetailItem
                label="Created"
                value={formatDate(selectedUser.created_at)}
                icon={CalendarDays}
              />

              {/* KYC WITH VIEW BUTTON */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-brand-800 dark:bg-brand-900/40">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <DetailItem
                      label="KYC"
                      value={
                        selectedUser.kyc_completed
                          ? "Completed"
                          : "Not completed"
                      }
                      icon={ShieldCheck}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowKycModal(true)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-200 dark:hover:bg-brand-800"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* =====================================================
              SUBSCRIPTION
          ===================================================== */}
          {selectedUser.subscription && (
            <div className="rounded-xl border border-success-200 bg-success-50 p-4 dark:border-success-900/50 dark:bg-success-900/10">
              <h3 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                <CreditCard className="h-4 w-4 text-success-600" />
                Subscription
              </h3>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <DetailItem
                  label="Plan"
                  value={selectedUser.subscription.plan}
                  icon={CreditCard}
                />

                <DetailItem
                  label="Starts"
                  value={formatDate(selectedUser.subscription.starts_at)}
                  icon={CalendarDays}
                />

                <DetailItem
                  label="Expires"
                  value={formatDate(selectedUser.subscription.expires_at)}
                  icon={CalendarDays}
                />
              </div>
            </div>
          )}

          {/* =====================================================
              VERIFICATION INFORMATION
          ===================================================== */}
          {(selectedUser.role === "landlord" ||
            selectedUser.role === "mover") && (
            <div>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-brand-800 dark:bg-brand-900/40">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Verification Information
                </h3>

                <button
                  type="button"
                  onClick={() => setShowVerificationModal(true)}
                  className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-200 dark:hover:bg-brand-800"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <DetailItem
                  label="Application Status"
                  value={
                    selectedUser.role === "landlord"
                      ? selectedUser.landlord_application_status
                      : selectedUser.mover_application_status
                  }
                  icon={ShieldCheck}
                />

                <DetailItem
                  label="Verification"
                  value={selectedUser.verification_status}
                  icon={ShieldCheck}
                />

                <DetailItem
                  label="National ID"
                  value={selectedUser.national_id}
                  icon={UserCheck}
                />

                <DetailItem
                  label="ID Document Type"
                  value={
                    selectedUser.id_photo_url
                      ? "Document uploaded"
                      : "Not uploaded"
                  }
                  icon={UserCheck}
                />
              </div>

              {/* Existing Document Buttons */}
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedUser.id_document_url && (
                  <a
                    href={selectedUser.id_document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary text-sm"
                  >
                    <Eye className="h-4 w-4" />
                    View ID Document
                  </a>
                )}

                {selectedUser.selfie_url && (
                  <a
                    href={selectedUser.selfie_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary text-sm"
                  >
                    <Eye className="h-4 w-4" />
                    View Selfie
                  </a>
                )}
              </div>
            </div>
          )}

          {/* =====================================================
              VERIFICATION ACTIONS
          ===================================================== */}
          {(selectedUser.role === "landlord" ||
            selectedUser.role === "mover") && (
            <div className="border-t border-gray-200 pt-5 dark:border-brand-800">
              <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">
                Verification Actions
              </h3>

             
            </div>
          )}
        </div>

        {/* =====================================================
            MAIN MODAL FOOTER
        ===================================================== */}
        <div className="flex sticky flex items-center w-full justify-between bottom-0 justify-end border-t border-gray-200 p-5 dark:border-brand-800">
             <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateApplicationStatus(selectedUser, "approved")
                  }
                  className="btn-primary"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </button>

                <button
                  type="button"
                  onClick={() =>
                    updateApplicationStatus(selectedUser, "rejected")
                  }
                  className="rounded-full w-fit flex gap-1 border border-error-200 bg-error-50 px-4 py-2.5 text-sm font-semibold text-error-700 transition-colors hover:bg-error-100 dark:border-error-900/50 dark:bg-error-900/20 dark:text-error-400 "
                >
                  <UserX className="h-4 w-4" />
                  Reject
                </button>

                <button
                  type="button"
                  onClick={() =>
                    updateApplicationStatus(selectedUser, "pending")
                  }
                  className="btn-secondary"
                >
                  <Clock className="h-4 w-4" />
                  Set Pending
                </button>
              </div>
          <div>
            <button
            type="button"
            onClick={() => {
              setSelectedUser(null);
              openEdit(selectedUser);
            }}
            className="btn-primary"
          >
            <Pencil className="h-4 w-4" />
            Edit User
          </button>
          </div>
        </div>
      </div>
    </div>

    {/* =========================================================
        KYC DETAILS MODAL
    ========================================================= */}
    {showKycModal && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
        <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-brand-950">

          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4 dark:border-brand-800 dark:bg-brand-950">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                KYC Details
              </h2>

              <p className="text-xs text-gray-500">
                {getDisplayName(selectedUser)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowKycModal(false)}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-brand-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* KYC Content */}
          <div className="space-y-5 p-5">

            {/* KYC Status */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-brand-800 dark:bg-brand-900/40">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 dark:bg-brand-800">
                    <ShieldCheck className="h-5 w-5 text-brand-700 dark:text-brand-200" />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      KYC Status
                    </p>

                    <p className="text-xs text-gray-500">
                      Current KYC completion status
                    </p>
                  </div>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    selectedUser.kyc_completed
                      ? "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400"
                      : "bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-brand-300"
                  }`}
                >
                  {selectedUser.kyc_completed
                    ? "Completed"
                    : "Not completed"}
                </span>
              </div>
            </div>

            {/* KYC Information */}
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem
                label="Full Name"
                value={getDisplayName(selectedUser)}
                icon={UserCheck}
              />

              <DetailItem
                label="National ID"
                value={selectedUser.national_id}
                icon={UserCheck}
              />

              <DetailItem
                label="Email"
                value={selectedUser.email}
                icon={Mail}
              />

              <DetailItem
                label="Phone"
                value={selectedUser.phone}
                icon={Phone}
              />

              <DetailItem
                label="City"
                value={selectedUser.city}
                icon={Home}
              />

              <DetailItem
                label="County"
                value={selectedUser.county}
                icon={Home}
              />
            </div>

            {/* KYC Documents */}
            <div>
              <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">
                KYC Documents
              </h3>

              <div className="grid gap-3 sm:grid-cols-2">

                {/* ID Document */}
                <div className="rounded-xl border border-gray-200 p-4 dark:border-brand-800">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        ID Document
                      </p>

                      <p className="text-xs text-gray-500">
                        National identification document
                      </p>
                    </div>

                    {selectedUser.id_document_url ? (
                      <a
                        href={selectedUser.id_document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">
                        Not uploaded
                      </span>
                    )}
                  </div>
                </div>

                {/* Selfie */}
                <div className="rounded-xl border border-gray-200 p-4 dark:border-brand-800">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Selfie
                      </p>

                      <p className="text-xs text-gray-500">
                        Identity verification selfie
                      </p>
                    </div>

                    {selectedUser.selfie_url ? (
                      <a
                        href={selectedUser.selfie_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">
                        Not uploaded
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end border-t border-gray-200 p-5 dark:border-brand-800">
            <button
              type="button"
              onClick={() => setShowKycModal(false)}
              className="btn-secondary"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}

    {/* =========================================================
        VERIFICATION INFORMATION MODAL
    ========================================================= */}
    {showVerificationModal && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
        <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-brand-950">

          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4 dark:border-brand-800 dark:bg-brand-950">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Verification Information
              </h2>

              <p className="text-xs text-gray-500">
                {getDisplayName(selectedUser)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowVerificationModal(false)}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-brand-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Verification Content */}
          <div className="space-y-5 p-5">

            {/* Status */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-brand-800 dark:bg-brand-900/40">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 dark:bg-brand-800">
                  <ShieldCheck className="h-5 w-5 text-brand-700 dark:text-brand-200" />
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    Verification Status
                  </p>

                  <p className="text-xs capitalize text-gray-500">
                    {selectedUser.verification_status || "Not available"}
                  </p>
                </div>
              </div>
            </div>

            {/* Application Information */}
            <div>
              <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">
                Application Information
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <DetailItem
                  label="Role"
                  value={selectedUser.role}
                  icon={UserCheck}
                />

                <DetailItem
                  label="Application Status"
                  value={
                    selectedUser.role === "landlord"
                      ? selectedUser.landlord_application_status
                      : selectedUser.mover_application_status
                  }
                  icon={ShieldCheck}
                />

                <DetailItem
                  label="Verification Status"
                  value={selectedUser.verification_status}
                  icon={ShieldCheck}
                />

                <DetailItem
                  label="National ID"
                  value={selectedUser.national_id}
                  icon={UserCheck}
                />
              </div>
            </div>

            {/* Verification Documents */}
            <div>
              <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">
                Verification Documents
              </h3>

              <div className="space-y-3">

                {/* ID Document */}
                <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-brand-800">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-brand-800">
                      <UserCheck className="h-5 w-5 text-gray-600 dark:text-brand-200" />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        National ID Document
                      </p>

                      <p className="text-xs text-gray-500">
                        {selectedUser.id_document_url
                          ? "Document uploaded"
                          : "No document uploaded"}
                      </p>
                    </div>
                  </div>

                  {selectedUser.id_document_url && (
                    <a
                      href={selectedUser.id_document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </a>
                  )}
                </div>

                {/* Selfie */}
                <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-brand-800">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-brand-800">
                      <UserCheck className="h-5 w-5 text-gray-600 dark:text-brand-200" />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Verification Selfie
                      </p>

                      <p className="text-xs text-gray-500">
                        {selectedUser.selfie_url
                          ? "Selfie uploaded"
                          : "No selfie uploaded"}
                      </p>
                    </div>
                  </div>

                  {selectedUser.selfie_url && (
                    <a
                      href={selectedUser.selfie_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 p-5 dark:border-brand-800">
            <button
              type="button"
              onClick={() => setShowVerificationModal(false)}
              className="btn-secondary"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}
  </>
)}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-brand-950">

            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4 dark:border-brand-800 dark:bg-brand-950">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  Edit User
                </h2>

                <p className="text-xs text-gray-500">
                  {getDisplayName(editingUser)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-brand-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Full Name
                </label>

                <input
                  value={editForm.full_name}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      full_name: e.target.value,
                    })
                  }
                  className="input-field"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email
                  </label>

                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        email: e.target.value,
                      })
                    }
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Phone
                  </label>

                  <input
                    value={editForm.phone}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        phone: e.target.value,
                      })
                    }
                    className="input-field"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    City
                  </label>

                  <input
                    value={editForm.city}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        city: e.target.value,
                      })
                    }
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    County
                  </label>

                  <input
                    value={editForm.county}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        county: e.target.value,
                      })
                    }
                    className="input-field"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Role
                  </label>

                  <select
                    value={editForm.role}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        role: e.target.value,
                      })
                    }
                    className="input-field"
                  >
                    <option value="renter">Renter</option>
                    <option value="landlord">Landlord</option>
                    <option value="real_estate">
                      Real Estate
                    </option>
                    <option value="mover">Mover</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Verification Status
                  </label>

                  <select
                    value={editForm.verification_status}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        verification_status: e.target.value,
                      })
                    }
                    className="input-field"
                  >
                    <option value="">Unverified</option>
                    <option value="pending_verification">
                      Pending Verification
                    </option>
                    <option value="verified">Verified</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              {editingUser.role === 'landlord' && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Landlord Application Status
                  </label>

                  <select
                    value={editForm.landlord_application_status}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        landlord_application_status:
                          e.target.value,
                      })
                    }
                    className="input-field"
                  >
                    <option value="">Not set</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              )}

              {editingUser.role === 'mover' && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Mover Application Status
                  </label>

                  <select
                    value={editForm.mover_application_status}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        mover_application_status:
                          e.target.value,
                      })
                    }
                    className="input-field"
                  >
                    <option value="">Not set</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-gray-200 p-5 sm:flex-row sm:justify-end dark:border-brand-800">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="btn-secondary"
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveUser}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
          
        </div>
      )}
    </div>
  );
}

function SummaryItem({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-brand-800">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {label}
        </p>

        <Icon className="h-4 w-4 text-brand-600" />
      </div>

      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function DetailItem({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | null | undefined;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 dark:bg-brand-900/40">
      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold capitalize text-gray-900 dark:text-white">
        {value || '—'}
      </p>
    </div>
  );
};