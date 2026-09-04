import { Clock3, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import RenterDashboard from './RenterDashboard';
import LandlordDashboard from './LandlordDashboard';
import MoverDashboard from './MoverDashboard';
import RealEstateDashboard from './Realestatedashboard';
import DashboardPage from './DashboardPage';
import AdminOperationsPanel from './AdminOperationsPanel';
import type { UserRole } from '@/types/domain';

type ProfessionalRole = Extract<UserRole, 'landlord' | 'real_estate' | 'mover'>;
type ApplicationStatusField = 'landlord_application_status' | 'real_estate_application_status' | 'mover_application_status';

const applicationField: Record<ProfessionalRole, ApplicationStatusField> = {
  landlord: 'landlord_application_status',
  real_estate: 'real_estate_application_status',
  mover: 'mover_application_status',
};

const labels: Record<ProfessionalRole, string> = {
  landlord: 'landlord',
  real_estate: 'real estate',
  mover: 'mover',
};

function normalizeStatus(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function AccessNotice({ role, status }: { role: ProfessionalRole; status: string }) {
  const { navigate } = useNav();
  const label = String(labels[role] ?? '');
  const pending = ['pending', 'pending_review', 'pending-review', 'submitted', 'under_review'].includes(status);
  const rejected = ['rejected', 'declined'].includes(status);

  const title = pending
    ? `${label[0].toUpperCase()}${label.slice(1)} application under review`
    : rejected
      ? `${label[0].toUpperCase()}${label.slice(1)} application needs attention`
      : 'Continue your registration';

  const message = pending
    ? `Your ${label} application is waiting for administrator approval. Your dashboard will become available after approval.`
    : rejected
      ? `Your ${label} application has not been approved. Please continue your registration and update the required information.`
      : `You selected ${label} as your role, but your registration is not complete yet. Complete your verification and application before accessing the dashboard.`;

  const destination = role === 'landlord' ? 'register-landlord' : role === 'mover' ? 'register-mover' : 'kyc-verify';

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <div className="card p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-50 dark:bg-warning-900/30">
          {pending ? <Clock3 className="h-7 w-7 text-warning-600 dark:text-warning-400" /> : <ShieldCheck className="h-7 w-7 text-warning-600 dark:text-warning-400" />}
        </div>
        <h2 className="mt-5 text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{message}</p>
        <div className="card mt-5 p-4 text-left">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-200">Dashboard access requirements</p>
          <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-400">
            <li>• Your role must be {label}.</li>
            <li>• Your email must be verified.</li>
            <li>• Identity verification must be completed.</li>
            <li>• An administrator must approve your application.</li>
          </ul>
        </div>
        <button type="button" onClick={() => navigate(destination)} className="btn-primary mt-6 w-full">
          Continue with registration
        </button>
      </div>
    </div>
  );
}

export default function RoleDashboardRouter() {
  const { profile, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-[300px] items-center justify-center text-sm text-gray-500">Loading your account...</div>;
  }

  if (!profile) {
    return <div className="mx-auto max-w-md px-4 py-20 text-center text-sm text-gray-500">Please sign in to access your dashboard.</div>;
  }

  if (profile.is_superuser === true || profile.is_admin === true) {
    return (
      <>
        <DashboardPage />
        <AdminOperationsPanel />
      </>
    );
  }
  if (!profile.role) return null;
  if (profile.role === 'renter') return <RenterDashboard />;

  const role = profile.role as ProfessionalRole;
  const status = normalizeStatus(profile[applicationField[role]]);
  const approved = status === 'approved';
  const verified = profile.email_verified === true && profile.kyc_completed === true;

  if (!approved || !verified) return <AccessNotice role={role} status={status} />;
  if (role === 'landlord') return <LandlordDashboard />;
  if (role === 'real_estate') return <RealEstateDashboard />;
  return <MoverDashboard />;
}
