
import { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  FileText,
  Mail,
  Phone,
  User,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  IdCard,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import TermsGate from '@/components/TermsGate';
import DocumentCapture from '@/components/DocumentCapture';
import {
  protectedPatch,
  protectedPost,
  protectedFunctionPost,
} from '@/lib/djangoLegacyApi';

import {
  validateEmail,
  validatePhone,
  validateNationalID
} from '@/lib/utils';

type EmailType =
  | 'landlord_application_submitted'
  | 'landlord_admin_notification';

export default function RegisterLandlordPage() {
  const { profile, refreshProfile } = useAuth();
  const { navigate, setAuthModalOpen, setRoleModalOpen } = useNav();

  const [termsAccepted, setTermsAccepted] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [sendingEmail, setSendingEmail] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState(false);

  const [firstName, setFirstName] =
    useState(profile?.first_name || '');

  const [middleName, setMiddleName] =
    useState(profile?.middle_name || '');

  const [lastName, setLastName] =
    useState(profile?.last_name || '');

  const [email, setEmail] =
    useState(profile?.email || '');

  const [phone, setPhone] =
    useState(profile?.phone || '');

  const [nationalId, setNationalId] =
    useState(profile?.national_id || '');

  const [documentType, setDocumentType] =
    useState<'national_id' | 'passport'>(
      'national_id'
    );

  const [documentUrl, setDocumentUrl] = useState(
    profile?.id_document_url?.trim() || ''
  );

  /*
   * ------------------------------------------------------
   * NO PROFILE
   * ------------------------------------------------------
   */

  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-2 py-20 text-center">
        <div className="card p-8">
          <Building2 className="mx-auto h-10 w-10 text-brand-600" />

          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
            Sign in required
          </h2>

          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Please sign in to continue with landlord registration.
          </p>

          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            className="btn-primary mt-6"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  /*
   * ------------------------------------------------------
   * APPROVED LANDLORD
   * ------------------------------------------------------
   */
    /*
    * ------------------------------------------------------
    * LANDLORD APPLICATION — APPROVED
    * ------------------------------------------------------
    */

    if (
      profile.landlord_application_status === 'approved'
    ) {
      return (
        <StatusCard
          icon="success"
          title="Landlord application approved"
          message="Your landlord application has been approved. You can now manage your properties from your dashboard."
          actionLabel="Open Dashboard"
          onAction={() => navigate('dashboard')}
        />
      );
    }

    /*
    * ------------------------------------------------------
    * LANDLORD APPLICATION — PENDING
    * ------------------------------------------------------
    */

    if (
      profile.landlord_application_status === 'pending'
    ) {
      return (
        <StatusCard
          icon="pending"
          title="Landlord application pending"
          message="Your landlord application has been submitted and is currently waiting for administrator verification. You cannot submit another application while this request is being reviewed."
        />
      );
    }

    /*
    * ------------------------------------------------------
    * LANDLORD — KYC INCOMPLETE
    * ------------------------------------------------------
    */

    if (
      profile.role === 'landlord' &&
      profile.kyc_completed === false
    ) {
      return (
        <StatusCard
          icon="warning"
          title="Complete your identity verification"
          message="Your identity verification has not been completed. Please complete KYC before continuing with landlord registration."
          actionLabel="Complete KYC"
          onAction={() => navigate('kyc-verify')}
        />
      );
    }

    /*
    * ------------------------------------------------------
    * RENTER — ROLE SELECTION REQUIRED
    * ------------------------------------------------------
    */

    if (profile.role === 'renter') {
      return (
        <StatusCard
          icon="warning"
          title="Choose your professional role"
          message="Before becoming a landlord, please confirm your professional role."
          actionLabel="Choose Role"
          onAction={() => setRoleModalOpen(true)}
        />
      );
    }

    /*
    * ------------------------------------------------------
    * UNSUPPORTED ROLE
    * ------------------------------------------------------
    */

    if (
      profile.role !== null &&
      profile.role !== 'landlord'
    ) {
      return (
        <StatusCard
          icon="blocked"
          title="Landlord registration unavailable"
          message="Your current account role does not allow landlord registration."
          actionLabel="Home"
          onAction={() => navigate('home')}
        />
      );
    }

/*
 * ------------------------------------------------------
 * LANDLORD + KYC COMPLETE
 * ------------------------------------------------------
 *
 * If the user reaches this point:
 *
 * role = landlord
 * kyc_completed = true
 * landlord_application_status = not_requested/rejected
 *
 * Therefore the landlord registration form is rendered
 * below.
 */

/*
 * ------------------------------------------------------
 * LANDLORD + KYC COMPLETE
 * ------------------------------------------------------
 *
 * Fall through to the actual registration form.
 */
  /*
   * ------------------------------------------------------
   * SEND REGISTRATION EMAIL
   * ------------------------------------------------------
   *
   * Email credentials remain inside the Supabase Edge
   * Function. React never receives SMTP credentials.
   *
   * IMPORTANT:
   * Email failure does NOT invalidate the application.
   * The application has already been saved successfully.
   */

  async function sendRegistrationEmail(
    type: EmailType,
    applicationData: Record<string, unknown>
  ): Promise<boolean> {
    try {
      await protectedFunctionPost(
        '/send-notification-emails',
        {
          type,
          application: applicationData,
        }
      );

      return true;
    } catch (error) {
      console.error(
        `Failed to request ${type} email:`,
        error
      );

      return false;
    }
  }


  const effectiveDocumentUrl =
    documentUrl.trim() ||
    profile.id_document_url?.trim() ||
    '';

  /*
   * ------------------------------------------------------
   * SUBMIT LANDLORD APPLICATION
   * ------------------------------------------------------
   */

  const handleSubmit = async (
  event: React.FormEvent
) => {
  event.preventDefault();

  if (!profile) {
    setError(
      'Please sign in before continuing.'
    );
    return;
  }

  setError(null);

  /*
   * --------------------------------------------------
   * ACCOUNT / ROLE VALIDATION
   * --------------------------------------------------
   */

  if (profile.role !== 'landlord') {
    setError(
      'Your account is not registered as a landlord.'
    );
    return;
  }

  /*
   * KYC must already be completed
   */

  if (profile.kyc_completed !== true) {
    setError(
      'Please complete identity verification before submitting your landlord application.'
    );
    return;
  }

  /*
   * --------------------------------------------------
   * NORMALIZE INPUT
   * --------------------------------------------------
   */

  const trimmedFirstName =
    firstName.trim();

  const trimmedMiddleName =
    middleName.trim();

  const trimmedLastName =
    lastName.trim();

  const trimmedEmail =
    email.trim();

  const trimmedPhone =
    phone.trim();

  const trimmedNationalId =
    nationalId.trim();

  const trimmedDocumentUrl =
  effectiveDocumentUrl;

  /*
   * --------------------------------------------------
   * PERSONAL DETAILS
   * --------------------------------------------------
   */

  if (
    !trimmedFirstName ||
    !trimmedLastName
  ) {
    setError(
      'First name and last name are required.'
    );
    return;
  }

  /*
   * --------------------------------------------------
   * EMAIL
   * --------------------------------------------------
   */

  if (!validateEmail(trimmedEmail)) {
    setError(
      'Please enter a valid email address.'
    );
    return;
  }

  /*
   * --------------------------------------------------
   * PHONE
   * --------------------------------------------------
   */

  if (!validatePhone(trimmedPhone)) {
    setError(
      'Please enter a valid Kenyan phone number.'
    );
    return;
  }

  /*
   * --------------------------------------------------
   * NATIONAL ID / PASSPORT
   * --------------------------------------------------
   */

  if (!trimmedNationalId) {
    setError(
      'Please enter your National ID or Passport number.'
    );
    return;
  }

  /*
   * Validate Kenyan National ID only when
   * document type is National ID.
   */

  if (
    documentType === 'national_id' &&
    !validateNationalID(trimmedNationalId)
  ) {
    setError(
      'National ID must contain 7-8 digits.'
    );
    return;
  }

  /*
   * --------------------------------------------------
   * IDENTITY DOCUMENT
   * --------------------------------------------------
   *
   * DocumentCapture must have successfully uploaded
   * the image before this form can be submitted.
   */

  if (!trimmedDocumentUrl) {
    setError(
      'Please upload or capture your identity document before submitting.'
    );
    return;
  }

  /*
   * --------------------------------------------------
   * TERMS
   * --------------------------------------------------
   */

  if (!termsAccepted) {
    setError(
      'Please accept the required terms before continuing.'
    );
    return;
  }

  setSubmitting(true);

  try {
    /*
     * --------------------------------------------------
     * BUILD FULL NAME
     * --------------------------------------------------
     */

    const fullName = [
      trimmedFirstName,
      trimmedMiddleName,
      trimmedLastName,
    ]
      .filter(Boolean)
      .join(' ');

      /*
      * --------------------------------------------------
      * SAVE IDENTITY DOCUMENT TO PROFILES FIRST
      * --------------------------------------------------
      *
      * DocumentCapture uploads the actual image to
      * Supabase Storage and gives us documentUrl.
      *
      * The profile update itself must go through the
      * protected-api proxy so the browser never performs
      * a direct authenticated Supabase database mutation.
      */

      try {
        await protectedPatch(
          `/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`,
          {
            id_document_url:
              trimmedDocumentUrl,

            id_document_type:
              documentType,
          }
        );
      } catch (documentSaveError) {
        console.error(
          'Identity document database save failed:',
          documentSaveError
        );

        setError(
          'We could not save your identity document. Please try again.'
        );

        return;
      }

      /*
      * --------------------------------------------------
      * BUILD APPLICATION
      * --------------------------------------------------
      */

      const application = {
        applicant_id:
          profile.id,

        applicant_email:
          trimmedEmail,

        applicant_name:
          fullName,

        first_name:
          trimmedFirstName,

        middle_name:
          trimmedMiddleName,

        last_name:
          trimmedLastName,

        phone:
          trimmedPhone,

        national_id:
          trimmedNationalId,

        document_type:
          documentType,

        document_url:
          trimmedDocumentUrl,

        application_type:
          'landlord',

        submitted_at:
          new Date().toISOString(),
      };

      /*
      * --------------------------------------------------
      * SAVE LANDLORD APPLICATION
      * --------------------------------------------------
      *
      * submit_landlord_application is an authenticated
      * database RPC, so call it through protected-api.
      */

      let landlordResult:
        | {
            success?: boolean;
            code?: string;
            message?: string;
          }
        | null = null;

      try {
        landlordResult =
          await protectedPost(
            '/rest/v1/rpc/submit_landlord_application',
            {
              p_first_name:
                trimmedFirstName,

              p_middle_name:
                trimmedMiddleName,

              p_last_name:
                trimmedLastName,

              p_email:
                trimmedEmail,

              p_phone:
                trimmedPhone,

              p_national_id:
                trimmedNationalId,

              p_document_type:
                documentType,

              p_document_url:
                trimmedDocumentUrl,
            }
          );
      } catch (landlordSubmissionError) {
        console.error(
          'Landlord registration failed:',
          landlordSubmissionError
        );

        setError(
          landlordSubmissionError instanceof Error
            ? landlordSubmissionError.message
            : 'We could not save your landlord registration. Please try again.'
        );

        return;
      }

      /*
      * --------------------------------------------------
      * HANDLE RPC BUSINESS-LOGIC FAILURE
      * --------------------------------------------------
      */

      if (
        landlordResult &&
        typeof landlordResult === 'object' &&
        'success' in landlordResult &&
        landlordResult.success === false
      ) {
        setError(
          landlordResult.message ||
            'We could not save your landlord registration. Please try again.'
        );

        return;
      }

      /*
      * --------------------------------------------------
      * REFRESH PROFILE
      * --------------------------------------------------
      */

      try {
        await refreshProfile();
      } catch (profileRefreshError) {
        console.error(
          'Profile refresh after landlord submission failed:',
          profileRefreshError
        );
      }

      /*
      * --------------------------------------------------
      * EMAIL APPLICANT
      * --------------------------------------------------
      *
      * Email failure does NOT invalidate the saved
      * application.
      */

      await sendRegistrationEmail(
        'landlord_application_submitted',
        application
      );

      /*
      * --------------------------------------------------
      * EMAIL ADMIN
      * --------------------------------------------------
      */

      await sendRegistrationEmail(
        'landlord_admin_notification',
        application
      );

      /*
      * --------------------------------------------------
      * SUCCESS
      * --------------------------------------------------
      */

      setSuccess(true);


  } catch (submissionError) {
    console.error(
      'Landlord submission failed:',
      submissionError
    );

    setError(
      submissionError instanceof Error
        ? submissionError.message
        : 'Something went wrong while submitting your landlord registration. Please try again.'
    );
  } finally {
    setSubmitting(false);
  }
};

  /*
   * ------------------------------------------------------
   * SUCCESS SCREEN
   * ------------------------------------------------------
   */

  if (success) {
    return (
      <div className="mx-auto max-w-2xl px-2 py-12">

        <div className="card animate-scale-in p-8 text-center">

          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
            <CheckCircle2 className="h-10 w-10 text-success-600 dark:text-success-400" />
          </div>

          <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
            Landlord registration submitted
          </h2>

          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Your landlord application has been
            successfully submitted and is now waiting
            for administrator verification.
          </p>

          <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4 text-left dark:border-brand-700 dark:bg-brand-900/20">

            <div className="flex gap-3">

              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />

              <div>

                <p className="font-semibold text-brand-900 dark:text-brand-200">
                  Confirmation email sent
                </p>

                <p className="mt-1 text-sm text-brand-700 dark:text-brand-300">
                  We have sent a confirmation to your
                  registered email address. Our
                  administration team has also been
                  notified to review your landlord
                  application.
                </p>

              </div>

            </div>

          </div>

          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left dark:border-brand-700 dark:bg-brand-800/30">

            <div className="flex gap-3">

              <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />

              <div>

                <p className="font-semibold text-gray-900 dark:text-white">
                  What happens next?
                </p>

                <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
                  Our team will review your identity
                  information. Once your application is
                  approved, you will be able to access
                  landlord features and set up your PMS
                  subscription.
                </p>

              </div>

            </div>

          </div>

          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">

            <button
              type="button"
              onClick={() =>
                navigate('dashboard')
              }
              className="btn-primary inline-flex items-center justify-center gap-2"
            >
              Go to Dashboard
              <ArrowRight className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() =>
                navigate('post-listing')
              }
              className="btn-secondary"
            >
              View Listing Requirements
            </button>

          </div>

        </div>

      </div>
    );
  }

  /*
   * ------------------------------------------------------
   * REGISTRATION FORM
   * ------------------------------------------------------
   */

  return (
    <div className="mx-auto max-w-3xl px-2 py-8 sm:px-6">

      {/* Header */}

      <div className="mb-6 flex items-center gap-3">

        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success-100 dark:bg-success-900/30">
          <Building2 className="h-6 w-6 text-success-600 dark:text-success-400" />
        </div>

        <div>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Landlord / Real Estate Owner
          </h1>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Create a verified professional profile
            for managing your properties.
          </p>

        </div>

      </div>

      <TermsGate
        context="landlord"
        onAccept={() =>
          setTermsAccepted(true)
        }
      >

        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >

          {/* =================================================
              PERSONAL DETAILS
          ================================================= */}

          <section className="card p-6">

            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">

              <User className="h-5 w-5 text-brand-600" />

              Personal details

            </h3>

            <div className="grid gap-4 sm:grid-cols-2">

              <Field
                label="First Name"
                required
                value={firstName}
                onChange={setFirstName}
                placeholder="Jane"
              />

              <Field
                label="Last Name"
                required
                value={lastName}
                onChange={setLastName}
                placeholder="Wanjiku"
              />

              <Field
                label="Middle Name"
                value={middleName}
                onChange={setMiddleName}
                placeholder="Optional"
              />

              <Field
                label="Email Address"
                required
                value={email}
                onChange={setEmail}
                placeholder="jane@example.com"
                type="email"
                icon={Mail}
              />

              <Field
                label="Phone Number"
                required
                value={phone}
                onChange={setPhone}
                placeholder="0712345678"
                type="tel"
                icon={Phone}
              />

              <Field
                label="National ID / Passport Number"
                required
                value={nationalId}
                onChange={setNationalId}
                placeholder="ID or passport number"
                icon={IdCard}
              />

            </div>

          </section>

          {/* =================================================
              IDENTITY DOCUMENT
          ================================================= */}

          <section className="card p-6">

            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">

              <FileText className="h-5 w-5 text-brand-600" />

              Identity document

            </h3>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setDocumentType('national_id');
                  setError(null);
                }}
                aria-pressed={documentType === 'national_id'}
                className={`btn-secondary transition-all ${
                  documentType === 'national_id'
                    ? '!border-2 !border-brand-600 !bg-brand-100 !text-brand-800 shadow-sm dark:!border-brand-400 dark:!bg-brand-900/40 dark:!text-brand-200'
                    : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  {documentType === 'national_id' && (
                    <CheckCircle2 className="h-4 w-4" />
                  )}

                  National ID
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDocumentType('passport');
                  setError(null);
                }}
                aria-pressed={documentType === 'passport'}
                className={`btn-secondary transition-all ${
                  documentType === 'passport'
                    ? '!border-2 !border-brand-600 !bg-brand-100 !text-brand-800 shadow-sm dark:!border-brand-400 dark:!bg-brand-900/40 dark:!text-brand-200'
                    : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  {documentType === 'passport' && (
                    <CheckCircle2 className="h-4 w-4" />
                  )}

                  Passport
                </span>
              </button>
            </div>

            <DocumentCapture
              bucket="id-documents"
              userId={profile.id}
              label="Identity document photo"
              currentUrl={documentUrl}
              onUploaded={setDocumentUrl}
            />

          </section>

          {/* =================================================
              TERMS
          ================================================= */}

          <section className="card p-6">

            <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-brand-700 dark:bg-brand-800/30">

              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(event) =>
                  setTermsAccepted(
                    event.target.checked
                  )
                }
                className="mt-1 h-5 w-5 rounded text-brand-600"
              />

              <span className="text-sm leading-6 text-gray-700 dark:text-gray-300">

                I confirm that the information I have
                provided is accurate and belongs to me,
                and I agree to the Saka Crib Landlord
                Terms and Conditions, verification
                requirements and property management
                policies.

              </span>

            </label>

          </section>

          {/* =================================================
              ERROR
          ================================================= */}

          {error && (
            <div
              role="alert"
              className="rounded-lg bg-error-50 px-2 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400"
            >
              {error}
            </div>
          )}

          {/* =================================================
              SUBMIT
          ================================================= */}

          <button
            type="submit"
            disabled={
              !termsAccepted ||
              submitting
            }
            className="btn-primary flex w-full items-center justify-center gap-2"
          >

            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />

                {sendingEmail
                  ? 'Sending confirmation...'
                  : 'Submitting registration...'}
              </>
            ) : (
              <>
                Submit Landlord Registration

                <ArrowRight className="h-4 w-4" />
              </>
            )}

          </button>

        </form>

      </TermsGate>

    </div>
  );
}

/*
|--------------------------------------------------------------------------
| STATUS CARD
|--------------------------------------------------------------------------
*/

function StatusCard({
  title,
  message,
  actionLabel,
  onAction,
  icon = 'default',
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?:
    | 'default'
    | 'success'
    | 'pending'
    | 'warning'
    | 'blocked';
}) {
  const Icon =
    icon === 'success'
      ? CheckCircle2
      : icon === 'warning'
      ? ShieldAlert
      : icon === 'pending'
      ? Loader2
      : ShieldCheck;

  const iconClass =
    icon === 'success'
      ? 'text-success-600'
      : icon === 'warning'
      ? 'text-warning-600'
      : icon === 'pending'
      ? 'animate-spin text-brand-600'
      : 'text-brand-600';

  return (
    <div className="mx-auto max-w-md px-2 py-20">

      <div className="card p-8 text-center">

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/30">

          <Icon
            className={`h-7 w-7 ${iconClass}`}
          />

        </div>

        <h2 className="mt-5 text-xl font-bold text-gray-900 dark:text-white">
          {title}
        </h2>

        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          {message}
        </p>

        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="btn-primary mt-6 inline-flex items-center gap-2"
          >
            {actionLabel}

            <ArrowRight className="h-4 w-4" />

          </button>
        )}

      </div>

    </div>
  );
}

/*
|--------------------------------------------------------------------------
| FIELD
|--------------------------------------------------------------------------
*/

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
  type = 'text',
  icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
  icon?: typeof Mail;
}) {
  return (
    <div>

      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">

        {label}

        {required && (
          <span className="text-error-500">
            {' '}
            *
          </span>
        )}

      </label>

      <div className="relative">

        {Icon && (
          <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        )}

        <input
          type={type}
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          placeholder={placeholder}
          className={`input-field ${
            Icon ? 'pl-10' : ''
          }`}
          required={required}
        />

      </div>

    </div>
  );
}
