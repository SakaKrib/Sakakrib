import { useEffect, useState } from 'react';
import { Clock3, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { protectedGet } from '@/lib/djangoLegacyApi';
import RenterDashboard from './RenterDashboard';
import LandlordDashboard from './LandlordDashboard';
import RealEstateDashboard from './Realestatedashboard';
import MoverDashboard from './MoverDashboard';
import LandlordPMSWorkspace from './LandlordPMSWorkspace';
import RealEstatePMSWorkspace from '@/components/PMS/RealEstate/RealEstatePMSWorkspace';
import DashboardPage from './DashboardPage';
import AdminOperationsPanel from './AdminOperationsPanel';
import AdminListingPostPanel from './AdminListingPostPanel';
import PMSSubscriptionPage from '@/components/PMS/PMSSubscriptionPage';
import type { UserRole } from '@/types/domain';

type ProfessionalRole = Extract<UserRole, 'landlord' | 'real_estate' | 'mover'>;
type ApplicationStatusField = 'landlord_application_status' | 'real_estate_application_status' | 'mover_application_status';

type PMSAccessResponse = {
  allowed?: boolean;
  reason?: string;
  read_only?: boolean;
  role?: ProfessionalRole;
  subscription_id?: string;
  subscription_status?: string;
};

const applicationField: Record<ProfessionalRole, ApplicationStatusField> = {
  landlord: 'landlord_application_status',
  real_estate: 'real_estate_application_status',
  mover: 'mover_application_status',
};

const labels: Record<ProfessionalRole, string> = { landlord: 'landlord', real_estate: 'real estate', mover: 'mover' };
function normalizeStatus(value: unknown) { return String(value ?? '').trim().toLowerCase(); }

function AccessNotice({ role, status }: { role: ProfessionalRole; status: string }) {
  const { navigate } = useNav();
  const label = String(labels[role] ?? '');
  const pending = ['pending', 'pending_review', 'pending-review', 'submitted', 'under_review'].includes(status);
  const rejected = ['rejected', 'declined'].includes(status);
  const title = pending ? `${label[0].toUpperCase()}${label.slice(1)} application under review` : rejected ? `${label[0].toUpperCase()}${label.slice(1)} application needs attention` : 'Continue your registration';
  const message = pending ? `Your ${label} application is waiting for administrator approval. Your dashboard will become available after approval.` : rejected ? `Your ${label} application has not been approved. Please continue your registration and update the required information.` : `You selected ${label} as your role, but your registration is not complete yet. Complete your verification and application before accessing the dashboard.`;
  const destination = role === 'landlord' ? 'register-landlord' : role === 'mover' ? 'register-mover' : 'kyc-verify';
  return <div className="mx-auto max-w-md px-4 py-20"><div className="card p-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-50 dark:bg-warning-900/30">{pending ? <Clock3 className="h-7 w-7 text-warning-600 dark:text-warning-400" /> : <ShieldCheck className="h-7 w-7 text-warning-600 dark:text-warning-400" />}</div><h2 className="mt-5 text-xl font-bold text-gray-900 dark:text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{message}</p><div className="card mt-5 p-4 text-left"><p className="text-sm font-semibold text-gray-900 dark:text-gray-200">Dashboard access requirements</p><ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-400"><li>• Your role must be {label}.</li><li>• Your email must be verified.</li><li>• Identity verification must be completed.</li><li>• An administrator must approve your application.</li></ul></div><button type="button" onClick={() => navigate(destination)} className="btn-primary mt-6 w-full">Continue with registration</button></div></div>;
}

function PMSAccessGate({ role, status }: { role: Extract<ProfessionalRole, 'landlord' | 'real_estate'>; status: string }) {
  const [access, setAccess] = useState<PMSAccessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { navigate } = useNav();

  useEffect(() => {
    let cancelled = false;
    setAccess(null);
    setError(null);
    protectedGet<PMSAccessResponse>('/api/subscriptions/me/pms-access/')
      .then((result) => { if (!cancelled) setAccess(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to verify PMS access.'); });
    return () => { cancelled = true; };
  }, [role, status, refreshKey]);

  if (error) return <div className="mx-auto max-w-md px-4 py-20"><div className="card p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-error-600" /><h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Unable to verify PMS access</h2><p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{error}</p><button type="button" onClick={() => setRefreshKey((key) => key + 1)} className="btn-primary mt-6 w-full">Retry</button></div></div>;
  if (!access) return <div className="flex min-h-[300px] items-center justify-center gap-2 text-sm text-gray-500"><Loader2 className="h-5 w-5 animate-spin" />Verifying PMS access...</div>;
  if (access.allowed === true) return role === 'landlord' ? <LandlordPMSWorkspace /> : <RealEstatePMSWorkspace />;

  const reason = normalizeStatus(access.reason);
  if (reason === 'active_subscription_required') return <PMSSubscriptionPage />;
  if (reason === 'landlord_application_not_approved' || reason === 'real_estate_application_not_approved' || reason === 'identity_verification_required') return <AccessNotice role={role} status={status} />;
  return <div className="mx-auto max-w-md px-4 py-20"><div className="card p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-warning-600" /><h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">PMS access is not available</h2><p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{access.reason || 'Your account is not currently entitled to the PMS workspace.'}</p><button type="button" onClick={() => navigate('dashboard')} className="btn-primary mt-6 w-full">Return to dashboard</button></div></div>;
}

function RealEstatePMSLauncher() {
  const { navigate } = useNav();
  return <div className="mx-auto mt-6 max-w-7xl px-2 sm:px-6 lg:px-8"><div className="rounded-2xl border border-brand-200 bg-brand-50 p-5 shadow-sm dark:border-brand-800 dark:bg-brand-900/30"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">Property management</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Manage your real estate portfolio</h2><p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Open the dedicated real-estate management workspace. Django will verify your active subscription before granting access.</p></div><button type="button" onClick={() => navigate('pms-dashboard')} className="btn-primary inline-flex shrink-0 items-center justify-center">Manage Real Estate</button></div></div></div>;
}

export default function RoleDashboardRouter() {
  const { profile, loading } = useAuth();
  const { view, navigate, pmsEntryGranted } = useNav();
  if (loading) return <div className="flex min-h-[300px] items-center justify-center text-sm text-gray-500">Loading your account...</div>;
  if (!profile) return <div className="mx-auto max-w-md px-4 py-20 text-center text-sm text-gray-500">Please sign in to access your dashboard.</div>;
  if (profile.is_superuser === true || profile.is_admin === true) return <><DashboardPage /><AdminOperationsPanel /><AdminListingPostPanel /></>;
  if (!profile.role) return null;
  if (profile.role === 'renter') return <RenterDashboard />;

  const role = profile.role as ProfessionalRole;
  const status = normalizeStatus(profile[applicationField[role]]);

  if (role === 'landlord' || role === 'real_estate') {
    if (view === 'pms-dashboard') {
      if (!pmsEntryGranted) return role === 'landlord' ? <LandlordDashboard navigate={navigate} /> : <><RealEstateDashboard /><RealEstatePMSLauncher /></>;
      return <PMSAccessGate role={role} status={status} />;
    }
    return role === 'landlord' ? <LandlordDashboard navigate={navigate} /> : <><RealEstateDashboard /><RealEstatePMSLauncher /></>;
  }

  const approved = status === 'approved';
  const verified = profile.email_verified === true && profile.kyc_completed === true;
  if (!approved || !verified) return <AccessNotice role={role} status={status} />;
  return <MoverDashboard />;
}
