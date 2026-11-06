import { useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { protectedPost } from '@/lib/djangoApi';

export default function ResetPasswordPage() {
  const params = new URLSearchParams(window.location.search);
  const uid = params.get('uid') || '';
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!uid || !token) {
      setError('This password reset link is incomplete. Request a new link from Account Security.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Your new password must contain at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await protectedPost('/api/accounts/password-reset/confirm/', { uid, token, password });
      setSuccess(true);
      setPassword('');
      setConfirmPassword('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'This reset link may have expired. Request a new one and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10 dark:bg-brand-950">
      <section className="card w-full max-w-md p-6 sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"><KeyRound className="h-6 w-6" /></div>
        <h1 className="mt-5 text-center text-2xl font-bold text-gray-900 dark:text-white">Reset your password</h1>
        <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">Choose a new password for your Saka Krib account.</p>

        {success ? (
          <div className="mt-6">
            <div role="status" className="flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300"><CheckCircle2 className="h-5 w-5 shrink-0" />Your password has been updated. You can now return to Saka Krib and sign in.</div>
            <a href="/#home" className="btn-primary mt-5 flex justify-center">Return to Saka Krib</a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {!uid || !token ? <div role="alert" className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"><AlertCircle className="h-5 w-5 shrink-0" />This link is incomplete or invalid. Request a fresh password reset email.</div> : null}
            <div>
              <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">New password</label>
              <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="input-field" minLength={8} required disabled={!uid || !token} />
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm new password</label>
              <input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="input-field" minLength={8} required disabled={!uid || !token} />
            </div>
            {error && <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-300"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
            <button type="submit" disabled={submitting || !uid || !token} className="btn-primary flex w-full items-center justify-center gap-2 disabled:opacity-60">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Updating password…</> : 'Update password'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
