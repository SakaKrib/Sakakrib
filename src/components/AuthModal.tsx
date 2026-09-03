import {
  useEffect,
  useState,
  type FormEvent,
} from 'react';

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
import { protectedPost } from '@/lib/djangoApi';
import { cn, validateEmail } from '@/lib/utils';

import EmailOtpVerification from '@/components/EmailOtpVerification';

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

type AuthMode = 'signin' | 'signup' | 'forgot';

export default function AuthModal() {
  const {
    signIn,
    signUp,
    signInWithGoogle,
    verifyEmailOtp,
    resendSignupOtp,
    needsEmailVerification,
    pendingVerificationEmail,
  } = useAuth();

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

  const [otpStep, setOtpStep] = useState(false);

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
   * ==========================================================
   * VERIFICATION EMAIL
   * ==========================================================
   *
   * AuthContext is the source of truth.
   */
  const verificationEmail = (
    pendingVerificationEmail || email
  )
    .trim()
    .toLowerCase();

  /*
   * ==========================================================
   * RESET FORM
   * ==========================================================
   */
  const clearAuthFields = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setOtpStep(false);
    setShowPassword(false);
    setError(null);
    setInfo(null);
    setLoading(false);
  };

  /*
   * ==========================================================
   * RESTORE OTP STATE
   * ==========================================================
   *
   * If AuthContext says verification is pending, always
   * restore the OTP screen when the modal opens.
   */
  useEffect(() => {
    if (!authModalOpen) {
      return;
    }

    setError(null);
    setInfo(null);
    setShowPassword(false);
    setLoading(false);

    if (
      needsEmailVerification &&
      pendingVerificationEmail
    ) {
      const normalizedEmail =
        pendingVerificationEmail
          .trim()
          .toLowerCase();

      setEmail(normalizedEmail);
      setPassword('');
      setOtpStep(true);
    }
  }, [
    authModalOpen,
    needsEmailVerification,
    pendingVerificationEmail,
  ]);

  /*
   * ==========================================================
   * CLOSE
   * ==========================================================
   */
  const handleClose = () => {
    if (loading) {
      return;
    }

    /*
     * Important:
     *
     * Closing this modal does NOT verify the user.
     * They remain unverified and cannot receive a profile row
     * or continue into the role-selection flow.
     */
    clearAuthFields();
    setAuthModalOpen(false);
  };

  /*
   * ==========================================================
   * OPEN OTP STEP
   * ==========================================================
   */
  const openOtpStep = (
    emailAddress: string,
    message?: string
  ) => {
    const normalizedEmail = emailAddress
      .trim()
      .toLowerCase();

    setEmail(normalizedEmail);
    setPassword('');
    setError(null);
    setOtpStep(true);

    setInfo(
      message ||
        `A verification code has been sent to ${normalizedEmail}.`
    );
  };

  /*
   * ==========================================================
   * VERIFY OTP
   * ==========================================================
   *
   * AuthModal delegates verification to AuthContext.
   *
   * AuthContext is responsible for:
   *
   * 1. Supabase verifyOtp()
   * 2. Confirming the authenticated user
   * 3. Creating the profile ONLY after verification
   * 4. Loading the profile
   *
   * Only after that succeeds do we open RoleModal.
   */
  const handleVerifyOtp = async (
    otp: string
  ): Promise<{ error: string | null }> => {
    setError(null);
    setInfo(null);

    const normalizedEmail = verificationEmail
      .trim()
      .toLowerCase();

    const normalizedOtp = otp
      .replace(/\D/g, '')
      .slice(0, 6);

    if (!validateEmail(normalizedEmail)) {
      return {
        error:
          'Your email address is invalid. Please start again.',
      };
    }

    if (normalizedOtp.length !== 6) {
      return {
        error:
          'Please enter the 6-digit verification code.',
      };
    }

    setLoading(true);

    try {
      const result = await verifyEmailOtp(
        normalizedEmail,
        normalizedOtp
      );

      /*
       * Verification failed.
       *
       * DO NOT open RoleModal.
       */
      if (result.error) {
        console.error(
          'OTP verification error:',
          result.error
        );

        return {
          error: result.error,
        };
      }

      /*
       * ======================================================
       * VERIFIED SUCCESS
       * ======================================================
       *
       * At this point AuthContext has completed the verification
       * and profile creation process.
       */

      setOtpStep(false);
      setError(null);
      setInfo(null);

      setEmail('');
      setPassword('');
      setFullName('');

      /*
       * Close authentication modal first.
       */
      setAuthModalOpen(false);

      /*
       * Give AuthContext one render cycle to publish the
       * verified session/profile before opening RoleModal.
       */
      window.setTimeout(() => {
        setRoleModalOpen(true);
      }, 200);

      return {
        error: null,
      };
    } catch (err) {
      console.error(
        'Unexpected OTP verification error:',
        err
      );

      return {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to verify your email. Please try again.',
      };
    } finally {
      setLoading(false);
    }
  };

  /*
   * ==========================================================
   * RESEND OTP
   * ==========================================================
   */
  const handleResendOtp = async (): Promise<{
    error: string | null;
  }> => {
    setError(null);
    setInfo(null);

    const normalizedEmail = verificationEmail
      .trim()
      .toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      return {
        error:
          'Please enter a valid email address before requesting another code.',
      };
    }

    setLoading(true);

    try {
      const result =
        await resendSignupOtp(normalizedEmail);

      if (result.error) {
        console.error(
          'OTP resend error:',
          result.error
        );

        return {
          error: result.error,
        };
      }

      setEmail(normalizedEmail);
      setOtpStep(true);

      setInfo(
        `A new verification code has been sent to ${normalizedEmail}.`
      );

      return {
        error: null,
      };
    } catch (err) {
      console.error(
        'Unexpected OTP resend error:',
        err
      );

      return {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to resend the verification code.',
      };
    } finally {
      setLoading(false);
    }
  };

  /*
   * ==========================================================
   * SUBMIT AUTH FORM
   * ==========================================================
   */
  const handleSubmit = async (
    e: FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    if (loading) {
      return;
    }

    setError(null);
    setInfo(null);

    const normalizedEmail = email
      .trim()
      .toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      setError(
        'Please enter a valid email address.'
      );
      return;
    }

    setEmail(normalizedEmail);

    /*
     * ========================================================
     * FORGOT PASSWORD
     * ========================================================
     */
    if (authMode === 'forgot') {
      setLoading(true);

      try {
        await protectedPost('/api/accounts/password-reset/', {
          email: normalizedEmail,
          redirect_to: window.location.origin,
        });

        setInfo('Password reset link sent. Check your email inbox.');
      } catch (err) {
        console.error(
          'Unexpected password reset error:',
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : 'Could not send the password reset email.'
        );
      } finally {
        setLoading(false);
      }

      return;
    }

    /*
     * ========================================================
     * SIGN IN VALIDATION
     * ========================================================
     */
    if (
      authMode === 'signin' &&
      !password
    ) {
      setError(
        'Please enter your password.'
      );
      return;
    }

    /*
     * ========================================================
     * SIGN UP VALIDATION
     * ========================================================
     */
    if (authMode === 'signup') {
      if (!fullName.trim()) {
        setError(
          'Please enter your full name.'
        );
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

    try {
      const result =
        authMode === 'signin'
          ? await signIn(
              normalizedEmail,
              password
            )
          : await signUp(
              normalizedEmail,
              password,
              fullName.trim()
            );

      /*
       * ======================================================
       * VERIFICATION REQUIRED
       * ======================================================
       *
       * This is the expected signup path when email
       * confirmation is enabled.
       */
      if (
        result.requiresEmailVerification
      ) {
        const emailForVerification = (
          pendingVerificationEmail ||
          normalizedEmail
        )
          .trim()
          .toLowerCase();

        openOtpStep(
          emailForVerification,
          `Your account has been created in authentication, but your application account is not active yet. Please verify ${emailForVerification} to continue.`
        );

        return;
      }

      /*
       * ======================================================
       * AUTH ERROR
       * ======================================================
       */
      if (result.error) {
        console.error(
          'Authentication error:',
          result.error
        );

        setError(result.error);
        return;
      }

      /*
       * ======================================================
       * SIGN IN SUCCESS
       * ======================================================
       *
       * Sign-in success is allowed to continue normally.
       * AuthContext should already have rejected any
       * unverified account.
       */
      if (authMode === 'signin') {
        clearAuthFields();
        setAuthModalOpen(false);
        return;
      }

      /*
       * ======================================================
       * SIGN UP WITHOUT VERIFICATION
       * ======================================================
       *
       * IMPORTANT:
       *
       * We deliberately DO NOT open RoleModal here.
       *
       * If signup reaches this point without
       * requiresEmailVerification, AuthContext must have
       * determined that the user is already verified.
       *
       * Nevertheless, because your business rule is:
       *
       * "No unverified user may be saved or continue."
       *
       * the safest UI behavior is to stop here unless
       * AuthContext explicitly guarantees verified signup.
       */
      if (authMode === 'signup') {
        setError(
          'Please verify your email before continuing.'
        );

        /*
         * If AuthContext has a pending verification email,
         * return to the OTP screen.
         */
        if (pendingVerificationEmail) {
          openOtpStep(
            pendingVerificationEmail,
            'Please verify your email before continuing.'
          );
        }

        return;
      }
    } catch (err) {
      console.error(
        'Unexpected authentication error:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Authentication failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  /*
   * ==========================================================
   * SWITCH AUTH MODE
   * ==========================================================
   */
  const switchMode = (
    newMode: AuthMode
  ) => {
    if (loading) {
      return;
    }

    setAuthMode(newMode);

    setError(null);
    setInfo(null);

    setPassword('');
    setFullName('');
    setOtpStep(false);
    setShowPassword(false);
  };

  /*
   * ==========================================================
   * OTP SCREEN
   * ==========================================================
   */
  if (otpStep) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm animate-fade-in"
          onClick={handleClose}
          aria-hidden="true"
        />

        <div className="relative w-full max-w-md animate-scale-in rounded-2xl bg-white p-6 shadow-2xl dark:bg-brand-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Verify Your Email
            </h2>

            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="rounded-full border border-gray-300 p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 dark:border-brand-700"
              aria-label="Close email verification"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <EmailOtpVerification
            email={verificationEmail}
            loading={loading}
            onVerify={handleVerifyOtp}
            onResend={handleResendOtp}
            onBack={() => {
              if (loading) {
                return;
              }

              setOtpStep(false);
              setError(null);
              setInfo(null);
            }}
            onVerified={() => {
              /*
               * Intentionally empty.
               *
               * handleVerifyOtp owns the successful transition.
               */
            }}
          />

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-lg bg-error-50 px-2 py-2.5 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400"
            >
              {error}
            </div>
          )}

          {info && (
            <div
              role="status"
              className="mt-4 rounded-lg bg-success-50 px-2 py-2.5 text-sm text-success-700 dark:bg-success-900/20 dark:text-success-400"
            >
              {info}
            </div>
          )}
        </div>
      </div>
    );
  }

  /*
   * ==========================================================
   * NORMAL AUTH MODAL
   * ==========================================================
   */
  if (!authModalOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm animate-fade-in"
        onClick={handleClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md animate-scale-in rounded-2xl bg-white shadow-2xl dark:bg-brand-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-brand-800">
          <h2
            id="auth-modal-title"
            className="text-xl font-bold text-gray-900 dark:text-white"
          >
            {authMode === 'signin'
              ? 'Welcome Back'
              : authMode === 'signup'
                ? 'Create Account'
                : 'Reset Password'}
          </h2>

          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="rounded-full border border-gray-300 p-2 text-gray-400 transition-colors hover:border-btnblue-400 hover:text-btnblue-600 disabled:opacity-50 dark:border-brand-700 dark:hover:border-btnblue-500"
            aria-label="Close authentication modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {authMode !== 'forgot' && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (!loading) {
                    void signInWithGoogle();
                  }
                }}
                disabled={loading}
                className="btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-50"
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
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.93-2.71 4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
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

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            {authMode === 'signup' && (
              <div>
                <label
                  htmlFor="auth-full-name"
                  className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Full Name
                </label>

                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                  <input
                    id="auth-full-name"
                    type="text"
                    value={fullName}
                    onChange={(e) =>
                      setFullName(e.target.value)
                    }
                    placeholder="John Doe"
                    autoComplete="name"
                    disabled={loading}
                    className="input-field pl-10"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Email Address
              </label>

              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={loading}
                  className="input-field pl-10"
                />
              </div>
            </div>

            {authMode !== 'forgot' && (
              <div>
                <label
                  htmlFor="auth-password"
                  className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Password
                </label>

                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                  <input
                    id="auth-password"
                    type={
                      showPassword
                        ? 'text'
                        : 'password'
                    }
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    placeholder="••••••••"
                    autoComplete={
                      authMode === 'signin'
                        ? 'current-password'
                        : 'new-password'
                    }
                    disabled={loading}
                    className="input-field pl-10 pr-10"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (value) => !value
                      )
                    }
                    disabled={loading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
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

                {authMode === 'signup' &&
                  password.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex gap-1">
                        {PASSWORD_RULES.map(
                          (rule, index) => (
                            <div
                              key={rule.label}
                              className={cn(
                                'h-1.5 flex-1 rounded-full transition-colors',
                                index <
                                  passwordStrength
                                  ? 'bg-success-500'
                                  : 'bg-gray-200 dark:bg-brand-800'
                              )}
                            />
                          )
                        )}
                      </div>

                      <ul className="space-y-1">
                        {PASSWORD_RULES.map(
                          (rule) => {
                            const passed =
                              rule.test(password);

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
                          }
                        )}
                      </ul>
                    </div>
                  )}
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-lg bg-error-50 px-2 py-2.5 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400"
              >
                {error}
              </div>
            )}

            {info && (
              <div
                role="status"
                className="rounded-lg bg-success-50 px-2 py-2.5 text-sm text-success-700 dark:bg-success-900/20 dark:text-success-400"
              >
                {info}
              </div>
            )}

            {authMode === 'signin' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() =>
                    switchMode('forgot')
                  }
                  disabled={loading}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50 dark:text-brand-400"
                >
                  Forgot password?
                </button>
              </div>
            )}

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
              disabled={loading}
              className="font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50 dark:text-brand-400"
            >
              {authMode === 'signin'
                ? 'Sign up'
                : 'Sign in'}
            </button>
          </p>
        </div>

        <div className="border-t border-gray-200 px-6 py-4 dark:border-brand-800">
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            © Copyright Saka Krib. All Rights Reserved.
          </p>
        </div>
      </div>
    </div>
  );
}