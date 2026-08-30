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
import openKycDocument from './openPrivateDocsHelper';
import { useAuth } from '@/context/AuthContext';
import { protectedGet, protectedPatch } from '@/lib/protectedApi';
import { cn } from '@/lib/utils';

type UserRole = 'landlord' | 'real_estate' | 'mover' | 'renter' | 'admin';
type VerificationFilter = 'all' | 'pending' | 'approved' | 'rejected';
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
type ApplicationStatus = 'pending' | 'approved' | 'rejected';

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
  id_document_type: string | null;
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

interface MoverApplication {
  id: string;
  applicant_id: string;
  applicant_email: string | null;
  applicant_name: string;
  driver_full_name: string;
  national_id: string;
  dl_number: string;
  dl_photo_url: string | null;
  vehicle_type: string;
  number_plate: string;
  capacity_details: string;
  operating_city: string;
  operating_county: string;
  phone: string;
  base_rate_kes: number | null;
  rate_per_km_kes: number | null;
  payment_channel: string;
  payment_account: string;
  insurance_policy_details: string;
  vehicle_inspection_expiry: string | null;
  liability_accepted: boolean;
  terms_accepted: boolean;
  reference_contacts: unknown[];
  status: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
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

/**
 * Mover verification has three persisted status locations in this database:
 * mover_applications.status -> movers.approval_status -> profiles.mover_application_status.
 * The application is the review source of truth; the other two are synchronized
 * projections used by the mover-facing application and profile/dashboard.
 */
const getMoverApplicationStatus = (user: UserWithSubscription): string =>
  normalizeStatus(
    user.moverApplication?.status ||
      user.moverRecord?.approval_status ||
      user.mover_application_status
  );

const getVerificationStatus = (user: UserWithSubscription) => {
  const role = normalizeStatus(user.role);
  if (role === 'landlord') return normalizeStatus(user.landlord_application_status);
  if (role === 'mover') return getMoverApplicationStatus(user);
  return normalizeStatus(user.verification_status);
};

const isApproved = (user: UserWithSubscription) =>
  getVerificationStatus(user) === 'approved';

const isRejected = (user: UserWithSubscription) =>
  getVerificationStatus(user) === 'rejected';

const isPending = (user: UserWithSubscription) =>
  ['pending', 'pending_review', 'pending_verification'].includes(
    getVerificationStatus(user)
  );

export default function AdminDashboard() {
  const { profile } = useAuth();
  const isAdmin = profile?.is_admin === true || profile?.role === 'admin';

  const [users, setUsers] = useState<UserWithSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<DashboardSection>('overview');
  const [search, setSearch] = useState('');
  const [verificationFilter, setVerificationFilter] =
    useState<VerificationFilter>('all');
  const [selectedUser, setSelectedUser] =
    useState<UserWithSubscription | null>(null);
  const [editingUser, setEditingUser] =
    useState<UserWithSubscription | null>(null);
  const [showKycModal, setShowKycModal] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: '', email: '', phone: '', city: '', county: '', role: '',
    verification_status: '', landlord_application_status: '', mover_application_status: '',
  });

  const loadDashboard = async () => {
    setError(null);
    try {
      const [profileRows, subscriptionRows, moverRows, moverApplicationRows] =
        await Promise.all([
          protectedGet<AdminUser[]>(
            `/rest/v1/profiles?select=id,email,full_name,first_name,last_name,middle_name,role,verification_status,national_id,phone,profile_photo_url,id_photo_url,id_document_url,id_document_type,selfie_url,city,county,is_agency,free_listings_used,created_at,updated_at,landlord_application_status,mover_application_status,email_verified,role_selected_at,kyc_completed&order=created_at.desc`
          ),
          protectedGet<Subscription[]>(
            `/rest/v1/landlord_subscriptions?select=id,landlord_id,status,current_period_end,plan:subscription_plans(id,name)&order=created_at.desc`
          ),
          protectedGet<MoverRecord[]>(
            `/rest/v1/movers?select=id,user_id,approval_status&order=created_at.desc`
          ),
          protectedGet<MoverApplication[]>(
            `/rest/v1/mover_applications?select=id,applicant_id,applicant_email,applicant_name,driver_full_name,national_id,dl_number,dl_photo_url,vehicle_type,number_plate,capacity_details,operating_city,operating_county,phone,base_rate_kes,rate_per_km_kes,payment_channel,payment_account,insurance_policy_details,vehicle_inspection_expiry,liability_accepted,terms_accepted,reference_contacts,status,reviewed_by,reviewed_at,review_notes,submitted_at,created_at,updated_at&order=created_at.desc`
          ),
        ]);

      const subscriptions = subscriptionRows || [];
      const movers = moverRows || [];
      const applications = moverApplicationRows || [];

      setUsers(
        (profileRows || []).map((user) => {
          const userMover = movers.find((mover) => mover.user_id === user.id) || null;
          const userApplication = applications.find(
            (application) => application.applicant_id === user.id
          ) || null;
          const userSubscriptions = subscriptions.filter(
            (subscription) => subscription.landlord_id === user.id
          );
          const activeSubscription = userSubscriptions.find(
            (subscription) => normalizeStatus(subscription.status) === 'active'
          );

          return {
            ...user,
            subscription: activeSubscription || userSubscriptions[0] || null,
            moverApplication: userApplication,
            moverRecord: userMover,
          };
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin dashboard.');
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

  const landlords = useMemo(
    () => users.filter((user) => normalizeStatus(user.role) === 'landlord'),
    [users]
  );
  const movers = useMemo(
    () => users.filter((user) => normalizeStatus(user.role) === 'mover'),
    [users]
  );
  const renters = useMemo(
    () => users.filter((user) => normalizeStatus(user.role) === 'renter'),
    [users]
  );
  const realEstate = useMemo(
    () => users.filter((user) => normalizeStatus(user.role) === 'real_estate' || user.is_agency === true),
    [users]
  );
  const subscribedLandlords = useMemo(
    () => landlords.filter((user) => normalizeStatus(user.subscription?.status) === 'active'),
    [landlords]
  );

  const pendingLandlords = useMemo(() => landlords.filter(isPending), [landlords]);
  const approvedLandlords = useMemo(() => landlords.filter(isApproved), [landlords]);
  const rejectedLandlords = useMemo(() => landlords.filter(isRejected), [landlords]);
  const pendingMovers = useMemo(() => movers.filter(isPending), [movers]);
  const approvedMovers = useMemo(() => movers.filter(isApproved), [movers]);
  const rejectedMovers = useMemo(() => movers.filter(isRejected), [movers]);

  const displayedUsers = useMemo(() => {
    let result: UserWithSubscription[];
    switch (section) {
      case 'users': result = users; break;
      case 'landlords': result = landlords; break;
      case 'real_estate': result = realEstate; break;
      case 'movers': result = movers; break;
      case 'renters': result = renters; break;
      case 'subscribed_landlords': result = subscribedLandlords; break;
      case 'landlord_verification': result = landlords; break;
      case 'mover_verification': result = movers; break;
      case 'admin_users': result = users.filter((user) => normalizeStatus(user.role) === 'admin'); break;
      default: result = [];
    }

    if (section === 'landlord_verification' || section === 'mover_verification') {
      if (verificationFilter === 'pending') result = result.filter(isPending);
      if (verificationFilter === 'approved') result = result.filter(isApproved);
      if (verificationFilter === 'rejected') result = result.filter(isRejected);
    }

    const query = search.trim().toLowerCase();
    if (!query) return result;
    return result.filter((user) =>
      [getDisplayName(user), user.email, user.phone, user.city, user.county]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [section, verificationFilter, search, users, landlords, realEstate, movers, renters, subscribedLandlords]);

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
      landlord_application_status: user.landlord_application_status || '',
      mover_application_status: user.mover_application_status || '',
    });
  };

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
        const databaseStatus = status === 'pending' ? 'pending' : status;

        // 1. Review source of truth: mover_applications.
        if (user.moverApplication?.id) {
          await protectedPatch(
            `/rest/v1/mover_applications?id=eq.${encodeURIComponent(user.moverApplication.id)}`,
            {
              status: databaseStatus,
              reviewed_at: now,
              review_notes: user.moverApplication.review_notes || null,
            }
          );
        }

        // 2. Keep the operational mover record synchronized.
        if (user.moverRecord?.id) {
          await protectedPatch(
            `/rest/v1/movers?id=eq.${encodeURIComponent(user.moverRecord.id)}`,
            {
              approval_status: status === 'pending' ? 'pending_review' : status,
              updated_at: now,
            }
          );
        }

        // 3. Keep the profile projection synchronized.
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
      } else {
        throw new Error('Application status can only be updated for landlords and movers.');
      }

      await loadDashboard();
      setSelectedUser(null);
      setShowKycModal(false);
      setShowVerificationModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update application status.');
    } finally {
      setSaving(false);
    }
  };

  const saveUser = async () => {
    if (!editingUser || saving) return;
    setSaving(true);
    setError(null);
    try {
      const role = editForm.role.trim() || editingUser.role;
      await protectedPatch(
        `/rest/v1/profiles?id=eq.${encodeURIComponent(editingUser.id)}`,
        {
          full_name: editForm.full_name.trim() || null,
          email: editForm.email.trim(),
          phone: editForm.phone.trim() || null,
          city: editForm.city.trim() || null,
          county: editForm.county.trim() || null,
          role,
          verification_status: editForm.verification_status || null,
          landlord_application_status: role === 'landlord' ? editForm.landlord_application_status || null : null,
          mover_application_status: role === 'mover' ? editForm.mover_application_status || null : null,
          updated_at: new Date().toISOString(),
        }
      );
      setEditingUser(null);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user.');
    } finally {
      setSaving(false);
    }
  };

  const verificationBadge = (user: UserWithSubscription) => {
    if (isApproved(user)) return <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400"><CheckCircle2 className="h-3 w-3" />Approved</span>;
    if (isRejected(user)) return <span className="badge bg-error-50 text-error-700 dark:bg-error-900/30 dark:text-error-400"><XCircle className="h-3 w-3" />Rejected</span>;
    if (isPending(user)) return <span className="badge bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400"><Clock className="h-3 w-3" />Pending</span>;
    return <span className="badge bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-400">Unverified</span>;
  };

  if (!profile) return <div className="mx-auto max-w-5xl px-2 py-20 text-center text-gray-500">Please sign in to continue.</div>;
  if (!isAdmin) return <div className="mx-auto max-w-5xl px-2 py-20 text-center"><div className="card p-8"><ShieldCheck className="mx-auto h-12 w-12 text-error-500" /><h2 className="mt-4 text-xl font-bold">Admin Access Required</h2><p className="mt-2 text-sm text-gray-500">You do not have permission to access the administration dashboard.</p></div></div>;

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
        <div><h1 className="flex items-center gap-2 text-2xl font-bold"><LayoutDashboard className="h-6 w-6 text-brand-600" />Admin Dashboard</h1><p className="mt-1 text-sm text-gray-500">Manage users, verification, subscriptions, and platform activity.</p></div>
        <button type="button" onClick={() => { setRefreshing(true); void loadDashboard(); }} disabled={refreshing} className="btn-secondary"><RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />Refresh</button>
      </div>

      {error && <div className="mb-6 flex items-start justify-between gap-3 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700"><span>{error}</span><button type="button" onClick={() => setError(null)}><X className="h-4 w-4" /></button></div>}

      {loading ? <div className="card flex min-h-[300px] items-center justify-center"><RefreshCw className="h-8 w-8 animate-spin text-brand-600" /></div> : <>
        {section === 'overview' ? <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stats.map(([label, value, Icon, target]) => <button key={label} type="button" onClick={() => setSection(target)} className="card group p-5 text-left hover:shadow-md"><div className="flex items-start justify-between"><div><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600"><Icon className="h-5 w-5" /></div></div><div className="mt-4 flex items-center text-xs font-semibold text-brand-600">Manage<ChevronRight className="ml-1 h-4 w-4" /></div></button>)}
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <VerificationCard title="Landlord Verification" icon={Building2} pending={pendingLandlords.length} approved={approvedLandlords.length} rejected={rejectedLandlords.length} onOpen={() => { setSection('landlord_verification'); setVerificationFilter('pending'); }} />
            <VerificationCard title="Mover Verification" icon={Truck} pending={pendingMovers.length} approved={approvedMovers.length} rejected={rejectedMovers.length} onOpen={() => { setSection('mover_verification'); setVerificationFilter('pending'); }} />
          </div>
        </> : <div className="card overflow-hidden">
          <div className="border-b border-gray-200 bg-brand-50 px-5 py-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><button type="button" onClick={() => setSection('overview')} className="mb-2 text-xs font-semibold text-brand-600">← Dashboard</button><h2 className="text-xl font-bold capitalize">{section.replaceAll('_', ' ')}</h2><p className="text-sm text-gray-500">{displayedUsers.length} record{displayedUsers.length === 1 ? '' : 's'}</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." className="input-field w-full pl-9 sm:w-64" /></div>{(section === 'landlord_verification' || section === 'mover_verification') && <select value={verificationFilter} onChange={(e) => setVerificationFilter(e.target.value as VerificationFilter)} className="input-field sm:w-40"><option value="all">All Statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>}</div></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px]"><thead><tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500"><th className="px-5 py-3">User</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Verification</th><th className="px-5 py-3">Created</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y">{displayedUsers.map((user) => <tr key={user.id} className="hover:bg-gray-50"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-brand-100 font-bold text-brand-700">{user.profile_photo_url ? <img src={user.profile_photo_url} alt={getDisplayName(user)} className="h-full w-full object-cover" /> : getInitials(user)}</div><div><p className="font-semibold">{getDisplayName(user)}</p><p className="text-xs text-gray-500">{user.email}</p></div></div></td><td className="px-5 py-4"><span className="badge bg-brand-50 capitalize text-brand-700">{String(user.role).replaceAll('_', ' ')}</span></td><td className="px-5 py-4 text-xs text-gray-500"><div className="space-y-1">{user.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{user.phone}</p>}<p className="flex items-center gap-1"><Mail className="h-3 w-3" />{user.email}</p></div></td><td className="px-5 py-4">{verificationBadge(user)}</td><td className="px-5 py-4 text-sm text-gray-500">{formatDate(user.created_at)}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><button type="button" onClick={() => setSelectedUser(user)} className="btn-secondary px-3 py-2 text-xs"><Eye className="h-3.5 w-3.5" />View</button><button type="button" onClick={() => openEdit(user)} className="btn-primary px-3 py-2 text-xs"><Pencil className="h-3.5 w-3.5" />Edit</button></div></td></tr>)}{displayedUsers.length === 0 && <tr><td colSpan={6} className="px-5 py-16 text-center text-gray-500">No users found.</td></tr>}</tbody></table></div>
        </div>}
      </>}

      {selectedUser && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4"><div><h2 className="text-lg font-bold">User Details</h2><p className="text-xs text-gray-500">{getDisplayName(selectedUser)}</p></div><button type="button" onClick={() => setSelectedUser(null)}><X className="h-5 w-5" /></button></div><div className="space-y-6 p-5"><div className="flex items-center gap-4"><div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-brand-100 font-bold text-brand-700">{selectedUser.profile_photo_url ? <img src={selectedUser.profile_photo_url} alt="" className="h-full w-full object-cover" /> : getInitials(selectedUser)}</div><div><h3 className="text-xl font-bold">{getDisplayName(selectedUser)}</h3><p className="text-sm text-gray-500">{selectedUser.email}</p><div className="mt-2">{verificationBadge(selectedUser)}</div></div></div><div className="grid gap-4 sm:grid-cols-2"><Detail label="Role" value={selectedUser.role} icon={UserCheck} /><Detail label="Email" value={selectedUser.email} icon={Mail} /><Detail label="Phone" value={selectedUser.phone} icon={Phone} /><Detail label="City" value={selectedUser.city} icon={Home} /><Detail label="County" value={selectedUser.county} icon={Home} /><Detail label="Created" value={formatDate(selectedUser.created_at)} icon={CalendarDays} /></div>{(normalizeStatus(selectedUser.role) === 'mover' || normalizeStatus(selectedUser.role) === 'landlord') && <div className="rounded-xl border bg-gray-50 p-4"><div className="flex items-center justify-between"><div><h3 className="font-semibold">Verification</h3><p className="text-sm text-gray-500">Application: {getVerificationStatus(selectedUser) || 'not available'}</p>{normalizeStatus(selectedUser.role) === 'mover' && <p className="mt-1 text-xs text-gray-500">Application record: {selectedUser.moverApplication?.status || 'none'} · Mover record: {selectedUser.moverRecord?.approval_status || 'none'}</p>}</div><button type="button" onClick={() => setShowVerificationModal(true)} className="btn-secondary text-xs"><Eye className="h-4 w-4" />View</button></div></div>}{selectedUser.kyc_completed !== null && <Detail label="KYC" value={selectedUser.kyc_completed ? 'Completed' : 'Not completed'} icon={ShieldCheck} />}</div><div className="flex flex-wrap justify-between gap-2 border-t p-5"><div className="flex gap-2">{(normalizeStatus(selectedUser.role) === 'mover' || normalizeStatus(selectedUser.role) === 'landlord') && <><button type="button" disabled={saving} onClick={() => void updateApplicationStatus(selectedUser, 'approved')} className="btn-primary"><CheckCircle2 className="h-4 w-4" />Approve</button><button type="button" disabled={saving} onClick={() => void updateApplicationStatus(selectedUser, 'rejected')} className="btn-secondary text-error-600"><UserX className="h-4 w-4" />Reject</button><button type="button" disabled={saving} onClick={() => void updateApplicationStatus(selectedUser, 'pending')} className="btn-secondary"><Clock className="h-4 w-4" />Set Pending</button></>}</div><div className="flex gap-2"><button type="button" onClick={() => { const u = selectedUser; setSelectedUser(null); openEdit(u); }} className="btn-primary"><Pencil className="h-4 w-4" />Edit User</button><button type="button" onClick={() => setSelectedUser(null)} className="btn-secondary">Close</button></div></div></div></div>}

      {showVerificationModal && selectedUser && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-5"><div><h2 className="text-lg font-bold">Verification Information</h2><p className="text-xs text-gray-500">{getDisplayName(selectedUser)}</p></div><button type="button" onClick={() => setShowVerificationModal(false)}><X className="h-5 w-5" /></button></div><div className="space-y-5 p-5"><Detail label="Application Status" value={getVerificationStatus(selectedUser)} icon={ShieldCheck} /><Detail label="National ID" value={selectedUser.national_id} icon={UserCheck} /><Detail label="Document Type" value={selectedUser.id_document_type} icon={UserCheck} />{normalizeStatus(selectedUser.role) === 'mover' && selectedUser.moverApplication && <div className="grid gap-4 sm:grid-cols-2"><Detail label="Driver" value={selectedUser.moverApplication.driver_full_name} icon={UserCheck} /><Detail label="Vehicle" value={selectedUser.moverApplication.vehicle_type} icon={Truck} /><Detail label="Plate" value={selectedUser.moverApplication.number_plate} icon={Truck} /><Detail label="Operating City" value={selectedUser.moverApplication.operating_city} icon={Home} /><Detail label="Operating County" value={selectedUser.moverApplication.operating_county} icon={Home} /><Detail label="Base Rate" value={selectedUser.moverApplication.base_rate_kes != null ? `KES ${Number(selectedUser.moverApplication.base_rate_kes).toLocaleString('en-KE')}` : null} icon={CreditCard} /></div>}{selectedUser.selfie_url && <button type="button" className="btn-secondary" onClick={async () => { const message = await openKycDocument(selectedUser.selfie_url, 'selfie'); if (message) setError(message); }}><Eye className="h-4 w-4" />View Selfie</button>}{(selectedUser.id_document_url || selectedUser.id_photo_url) && <button type="button" className="btn-secondary ml-2" onClick={async () => { const message = await openKycDocument(selectedUser.id_document_url || selectedUser.id_photo_url, 'id'); if (message) setError(message); }}><Eye className="h-4 w-4" />View ID</button>}</div><div className="border-t p-5 text-right"><button type="button" onClick={() => setShowVerificationModal(false)} className="btn-secondary">Close</button></div></div></div>}

      {editingUser && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl"><div className="flex items-center justify-between border-b p-5"><h2 className="text-lg font-bold">Edit User</h2><button type="button" onClick={() => setEditingUser(null)}><X className="h-5 w-5" /></button></div><div className="space-y-4 p-5"><Input label="Full Name" value={editForm.full_name} onChange={(value) => setEditForm((f) => ({ ...f, full_name: value }))} /><Input label="Email" value={editForm.email} onChange={(value) => setEditForm((f) => ({ ...f, email: value }))} /><Input label="Phone" value={editForm.phone} onChange={(value) => setEditForm((f) => ({ ...f, phone: value }))} /><Input label="City" value={editForm.city} onChange={(value) => setEditForm((f) => ({ ...f, city: value }))} /><Input label="County" value={editForm.county} onChange={(value) => setEditForm((f) => ({ ...f, county: value }))} /><label className="block text-sm font-medium">Role<select value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))} className="input-field mt-1"><option value="renter">Renter</option><option value="landlord">Landlord</option><option value="real_estate">Real Estate</option><option value="mover">Mover</option><option value="admin">Admin</option></select></label><label className="block text-sm font-medium">Verification Status<select value={editForm.verification_status} onChange={(e) => setEditForm((f) => ({ ...f, verification_status: e.target.value }))} className="input-field mt-1"><option value="unverified">Unverified</option><option value="pending_verification">Pending Verification</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select></label></div><div className="flex justify-end gap-2 border-t p-5"><button type="button" onClick={() => setEditingUser(null)} className="btn-secondary">Cancel</button><button type="button" disabled={saving} onClick={() => void saveUser()} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button></div></div></div>}
      {showKycModal && selectedUser && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"><div className="card max-w-lg p-6"><h2 className="text-lg font-bold">KYC Details</h2><p className="mt-2 text-sm text-gray-500">KYC is {selectedUser.kyc_completed ? 'completed' : 'not completed'}.</p><button type="button" onClick={() => setShowKycModal(false)} className="btn-secondary mt-4">Close</button></div></div>}
    </div>
  );
}

function VerificationCard({ title, icon: Icon, pending, approved, rejected, onOpen }: { title: string; icon: typeof Truck; pending: number; approved: number; rejected: number; onOpen: () => void }) {
  return <div className="card overflow-hidden"><div className="border-b bg-brand-50 px-5 py-4"><h3 className="flex items-center gap-2 font-bold"><Icon className="h-5 w-5 text-brand-600" />{title}</h3><p className="mt-1 text-xs text-gray-500">Review applications using the application record as the source of truth.</p></div><div className="grid grid-cols-3 divide-x"><Stat label="Pending" value={pending} icon={Clock} /><Stat label="Approved" value={approved} icon={CheckCircle2} /><Stat label="Rejected" value={rejected} icon={XCircle} /></div><div className="border-t p-4"><button type="button" onClick={onOpen} className="btn-primary w-full"><UserCheck className="h-4 w-4" />Review Pending</button></div></div>;
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Clock }) {
  return <div className="p-5 text-center"><Icon className="mx-auto h-5 w-5 text-brand-600" /><p className="mt-2 text-2xl font-bold">{value}</p><p className="text-xs text-gray-500">{label}</p></div>;
}

function Detail({ label, value, icon: Icon }: { label: string; value: string | number | null | undefined; icon: typeof Users }) {
  return <div className="rounded-lg bg-gray-50 p-3"><p className="flex items-center gap-1.5 text-xs font-medium text-gray-500"><Icon className="h-3.5 w-3.5" />{label}</p><p className="mt-1 break-words text-sm font-semibold capitalize">{value != null && String(value).trim() ? String(value) : '—'}</p></div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium">{label}<input value={value} onChange={(e) => onChange(e.target.value)} className="input-field mt-1" /></label>;
}
