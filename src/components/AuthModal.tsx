import { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { supabase } from '@/lib/supabase';
import { cn, validateEmail } from '@/lib/utils';

interface PasswordRule {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  {
    label: 'At least 8 characters',
    test: (pw) => pw.length >= 8,
  },
  {
    label: 'Contains uppercase letter',
    test: (pw) => /[A-Z]/.test(pw),
  },
  {
    label: 'Contains lowercase letter',
    test: (pw) => /[a-z]/.test(pw),
  },
  {
    label: 'Contains a number',
    test: (pw) => /\d/.test(pw),
  },
  {
    label: 'Contains a special character',
    test: (pw) => /[@$!%*?&^#]/.test(pw),
  },
];

export default function AuthModal() {
  const { signIn, signUp, signInWithGoogle } = useAuth();

  const {
    authModalOpen,
    setAuthModalOpen,
    setRoleModalOpen,
    authMode,
    setAuthMode,
  } = useNav();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordStrength = PASSWORD_RULES.filter((rule) =>
    rule.test(password)
  ).length;

  const allRulesPassed =
    passwordStrength === PASSWORD_RULES.length;

  /*
   * Reset temporary UI state whenever the modal opens.
   * authMode itself is controlled by NavContext.
   */
  useEffect(() => {
    if (authModalOpen) {
      setError(null);
      setInfo(null);
      setLoading(false);
      setShowPassword(false);
    }
  }, [authModalOpen]);

  if (!authModalOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);
    setInfo(null);

    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    /*
     * PASSWORD RESET
     */
    if (authMode === 'forgot') {
      setLoading(true);

      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });

      setLoading(false);

      if (resetError) {
        setError('Could not send reset email. Please try again.');
      } else {
        setInfo('Password reset link sent. Check your email inbox.');
      }

      return;
    }

    /*
     * SIGN IN VALIDATION
     */
    if (authMode === 'signin') {
      if (!password) {
        setError('Please enter your password.');
        return;
      }
    }

    /*
     * SIGN UP VALIDATION
     */
    if (authMode === 'signup') {
      if (!fullName.trim()) {
        setError('Please enter your full name.');
        return;
      }

      if (!allRulesPassed) {
        setError(
          'Your password does not meet all the security requirements.'
        );
        return;
      }
    }

    setLoading(true);

    const result =
      authMode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password, fullName);

    setLoading(false);

    if (result.error) {
      console.error('Authentication error:', result.error);
      setError(result.error);
      return;
    }

    /*
     * Close authentication modal after successful authentication.
     */
    setAuthModalOpen(false);

    /*
     * After successful registration, open the role-selection modal.
     */
    if (authMode === 'signup') {
      setInfo(null);

      setTimeout(() => {
        setRoleModalOpen(true);
      }, 200);
    }
  };

  const switchMode = (
    newMode: 'signin' | 'signup' | 'forgot'
  ) => {
    setAuthMode(newMode);
    setError(null);
    setInfo(null);
    setPassword('');
    setShowPassword(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm animate-fade-in"
        onClick={() => setAuthModalOpen(false)}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md animate-scale-in rounded-2xl bg-white shadow-2xl dark:bg-brand-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-brand-800">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {authMode === 'signin'
              ? 'Welcome Back'
              : authMode === 'signup'
              ? 'Create Account'
              : 'Reset Password'}
          </h2>

          <button
            type="button"
            onClick={() => setAuthModalOpen(false)}
            className="rounded-full border border-gray-300 p-2 text-gray-400 transition-colors hover:border-btnblue-400 hover:text-btnblue-600 dark:border-brand-700 dark:hover:border-btnblue-500"
            aria-label="Close authentication modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Google Authentication */}
          {authMode !== 'forgot' && (
            <>
              <button
                type="button"
                onClick={signInWithGoogle}
                className="btn-secondary w-full"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>

                Continue with Google
              </button>

              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200 dark:bg-brand-800" />

                <span className="text-xs font-medium text-gray-400">
                  or
                </span>

                <div className="h-px flex-1 bg-gray-200 dark:bg-brand-800" />
              </div>
            </>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            {authMode === 'signup' && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Full Name
                </label>

                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    autoComplete="name"
                    className="input-field pl-10"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email Address
              </label>

              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="input-field pl-10"
                />
              </div>
            </div>

            {/* Password */}
            {authMode !== 'forgot' && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Password
                </label>

                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={
                      authMode === 'signin'
                        ? 'current-password'
                        : 'new-password'
                    }
                    className="input-field pl-10 pr-10"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={
                      showPassword
                        ? 'Hide password'
                        : 'Show password'
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Password Rules */}
                {authMode === 'signup' && password.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex gap-1">
                      {PASSWORD_RULES.map((rule, index) => (
                        <div
                          key={rule.label}
                          className={cn(
                            'h-1.5 flex-1 rounded-full transition-colors',
                            index < passwordStrength
                              ? 'bg-success-500'
                              : 'bg-gray-200 dark:bg-brand-800'
                          )}
                        />
                      ))}
                    </div>

                    <ul className="space-y-1">
                      {PASSWORD_RULES.map((rule) => {
                        const passed = rule.test(password);

                        return (
                          <li
                            key={rule.label}
                            className={cn(
                              'flex items-center gap-1.5 text-xs',
                              passed
                                ? 'text-success-600 dark:text-success-400'
                                : 'text-gray-400'
                            )}
                          >
                            {passed ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <AlertCircle className="h-3 w-3" />
                            )}

                            {rule.label}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-error-50 px-4 py-2.5 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
                {error}
              </div>
            )}

            {/* Info */}
            {info && (
              <div className="rounded-lg bg-success-50 px-4 py-2.5 text-sm text-success-700 dark:bg-success-900/20 dark:text-success-400">
                {info}
              </div>
            )}

            {/* Forgot Password */}
            {authMode === 'signin' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading
                ? 'Please wait...'
                : authMode === 'signin'
                ? 'Sign In'
                : authMode === 'signup'
                ? 'Create Account'
                : 'Send Reset Link'}
            </button>
          </form>

          {/* Mode Switch */}
          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            {authMode === 'signin'
              ? "Don't have an account? "
              : authMode === 'forgot'
              ? 'Remember your password? '
              : 'Already have an account? '}

            <button
              type="button"
              onClick={() =>
                switchMode(
                  authMode === 'signin'
                    ? 'signup'
                    : 'signin'
                )
              }
              className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              {authMode === 'signin'
                ? 'Sign up'
                : 'Sign in'}
            </button>
          </p>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 dark:border-brand-800">
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            © Copyright Saka Krib. All Rights Reserved.
          </p>
        </div>
      </div>
    </div>
  );
}