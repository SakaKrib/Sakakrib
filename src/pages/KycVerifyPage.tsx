import { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  IdCard,
  Upload,
  Camera,
  CheckCircle2,
  Loader2,
  UserCheck,
  Fingerprint,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import {
  useNav,
  type AppView,
} from '@/context/NavContext';
import { supabase } from '@/lib/supabase';
import { validateNationalID, cn } from '@/lib/utils';
import TermsGate from '@/components/TermsGate';

type KycStep = 'idle' | 'uploading';

type UserRole =
  | 'landlord'
  | 'mover'
  | 'professional'
  | 'renter'
  | string
  | null
  | undefined;

/*
|--------------------------------------------------------------------------
| ROLE → REGISTRATION ROUTE
|--------------------------------------------------------------------------
|
| KYC is only responsible for identity verification.
| Once submitted, the user is sent to the registration form
| associated with their account role.
|
*/

function getRegistrationRoute(
  role: UserRole
): AppView | null {
  switch (role) {
    case 'landlord':
      return 'register-landlord';

    case 'mover':
      return 'register-mover';

    default:
      return null;
  }
}

/*
|--------------------------------------------------------------------------
| ROLE LABEL
|--------------------------------------------------------------------------
*/

function getRoleLabel(
  role: UserRole
): string {
  switch (role) {
    case 'landlord':
      return 'landlord';

    case 'mover':
      return 'mover';

    case 'professional':
      return 'professional';

    default:
      return 'professional';
  }
}

/*
|--------------------------------------------------------------------------
| KYC VERIFY PAGE
|--------------------------------------------------------------------------
*/

export default function KycVerifyPage() {
  const { profile, refreshProfile } = useAuth();
  const { navigate } = useNav();

  const [termsAccepted, setTermsAccepted] =
    useState(false);

  const [fullName, setFullName] = useState(
    profile?.full_name || ''
  );

  const [nationalId, setNationalId] = useState(
    profile?.national_id || ''
  );

  const [idPhotoPath, setIdPhotoPath] =
    useState('');

  const [selfiePath, setSelfiePath] =
    useState('');

  const [step, setStep] =
    useState<KycStep>('idle');

  const [error, setError] =
    useState<string | null>(null);



      /*
   * ------------------------------------------------------
   * REDIRECT AFTER EXISTING KYC STATUS
   * ------------------------------------------------------
   *
   * If the user already submitted KYC, there is no reason
   * to show the KYC form again.
   *
   * They should continue to their role-specific registration.
   *
   */

  useEffect(() => {
    if (!profile) {
      return;
    }

    const shouldContinue =
      profile.kyc_completed === true &&
      (
        profile.verification_status === 'pending_verification' ||
        profile.verification_status === 'verified'
      );

    if (!shouldContinue) {
      return;
    }

    const registrationRoute =
      getRegistrationRoute(profile.role);

    if (registrationRoute) {
      navigate(registrationRoute);
      return;
    }

    navigate('home');
  }, [profile, navigate]);

  /*
   * ------------------------------------------------------
   * NO PROFILE
   * ------------------------------------------------------
   */

  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl px-2 py-12">
        <div className="card p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            Please sign in to continue with identity
            verification.
          </p>
        </div>
      </div>
    );
  }

  const role = profile.role;



  /*
   * ------------------------------------------------------
   * FILE UPLOAD
   * ------------------------------------------------------
   */

  const handleFileUpload = async (
    file: File,
    type: 'id' | 'selfie'
  ) => {
    if (!profile) {
      return;
    }

    setError(null);

    try {
      /*
       * Basic client-side validation.
       */

      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
      ];

      if (!allowedTypes.includes(file.type)) {
        setError(
          'Please upload a JPG, PNG, or WebP image.'
        );

        return;
      }

      /*
       * Keep the KYC documents private.
       *
       * We store the storage path in the profile,
       * not a public URL.
       */

      const extension =
        file.name
          .split('.')
          .pop()
          ?.toLowerCase() || 'jpg';

      const filePath =
        `${profile.id}/${type}-${Date.now()}.${extension}`;

      const {
        error: uploadError,
      } = await supabase.storage
        .from('kyc-documents')
        .upload(
          filePath,
          file,
          {
            upsert: false,
            contentType: file.type,
          }
        );

      if (uploadError) {
        throw uploadError;
      }

      if (type === 'id') {
        setIdPhotoPath(filePath);
      } else {
        setSelfiePath(filePath);
      }
    } catch (err) {
      console.error(
        'KYC document upload failed:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to upload the document. Please try again.'
      );
    }
  };

  /*
   * ------------------------------------------------------
   * SUBMIT KYC
   * ------------------------------------------------------
   */

    const handleSubmit = async (
      e: React.FormEvent
    ) => {
      e.preventDefault();

      if (!profile) {
        return;
      }

      setError(null);

      const trimmedName = fullName.trim();
      const trimmedNationalId = nationalId.trim();

      /*
      * ------------------------------------------------------
      * VALIDATION
      * ------------------------------------------------------
      */

      if (!trimmedName) {
        setError(
          'Please enter your full name as it appears on your ID.'
        );
        return;
      }

      if (!validateNationalID(trimmedNationalId)) {
        setError(
          'National ID must contain 7-8 digits.'
        );
        return;
      }

      if (!idPhotoPath) {
        setError(
          'Please upload the front of your National ID.'
        );
        return;
      }

      if (!selfiePath) {
        setError(
          'Please upload a clear selfie.'
        );
        return;
      }

      if (!termsAccepted) {
        setError(
          'Please accept the terms before submitting your verification.'
        );
        return;
      }

      /*
      * ------------------------------------------------------
      * ROLE / REGISTRATION ROUTE
      * ------------------------------------------------------
      */

      const registrationRoute =
        getRegistrationRoute(profile.role);

      if (!registrationRoute) {
        setError(
          'We could not determine the registration type for your account. Please return to your account and try again.'
        );
        return;
      }

      setStep('uploading');

      /*
      * These paths were created by handleFileUpload().
      *
      * They are PRIVATE storage paths, NOT public URLs.
      *
      * Example:
      *
      *   user-id/id-123456789.jpg
      *   user-id/selfie-123456789.jpg
      */

      const uploadedPaths = [
        idPhotoPath,
        selfiePath,
      ];

      try {
        /*
        * ------------------------------------------------------
        * VERIFY THE ACTUAL FILES EXIST IN STORAGE
        * ------------------------------------------------------
        *
        * This prevents us from saving a path into profiles
        * when the corresponding Storage object does not exist.
        *
        * We intentionally use download() here because the
        * kyc-documents bucket is PRIVATE.
        */

        const verifyStorageObject = async (
          path: string,
          label: string
        ) => {
          const {
            data,
            error,
          } = await supabase.storage
            .from('kyc-documents')
            .download(path);

          if (error || !data) {
            console.error(
              `KYC ${label} Storage verification failed:`,
              error
            );

            throw new Error(
              `The uploaded ${label} could not be verified in secure storage. Please upload it again.`
            );
          }
        };

        await verifyStorageObject(
          idPhotoPath,
          'National ID'
        );

        await verifyStorageObject(
          selfiePath,
          'selfie'
        );

        /*
        * ------------------------------------------------------
        * SAVE KYC INFORMATION
        * ------------------------------------------------------
        *
        * Store the PRIVATE STORAGE PATHS.
        *
        * Do NOT generate public URLs for KYC documents.
        */

        const {
          error: updateError,
        } = await supabase
          .from('profiles')
          .update({
            full_name: trimmedName,

            national_id: trimmedNationalId,

            kyc_completed: true,

            id_photo_url: idPhotoPath,

            selfie_url: selfiePath,

          })
          .eq(
            'id',
            profile.id
          );

        if (updateError) {
          throw updateError;
        }

        /*
        * ------------------------------------------------------
        * REFRESH PROFILE
        * ------------------------------------------------------
        */

        await refreshProfile();

        /*
        * ------------------------------------------------------
        * SUCCESS
        * ------------------------------------------------------
        *
        * At this point:
        *
        * 1. National ID exists in kyc-documents
        * 2. Selfie exists in kyc-documents
        * 3. profiles.id_photo_url contains the ID storage path
        * 4. profiles.selfie_url contains the selfie storage path
        * 5. KYC is marked complete
        * 6. Verification is pending administrator verification
        */

        navigate(
          registrationRoute
        );

      } catch (err) {
        console.error(
          'KYC submission failed:',
          err
        );

        /*
        * ------------------------------------------------------
        * CLEANUP
        * ------------------------------------------------------
        *
        * If the database update failed after the files had
        * already been uploaded, remove those newly uploaded
        * objects so we don't leave orphaned KYC documents.
        *
        * Cleanup errors are logged but do not replace the
        * original submission error.
        */

        try {
          const {
            error: cleanupError,
          } = await supabase.storage
            .from('kyc-documents')
            .remove(uploadedPaths);

          if (cleanupError) {
            console.warn(
              'KYC Storage cleanup failed:',
              cleanupError
            );
          }
        } catch (cleanupErr) {
          console.warn(
            'KYC Storage cleanup threw an error:',
            cleanupErr
          );
        }

        /*
        * Reset local paths because the uploaded files were
        * removed during cleanup.
        */

        setIdPhotoPath('');
        setSelfiePath('');

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to submit your verification. Please try again.'
        );

        setStep('idle');
      }
    };

  /*
   * ------------------------------------------------------
   * FORM
   * ------------------------------------------------------
   */

  return (
    <div className="mx-auto max-w-3xl px-2 py-8 sm:px-6">

      {/* Header */}

      <div className="mb-6">
        <div className="flex items-start gap-3">

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-800/50">
            <ShieldCheck className="h-6 w-6 text-brand-600 dark:text-brand-400" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Identity Verification
            </h1>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Verify your identity before continuing
              with your{' '}
              {getRoleLabel(role)} registration.
            </p>
          </div>

        </div>
      </div>

      {/* Information Notice */}

      <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-900/30">

        <div className="flex gap-3">

          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />

          <div>

            <h3 className="text-sm font-semibold text-brand-900 dark:text-brand-200">
              Why do we need this?
            </h3>

            <p className="mt-1 text-sm leading-6 text-brand-700 dark:text-brand-300">
              We use your identity information to help
              protect the Saka Krib community and confirm
              that your account belongs to a legitimate
              individual.
            </p>

          </div>

        </div>

      </div>

      <TermsGate
        context={
          role === 'mover'
            ? 'mover'
            : 'landlord'
        }
        onAccept={() =>
          setTermsAccepted(true)
        }
      >

        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >

          {/* =================================================
              PERSONAL INFORMATION
          ================================================= */}

          <div className="card p-6">

            <div className="mb-5">

              <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">

                <UserCheck className="h-5 w-5 text-brand-600" />

                Personal Information

              </h3>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Enter your details exactly as they
                appear on your identification document.
              </p>

            </div>

            <div className="grid gap-5 sm:grid-cols-2">

              {/* Full Name */}

              <div>

                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Full Name
                </label>

                <input
                  type="text"
                  value={fullName}
                  onChange={(e) =>
                    setFullName(
                      e.target.value
                    )
                  }
                  placeholder="John Mwangi"
                  className="input-field"
                  autoComplete="name"
                  required
                />

              </div>

              {/* National ID */}

              <div>

                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  National ID Number
                </label>

                <div className="relative">

                  <IdCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                  <input
                    type="text"
                    inputMode="numeric"
                    value={nationalId}
                    onChange={(e) =>
                      setNationalId(
                        e.target.value
                          .replace(
                            /\D/g,
                            ''
                          )
                          .slice(
                            0,
                            8
                          )
                      )
                    }
                    placeholder="12345678"
                    className="input-field pl-10"
                    maxLength={8}
                    autoComplete="off"
                    required
                  />

                </div>

                <p className="mt-1 text-xs text-gray-400">
                  Enter your 7-8 digit Kenyan National
                  ID number.
                </p>

              </div>

            </div>

          </div>

          {/* =================================================
              IDENTITY DOCUMENTS
          ================================================= */}

          <div className="card p-6">

            <div className="mb-5">

              <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">

                <Fingerprint className="h-5 w-5 text-brand-600" />

                Identity Documents

              </h3>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Upload clear and readable images. Avoid
                glare, blur, shadows, or cropped documents.
              </p>

            </div>

            <div className="grid gap-5 sm:grid-cols-2">

              {/* National ID */}

              <div>

                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  National ID — Front
                </label>

                <UploadBox
                  onUpload={(file) =>
                    handleFileUpload(
                      file,
                      'id'
                    )
                  }
                  uploaded={
                    Boolean(
                      idPhotoPath
                    )
                  }
                  label="National ID"
                />

              </div>

              {/* Selfie */}

              <div>

                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Selfie
                </label>

                <UploadBox
                  onUpload={(file) =>
                    handleFileUpload(
                      file,
                      'selfie'
                    )
                  }
                  uploaded={
                    Boolean(
                      selfiePath
                    )
                  }
                  label="Selfie"
                />

              </div>

            </div>

            <div className="mt-4 rounded-xl bg-gray-50 p-3 dark:bg-brand-800/40">

              <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                Your documents are stored securely and
                are only used for identity verification
                and account security purposes.
              </p>

            </div>

          </div>

          {/* =================================================
              WHAT HAPPENS NEXT
          ================================================= */}

          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-900/20">

            <div className="flex gap-3">

              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />

              <div>

                <h3 className="text-sm font-semibold text-brand-900 dark:text-brand-200">
                  What happens after verification?
                </h3>

                <p className="mt-1 text-sm leading-6 text-brand-700 dark:text-brand-300">
                  After you submit your identity
                  information, you will continue to your{' '}
                  {getRoleLabel(role)} registration form.
                  Your identity information will not need
                  to be submitted again.
                </p>

              </div>

            </div>

          </div>

          {/* =================================================
              ERROR
          ================================================= */}

          {error && (
            <div
              className="rounded-xl border border-error-200 bg-error-50 px-2 py-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-400"
              role="alert"
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
              step === 'uploading'
            }
            className="btn-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
          >

            {step === 'uploading' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />

                Submitting verification...
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />

                Continue to Registration
              </>
            )}

          </button>

        </form>

      </TermsGate>

      <p className="mt-8 text-center text-xs text-gray-400">
        © Copyright Saka Krib. All Rights Reserved.
      </p>

    </div>
  );
}


/* -------------------------------------------------------------------------- */
/* Upload Box                                                                  */
/* -------------------------------------------------------------------------- */

function UploadBox({
  onUpload,
  uploaded,
  label,
}: {
  onUpload: (file: File) => void;
  uploaded: boolean;
  label: string;
}) {
  const inputRef =
    useRef<HTMLInputElement>(null);

  return (
    <button
      type="button"
      onClick={() =>
        inputRef.current?.click()
      }
      className={cn(
        'flex h-40 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all',
        'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
        uploaded
          ? 'border-success-400 bg-success-50 hover:border-success-500 dark:border-success-600 dark:bg-success-900/20'
          : 'border-gray-300 bg-gray-50 hover:border-brand-400 hover:bg-brand-50/50 dark:border-brand-700 dark:bg-brand-800/20 dark:hover:border-brand-500'
      )}
    >

      {uploaded ? (
        <>
          <CheckCircle2 className="h-8 w-8 text-success-600 dark:text-success-400" />

          <p className="mt-2 text-sm font-semibold text-success-700 dark:text-success-400">
            {label} uploaded
          </p>

          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Click to replace
          </p>
        </>
      ) : (
        <>
          {label === 'Selfie' ? (
            <Camera className="h-8 w-8 text-gray-400" />
          ) : (
            <Upload className="h-8 w-8 text-gray-400" />
          )}

          <p className="mt-2 text-sm font-medium text-gray-600 dark:text-gray-300">
            Upload {label}
          </p>

          <p className="mt-1 text-xs text-gray-400">
            JPG, PNG or WebP
          </p>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file =
            e.target.files?.[0];

          if (file) {
            onUpload(file);
          }

          e.target.value = '';
        }}
      />

    </button>
  );
}