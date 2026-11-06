import { useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { protectedPost } from '@/lib/djangoApi';

export default function AccountSecurityPage() {
  const { profile, loading, signOut } = useAuth();
  const { setAuthModalOpen, setAuthMode, navigate } = useNav();
  const [requestingReset, setRequestingReset] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const requestPasswordReset = async () => {
    if (!profile?.email) return;
    setError('');
    setMessage('');
    setRequestingReset(true);
    try {
      const result = await protectedPost<{ message?: string }>(
        '/api/accounts/password-reset/',
        { email: profile.email, redirect_to: window.location.origin },
      );
      setMessage(result.message || 'If your account is eligible, a password reset link has been sent to your email.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'We could not request a password reset. Please try again.');
    } finally {
      setRequestingReset(false);
    }
  };

  const handleSignOut = async () => {
    setError('');
    setSigningOut(true);
    try {
      await signOut();
      navigate('home');
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : 'Unable to sign out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-gray-500">Loading account security…</div>;
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-brand-600" />
        <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Account Security</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Sign in to review your account details and manage password security.</p>
        <button type="button" onClick={() => { setAuthMode('signin'); setAuthModalOpen(true); }} className="btn-primary mt-6">Sign in</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-7 flex items-start gap-3">
        <div className="rounded-xl bg-brand-50 p-3 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"><ShieldCheck className="h-7 w-7" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Account Security</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Review your sign-in identity and take action to protect your Saka Krib account.</p>
        </div>
      </div>

      <section className="card mb-5 space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-brand-600" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Account email</p>
            <p className="break-all font-semibold text-gray-900 dark:text-white">{profile.email}</p>
          </div>
          <span className={profile.email_verified ? 'rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}>
            {profile.email_verified ? 'Verified' : 'Not verified'}
          </span>
        </div>
        <div className="border-t border-gray-100 pt-4 dark:border-brand-800">
          <p className="text-sm text-gray-600 dark:text-gray-300">Sign-in notifications are sent to this email address when your account is accessed.</p>
        </div>
      </section>

      <section className="card mb-5 p-5">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-1 h-5 w-5 text-brand-600" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900 dark:text-white">Password</h2>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">Request a secure password-reset email. The link is sent only to the email address registered to this account and expires when its reset token is no longer valid.</p>
            <button type="button" onClick={requestPasswordReset} disabled={requestingReset} className="btn-primary mt-4 disabled:cursor-not-allowed disabled:opacity-60">
              {requestingReset ? 'Sending request…' : 'Send password reset link'}
            </button>
          </div>
        </div>
      </section>

      <section className="card mb-5 p-5">
        <h2 className="font-semibold text-gray-900 dark:text-white">Sign out</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Sign out of this device. This does not claim to terminate sessions on other devices.</p>
        <button type="button" onClick={handleSignOut} disabled={signingOut} className="btn-secondary mt-4 inline-flex items-center gap-2 disabled:opacity-60">
          <LogOut className="h-4 w-4" />{signingOut ? 'Signing out…' : 'Sign out of this device'}
        </button>
      </section>

      {message && <div role="status" className="mb-4 flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{message}</div>}
      {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      <button type="button" onClick={() => navigate('profile')} className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">Back to profile</button>
    </div>
  );
}
