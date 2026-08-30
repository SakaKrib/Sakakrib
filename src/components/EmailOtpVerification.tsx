import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';

import {
  ArrowLeft,
  CheckCircle2,
  Mail,
  RefreshCw,
} from 'lucide-react';

import { cn } from '@/lib/utils';

interface EmailOtpVerificationProps {
  email: string;

  loading?: boolean;

  onVerify: (
    otp: string
  ) => Promise<{
    error: string | null;
  }>;

  onResend: () => Promise<{
    error: string | null;
  }>;

  /**
   * Allows the user to return to the previous
   * registration/login screen.
   *
   * This is the ONLY way the verification modal
   * can be dismissed before successful verification.
   */
  onBack?: () => void;

  onVerified?: () => void;
}

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

/* ============================================================
 * MASK EMAIL
 * ============================================================
 *
 * The real email is still used internally.
 * Only the UI representation is masked.
 *
 * Examples:
 *
 * william@gmail.com
 *       ↓
 * wi*****@gmail.com
 *
 * user@example.com
 *       ↓
 * u***@example.com
 *
 * w@gmail.com
 *       ↓
 * *@gmail.com
 */
function maskEmail(email: string): string {
  const normalized = email.trim();

  const atIndex = normalized.lastIndexOf('@');

  if (atIndex <= 0) {
    return '***';
  }

  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);

  if (!domain) {
    return '***';
  }

  if (localPart.length <= 1) {
    return `*@${domain}`;
  }

  if (localPart.length === 2) {
    return `${localPart[0]}*@${domain}`;
  }

  if (localPart.length <= 4) {
    return `${localPart.slice(0, 1)}***@${domain}`;
  }

  return `${localPart.slice(0, 2)}${'*'.repeat(
    Math.min(localPart.length - 2, 5)
  )}@${domain}`;
}

export default function EmailOtpVerification({
  email,
  loading = false,
  onVerify,
  onResend,
  onBack,
  onVerified,
}: EmailOtpVerificationProps) {
  const [otp, setOtp] = useState('');

  const [error, setError] =
    useState<string | null>(null);

  const [info, setInfo] = useState(
    'We sent a verification code to your email address.'
  );

  const [verifying, setVerifying] =
    useState(false);

  const [resending, setResending] =
    useState(false);

  const [cooldown, setCooldown] = useState(
    RESEND_COOLDOWN_SECONDS
  );

  const [verified, setVerified] =
    useState(false);

  const inputRef =
    useRef<HTMLInputElement>(null);

  /*
   * Prevent duplicate OTP verification requests.
   */
  const verificationStartedRef =
    useRef(false);

  /*
   * Masked email is ONLY for display.
   *
   * The original email is still passed to:
   *
   * onVerify()
   * onResend()
   */
  const maskedEmail = maskEmail(email);

  /* ==========================================================
   * FOCUS OTP INPUT
   * ======================================================== */

  useEffect(() => {
    if (!verified) {
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }
  }, [verified]);

  /* ==========================================================
   * PREVENT ESCAPE FROM DISMISSING MODAL
   * ======================================================== */

  useEffect(() => {
    const preventEscape = (
      event: KeyboardEvent
    ) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener(
      'keydown',
      preventEscape,
      true
    );

    return () => {
      document.removeEventListener(
        'keydown',
        preventEscape,
        true
      );
    };
  }, []);

  /* ==========================================================
   * RESEND COOLDOWN
   * ======================================================== */

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldown((current) =>
        current > 0
          ? current - 1
          : 0
      );
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [cooldown]);

  /* ==========================================================
   * OTP INPUT
   * ======================================================== */

  const handleOtpChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    if (
      verified ||
      verifying ||
      loading
    ) {
      return;
    }

    const value =
      event.target.value
        .replace(/\D/g, '')
        .slice(0, OTP_LENGTH);

    setOtp(value);
    setError(null);
  };

  /* ==========================================================
   * AUTOMATIC OTP VERIFICATION
   * ======================================================== */

  useEffect(() => {
    if (
      otp.length !== OTP_LENGTH ||
      verifying ||
      loading ||
      verified ||
      verificationStartedRef.current
    ) {
      return;
    }

    verificationStartedRef.current = true;

    const verify = async () => {
      setVerifying(true);
      setError(null);
      setInfo('');

      try {
        /*
         * IMPORTANT:
         *
         * The real email and OTP are passed to
         * the verification handler.
         *
         * The email is NOT displayed here.
         */
        const result =
          await onVerify(otp);

        /* -----------------------------------------------
         * VERIFICATION FAILED
         *
         * Modal stays open.
         * --------------------------------------------- */

        if (result.error) {
          setError(result.error);
          setOtp('');

          verificationStartedRef.current =
            false;

          window.setTimeout(() => {
            inputRef.current?.focus();
          }, 0);

          return;
        }

        /* -----------------------------------------------
         * VERIFICATION SUCCEEDED
         * --------------------------------------------- */

        setVerified(true);

        setInfo(
          'Your email has been verified successfully.'
        );

        /*
         * Parent is notified only after the
         * database/application verification succeeds.
         */
        onVerified?.();
      } catch (verificationError) {
        console.error(
          'OTP verification error:',
          verificationError
        );

        setError(
          verificationError instanceof Error
            ? verificationError.message
            : 'Unable to verify the code. Please try again.'
        );

        setOtp('');

        verificationStartedRef.current =
          false;

        window.setTimeout(() => {
          inputRef.current?.focus();
        }, 0);
      } finally {
        setVerifying(false);
      }
    };

    void verify();
  }, [
    otp,
    verifying,
    loading,
    verified,
    onVerify,
    onVerified,
  ]);

  /* ==========================================================
   * RESEND OTP
   * ======================================================== */

  const handleResend = async () => {
    if (
      cooldown > 0 ||
      resending ||
      verifying ||
      loading ||
      verified
    ) {
      return;
    }

    setError(null);
    setInfo('');
    setOtp('');

    verificationStartedRef.current =
      false;

    setResending(true);

    try {
      /*
       * onResend internally uses the real email.
       * The UI never needs to expose it.
       */
      const result =
        await onResend();

      if (result.error) {
        setError(result.error);
        return;
      }

      setInfo(
        'A new verification code has been sent to your email.'
      );

      setCooldown(
        RESEND_COOLDOWN_SECONDS
      );

      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } catch (resendError) {
      console.error(
        'OTP resend error:',
        resendError
      );

      setError(
        resendError instanceof Error
          ? resendError.message
          : 'Unable to resend the verification code.'
      );
    } finally {
      setResending(false);
    }
  };

  /* ==========================================================
   * BACK NAVIGATION
   * ======================================================== */

  const handleBack = () => {
    /*
     * Do not allow Back while a verification
     * request is actively being processed.
     *
     * This prevents abandoning an in-flight request.
     */
    if (
      verifying ||
      resending ||
      loading ||
      verified
    ) {
      return;
    }

    /*
     * Parent controls what "Back" means.
     *
     * Usually this should return to the
     * registration/login screen.
     */
    onBack?.();
  };

  const isBusy =
    loading ||
    verifying ||
    resending;

  /*
   * The modal remains blocking until:
   *
   * 1. OTP verification succeeds, OR
   * 2. the user explicitly presses Back.
   *
   * Clicking the backdrop does NOTHING.
   * Escape does NOTHING.
   * There is no X close button.
   */
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-950/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-verification-title"
    >
      {/* =====================================================
          BLOCKING BACKDROP
      ====================================================== */}

      <div
        className="absolute inset-0"
        aria-hidden="true"
      />

      {/* =====================================================
          MODAL
      ====================================================== */}

      <div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-brand-900"
        onClick={(event) => {
          /*
           * Prevent clicks from propagating.
           */
          event.stopPropagation();
        }}
      >
        {/* ===================================================
            HEADER
        ==================================================== */}

        <div className="border-b border-gray-200 px-6 py-5 dark:border-brand-800">
          <div className="flex items-center gap-3">

            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-800">
              <Mail className="h-6 w-6 text-brand-600 dark:text-brand-400" />
            </div>

            <div>
              <h2
                id="email-verification-title"
                className="text-lg font-bold text-gray-900 dark:text-white"
              >
                Verify your email
              </h2>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Verification required
              </p>
            </div>

          </div>
        </div>

        {/* ===================================================
            BODY
        ==================================================== */}

        <div className="space-y-5 p-6">

          {/* Email */}
          <div className="text-center">

            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter the 6-digit verification code
              we sent to:
            </p>

            {/*
             * SECURITY:
             *
             * Only masked email is displayed.
             */}
            <p
              className="mt-2 text-sm font-semibold text-gray-900 dark:text-white"
              title="Verification email"
            >
              {maskedEmail}
            </p>

          </div>

          {/* =================================================
              OTP
          ================================================== */}

          <div>

            <label
              htmlFor="email-otp"
              className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Verification code
            </label>

            <input
              ref={inputRef}
              id="email-otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              value={otp}
              onChange={handleOtpChange}
              disabled={
                isBusy ||
                verified
              }
              maxLength={OTP_LENGTH}
              placeholder="000000"
              autoFocus
              aria-label="6-digit email verification code"
              className={cn(
                'input-field w-full text-center text-2xl font-semibold tracking-[0.45em]',
                error &&
                  'border-error-500 focus:border-error-500'
              )}
            />

            {!verified && (
              <p className="mt-2 text-center text-xs text-gray-400">
                Enter all 6 digits to verify automatically.
              </p>
            )}

          </div>

          {/* =================================================
              ERROR
          ================================================== */}

          {error && (
            <div
              className="rounded-lg bg-error-50 px-2 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* =================================================
              INFO
          ================================================== */}

          {info && (
            <div
              className="rounded-lg bg-success-50 px-2 py-3 text-sm text-success-700 dark:bg-success-900/20 dark:text-success-400"
              role="status"
            >
              {info}
            </div>
          )}

          {/* =================================================
              VERIFYING
          ================================================== */}

          {verifying && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Verifying your email...
            </div>
          )}

          {/* =================================================
              SUCCESS
          ================================================== */}

          {verified && (
            <div className="rounded-lg bg-success-50 px-2 py-3 dark:bg-success-900/20">

              <div className="flex items-center justify-center gap-2 text-sm font-semibold text-success-600 dark:text-success-400">
                <CheckCircle2 className="h-5 w-5" />
                Email verified successfully
              </div>

              <p className="mt-2 text-center text-xs text-success-600/80 dark:text-success-400/80">
                Continuing...
              </p>

            </div>
          )}

          {/* =================================================
              RESEND
          ================================================== */}

          {!verified && (
            <div className="text-center">

              <button
                type="button"
                onClick={handleResend}
                disabled={
                  cooldown > 0 ||
                  resending ||
                  verifying ||
                  loading
                }
                className={cn(
                  'inline-flex items-center gap-2 text-sm font-semibold',

                  cooldown > 0 ||
                    resending ||
                    verifying ||
                    loading
                    ? 'cursor-not-allowed text-gray-400'
                    : 'text-brand-600 hover:text-brand-700 dark:text-brand-400'
                )}
              >

                <RefreshCw
                  className={cn(
                    'h-4 w-4',
                    resending &&
                      'animate-spin'
                  )}
                />

                {resending
                  ? 'Sending...'
                  : cooldown > 0
                    ? `Resend code in ${cooldown}s`
                    : 'Resend verification code'}

              </button>

            </div>
          )}

          {/* =================================================
              BACK
          ================================================== */}

          {!verified && onBack && (
            <div className="border-t border-gray-200 pt-4 dark:border-brand-800">

              <button
                type="button"
                onClick={handleBack}
                disabled={isBusy}
                className={cn(
                  'mx-auto flex items-center gap-2 text-sm font-medium transition-colors',
                  isBusy
                    ? 'cursor-not-allowed text-gray-400'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                )}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>

            </div>
          )}

          {/* =================================================
              REQUIRED NOTICE
          ================================================== */}

          {!verified && (
            <div className="text-center">

              <p className="text-xs text-gray-400">
                Email verification is required before
                you can continue using Saka Krib.
              </p>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}