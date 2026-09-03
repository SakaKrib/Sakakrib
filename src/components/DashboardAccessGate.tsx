import { Clock3, ShieldCheck, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav, type AppView } from '@/context/NavContext';
import type { UserRole } from '@/types/domain';

interface DashboardAccessGateProps {
  role: Extract<UserRole, 'landlord' | 'real_estate' | 'mover'>;
  children: ReactNode;
}

const applicationField = {
  landlord: 'landlord_application_status',
  real_estate: 'real_estate_application_status',
  mover: 'mover_application_status',
} as const;

const registrationView: Record<DashboardAccessGateProps['role'], AppView> = {
  landlord: 'register-landlord',
  real_estate: 'kyc-verify',
  mover: 'register-mover',
};

const roleLabel: Record<DashboardAccessGateProps['role'], string> = {
  landlord: 'landlord',
  real_estate: 'real estate',
  mover: 'mover',
};

export default function DashboardAccessGate({ role, children }: DashboardAccessGateProps) {
  const { profile, loading } = useAuth();
  const { navigate } = useNav();

  if (loading || !profile) return null;
  if (profile.is_admin === true || profile.role === 'admin') return children;

  if (profile.role !== role) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="card p-8">
          <XCircle className="mx-auto h-10 w-10 text-error-600" />
          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Dashboard access restricted</h2>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">This dashboard is only available to {roleLabel[role]} accounts.</p>
        </div>
      </div>
    );
  }

  const status = String(profile[applicationField[role]] ?? 'not_requested').trim().toLowerCase();
  const approved = status === 'approved';
  const kycApproved = profile.kyc_completed === true;
  const emailVerified = profile.email_verified === true;

  if (approved && kycApproved && emailVerified) return children;

  const pending = status === 'pending' || status === 'pending_review' || status === 'under_review' || status === 'submitted';
  const rejected = status === 'rejected' || status === 'declined';

  const title = pending
    ? `${roleLabel[role][0].toUpperCase()}${roleLabel[role].slice(1)} application under review`
    : rejected
      ? `${roleLabel[role][0].toUpperCase()}${roleLabel[role].slice(1)} application needs attention`
      : 'Continue your registration';

  const message = pending
    ? `Your ${roleLabel[role]} application has been submitted and is waiting for administrator approval. The dashboard will become available after approval.`
    : rejected
      ? `Your ${roleLabel[role]} application is not approved yet. Please continue your registration and update the required information.`
      : `You have selected ${roleLabel[role]} as your role, but your registration is not complete yet. Complete your verification and application before accessing the dashboard.`;

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <div className="card p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-50 dark:bg-warning-900/30">
          {pending ? <Clock3 className="h-7 w-7 text-warning-600 dark:text-warning-400" /> : <ShieldCheck className="h-7 w-7 text-warning-600 dark:text-warning-400" />}
        </div>
        <h2 className="mt-5 text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{message}</p>
        <div className="mt-5 rounded-xl border border-warning-200 bg-warning-50 p-4 text-left dark:border-warning-800 dark:bg-warning-900/20">
          <p className="text-sm font-semibold text-warning-900 dark:text-warning-200">Dashboard access requirements</p>
          <ul className="mt-2 space-y-1 text-sm text-warning-800 dark:text-warning-300">
            <li>• Your role must be {roleLabel[role]}.</li>
            <li>• Your email must be verified.</li>
            <li>• Identity verification must be completed.</li>
            <li>• An administrator must approve your application.</li>
          </ul>
        </div>
        <button type="button" onClick={() => navigate(registrationView[role])} className="btn-primary mt-6 w-full">
          Continue with registration
        </button>
      </div>
    </div>
  );
}
