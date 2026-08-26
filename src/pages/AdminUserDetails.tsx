import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  User,
  Truck,
  Building2,
  FileText,
  Eye,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Car,
  CalendarDays,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import type {
  Profile,
  Mover,
  Subscription,
} from '@/lib/supabase';

import { cn } from '@/lib/utils';

/* ==================================================
   TYPES
================================================== */

type ReviewSection =
  | 'overview'
  | 'landlord-kyc'
  | 'mover-kyc'
  | 'landlord-form'
  | 'mover-form';

type ReviewStatus =
  | 'pending'
  | 'approved'
  | 'rejected';

interface UserData extends Profile {
  subscription?: Subscription | null;
}

interface MoverWithProfile extends Mover {
  profile?: Profile | null;
}

interface AdminUserDetailsProps {
  userId: string;
  onBack?: () => void;
}

/* ==================================================
   PROFILE SELECT
================================================== */

const PROFILE_SELECT = `
  id,
  email,
  full_name,
  first_name,
  last_name,
  middle_name,
  is_admin,
  role,
  kyc_completed,
  verification_status,
  landlord_application_status,
  mover_application_status,
  admin_review_note,
  national_id,
  dl_number,
  phone,
  profile_photo_url,
  id_photo_url,
  selfie_url,
  id_document_url,
  id_document_type,
  city,
  county,
  is_agency,
  free_listings_used,
  created_at,
  updated_at
`;

/* ==================================================
   MOVER SELECT
================================================== */

const MOVER_SELECT = `
  id,
  user_id,
  driver_full_name,
  business_name,
  national_id,
  dl_number,
  dl_photo_url,
  vehicle_type,
  number_plate,
  operating_city,
  operating_county,
  phone,
  profile_photo_url,
  base_rate_kes,
  capacity_details,
  is_available,
  approval_status,
  working_days,
  start_time,
  end_time,
  payment_channel,
  payment_account,
  liability_accepted,
  reference_contacts,
  created_at,
  updated_at
`;

/* ==================================================
   MAIN COMPONENT
================================================== */

export default function AdminUserDetails({
  userId,
  onBack,
}: AdminUserDetailsProps) {
  const [user, setUser] = useState<UserData | null>(null);

  const [movers, setMovers] = useState<MoverWithProfile[]>([]);

  const [selectedMover, setSelectedMover] =
    useState<MoverWithProfile | null>(null);

  const [section, setSection] =
    useState<ReviewSection>('overview');

  const [loading, setLoading] = useState(true);

  const [loadingMovers, setLoadingMovers] =
    useState(false);

  const [updating, setUpdating] = useState(false);

  const [error, setError] = useState<string | null>(null);

  /*
   * Optional note entered by the administrator.
   *
   * This is used for approve/reject/pending actions.
   */
  const [adminReviewNote, setAdminReviewNote] =
    useState('');

  /* ==================================================
     BACK HANDLER
  ================================================== */

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    window.history.back();
  };

  /* ==================================================
     LOAD USER
  ================================================== */

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setError('No user ID was provided.');
      return;
    }

    void loadUser();
  }, [userId]);

  /* ==================================================
     LOAD MOVER WHEN MOVER SECTION IS OPENED
  ================================================== */

  useEffect(() => {
    if (
      section !== 'mover-kyc' &&
      section !== 'mover-form'
    ) {
      return;
    }

    if (selectedMover) {
      return;
    }

    if (!userId) {
      return;
    }

    void loadMovers();
  }, [section, selectedMover, userId]);

  /* ==================================================
     LOAD USER
  ================================================== */

  const loadUser = async () => {
    if (!userId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const {
        data,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('id', userId)
        .single();

      if (profileError) {
        throw profileError;
      }

      if (!data) {
        throw new Error('User profile was not found.');
      }

      /* ==================================================
         LOAD LATEST SUBSCRIPTION
      ================================================== */

      let subscription: Subscription | null = null;

      if (data.role === 'landlord') {
        const {
          data: subscriptionRow,
          error: subscriptionError,
        } = await supabase
          .from('landlord_subscriptions')
          .select(`
            id,
            landlord_id,
            plan_id,
            billing_cycle,
            status,
            current_period_start,
            current_period_end,
            grace_period_end,
            auto_renew,
            created_at,
            updated_at,
            paypal_subscription_id,
            paypal_plan_id,
            paypal_status,
            next_billing_at,
            cancel_at_period_end,
            cancelled_at,
            billing_amount_kes,
            billing_amount_usd,
            billing_exchange_rate,
            billing_exchange_rate_timestamp,
            plan:subscription_plans (
              id,
              name,
              audience,
              max_listings,
              max_units_per_listing,
              monthly_price_kes,
              annual_price_kes
            )
          `)
          .eq('landlord_id', userId)
          .order('created_at', {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

        if (subscriptionError) {
          console.warn(
            'Unable to load landlord subscription:',
            subscriptionError.message
          );
        } else {
          subscription =
            (subscriptionRow as Subscription | null) ??
            null;
        }
      }

      setUser({
        ...(data as Profile),
        subscription,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load user.'
      );
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  /* ==================================================
     LOAD MOVERS FOR CURRENT USER
  ================================================== */

  const loadMovers = async () => {
    if (!userId) {
      return;
    }

    setLoadingMovers(true);
    setError(null);

    try {
      const {
        data: moverData,
        error: moverError,
      } = await supabase
        .from('movers')
        .select(MOVER_SELECT)
        .eq('user_id', userId)
        .order('created_at', {
          ascending: false,
        });

      if (moverError) {
        throw moverError;
      }

      const moverRows =
        (moverData || []) as Mover[];

      if (moverRows.length === 0) {
        setMovers([]);
        setSelectedMover(null);
        return;
      }

      const userIds = [
        ...new Set(
          moverRows
            .map((mover) => mover.user_id)
            .filter(Boolean)
        ),
      ];

      let profiles: Profile[] = [];

      if (userIds.length > 0) {
        const {
          data: profileData,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select(PROFILE_SELECT)
          .in('id', userIds);

        if (profileError) {
          throw profileError;
        }

        profiles =
          (profileData || []) as Profile[];
      }

      const combined: MoverWithProfile[] =
        moverRows.map((mover) => ({
          ...mover,
          profile:
            profiles.find(
              (profile) =>
                profile.id === mover.user_id
            ) || null,
        }));

      setMovers(combined);

      if (combined.length === 1) {
        setSelectedMover(combined[0]);

        setAdminReviewNote(
          combined[0].profile?.admin_review_note || ''
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load mover registration.'
      );

      setMovers([]);
    } finally {
      setLoadingMovers(false);
    }
  };

  /* ==================================================
     GET SINGLE MOVER
  ================================================== */

  const getMover = async (
    moverId: string
  ): Promise<MoverWithProfile | null> => {
    try {
      const {
        data,
        error: moverError,
      } = await supabase
        .from('movers')
        .select(MOVER_SELECT)
        .eq('id', moverId)
        .single();

      if (moverError || !data) {
        console.error(
          'Failed to reload mover:',
          moverError
        );

        return null;
      }

      const mover = data as Mover;

      let profile: Profile | null = null;

      if (mover.user_id) {
        const {
          data: profileData,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select(PROFILE_SELECT)
          .eq('id', mover.user_id)
          .single();

        if (profileError) {
          console.warn(
            'Failed to reload mover profile:',
            profileError.message
          );
        } else {
          profile =
            (profileData as Profile) || null;
        }
      }

      return {
        ...mover,
        profile,
      };
    } catch (err) {
      console.error(
        'Unexpected error loading mover:',
        err
      );

      return null;
    }
  };

  /* ==================================================
     UPDATE MOVER STATUS
  ================================================== */

  const updateMoverStatus = async (
    mover: MoverWithProfile,
    status: ReviewStatus,
    reviewNote?: string
  ) => {
    if (!mover.id) {
      return;
    }

    setUpdating(true);
    setError(null);

    const note =
      reviewNote?.trim() || null;

    try {
      /* ==================================================
         DATABASE STATUS
      ================================================== */

      const databaseStatus =
        status === 'pending'
          ? 'pending_review'
          : status;

      const now = new Date().toISOString();

      /* ==================================================
         1. UPDATE MOVER APPLICATION
      ================================================== */

      const {
        error: moverError,
      } = await supabase
        .from('movers')
        .update({
          approval_status: databaseStatus,
          updated_at: now,
        })
        .eq('id', mover.id);

      if (moverError) {
        throw moverError;
      }

      /* ==================================================
         2. UPDATE PROFILE APPLICATION STATUS
      ================================================== */

      if (mover.user_id) {
        const profileUpdate: Record<string, unknown> = {
          mover_application_status: status,
          admin_review_note: note,
          updated_at: now,
        };

        /*
         * Keep the existing verification behavior.
         */
        switch (status) {
          case 'approved':
            profileUpdate.verification_status =
              'verified';
            profileUpdate.kyc_completed = true;
            break;

          case 'rejected':
            profileUpdate.verification_status =
              'rejected';
            profileUpdate.kyc_completed = false;
            break;

          case 'pending':
            profileUpdate.verification_status =
              'pending_verification';
            profileUpdate.kyc_completed = false;
            break;
        }

        const {
          error: profileError,
        } = await supabase
          .from('profiles')
          .update(profileUpdate)
          .eq('id', mover.user_id);

        if (profileError) {
          throw profileError;
        }
      }

      /* ==================================================
         3. DETERMINE EMAIL TEMPLATE
      ================================================== */

      let emailType:
        | 'application_approved'
        | 'application_declined'
        | 'application_review';

      switch (status) {
        case 'approved':
          emailType = 'application_approved';
          break;

        case 'rejected':
          emailType = 'application_declined';
          break;

        case 'pending':
          emailType = 'application_review';
          break;

        default:
          throw new Error(
            `Unsupported application status: ${status}`
          );
      }

      /* ==================================================
         4. SEND STATUS EMAIL
      ================================================== */

      const recipientEmail =
        mover.profile?.email;

      if (recipientEmail) {
        const fullName =
          mover.profile?.full_name ||
          mover.driver_full_name ||
          'Applicant';

        const firstName =
          mover.profile?.first_name ||
          mover.driver_full_name
            ?.trim()
            .split(/\s+/)[0] ||
          'Applicant';

        const emailPayload = {
          email: recipientEmail,

          user: {
            id: mover.user_id,
            email: recipientEmail,
            full_name: fullName,
            first_name: firstName,
            role: 'mover',
          },

          applicant: {
            id: mover.user_id,
            email: recipientEmail,
            full_name: fullName,
            first_name: firstName,
            role: 'mover',
          },

          application_status: status,

          /*
           * Optional administrator explanation.
           *
           * Approved:
           *   may contain an optional note.
           *
           * Rejected:
           *   may contain the reason for rejection.
           *
           * Pending:
           *   may contain an optional review message.
           */
          admin_review_note: note,

          mover: {
            id: mover.id,
            user_id: mover.user_id,
            driver_full_name:
              mover.driver_full_name,
            business_name:
              mover.business_name,
            operating_city:
              mover.operating_city,
            operating_county:
              mover.operating_county,
          },
        };

        /*
         * The send-email Edge Function is responsible
         * for selecting the corresponding template:
         *
         * application_approved
         * application_declined
         * application_review
         */
        const {
          data: emailData,
          error: emailError,
        } = await supabase.functions.invoke(
          'send-email',
          {
            body: {
              type: emailType,
              to: recipientEmail,
              payload: emailPayload,
            },
          }
        );

        if (emailError) {
          console.error(
            'Application status updated but email failed:',
            emailError
          );

          setError(
            `Application ${status}, but the notification email could not be sent.`
          );
        } else if (
          emailData &&
          typeof emailData === 'object' &&
          'error' in emailData &&
          emailData.error
        ) {
          console.error(
            'Email function returned an error:',
            emailData.error
          );

          setError(
            `Application ${status}, but the notification email could not be sent.`
          );
        }
      } else {
        console.warn(
          'Application status updated but applicant has no email address.'
        );

        setError(
          `Application ${status}, but the applicant does not have an email address.`
        );
      }

      /* ==================================================
         5. RELOAD MOVER
      ================================================== */

      const refreshedMover =
        await getMover(mover.id);

      if (refreshedMover) {
        setSelectedMover(refreshedMover);

        setMovers((current) =>
          current.map((item) =>
            item.id === refreshedMover.id
              ? refreshedMover
              : item
          )
        );

        setAdminReviewNote(
          refreshedMover.profile?.admin_review_note ||
            note ||
            ''
        );
      }

      /* ==================================================
         6. RELOAD PARENT PROFILE
      ================================================== */

      if (
        userId &&
        mover.user_id === userId
      ) {
        await loadUser();
      }

      /*
       * Do not clear the note here.
       *
       * This allows the admin to see the saved note
       * after the action completes.
       */
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update mover status.'
      );
    } finally {
      setUpdating(false);
    }
  };

  /* ==================================================
     OPEN MOVER REVIEW
  ================================================== */

  const openMoverReview = (
    mover: MoverWithProfile
  ) => {
    setSelectedMover(mover);

    setAdminReviewNote(
      mover.profile?.admin_review_note || ''
    );

    setSection('mover-kyc');
    setError(null);
  };

  /* ==================================================
     GET NORMALIZED STATUS
  ================================================== */

  const getStatus = (
    mover: Mover
  ): ReviewStatus => {
    const status = String(
      mover.approval_status || ''
    ).toLowerCase();

    if (
      status === 'approved' ||
      status === 'rejected'
    ) {
      return status;
    }

    return 'pending';
  };

  /* ==================================================
     STATUS BADGE
  ================================================== */

  const statusBadge = (
    status: ReviewStatus
  ) => {
    if (status === 'approved') {
      return (
        <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
          <CheckCircle2 className="h-3 w-3" />
          Approved
        </span>
      );
    }

    if (status === 'rejected') {
      return (
        <span className="badge bg-error-50 text-error-700 dark:bg-error-900/30 dark:text-error-400">
          <XCircle className="h-3 w-3" />
          Rejected
        </span>
      );
    }

    return (
      <span className="badge bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
        <Clock className="h-3 w-3" />
        Pending
      </span>
    );
  };

  /* ==================================================
     DISPLAY NAME
  ================================================== */

  const displayName = (
    profile?: Profile | null
  ) =>
    profile?.full_name ||
    [
      profile?.first_name,
      profile?.middle_name,
      profile?.last_name,
    ]
      .filter(Boolean)
      .join(' ') ||
    'Unnamed User';

  /* ==================================================
     LOADING
  ================================================== */

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[500px] max-w-7xl items-center justify-center px-4">
        <div className="text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-brand-600" />

          <p className="mt-3 text-sm text-gray-500">
            Loading user...
          </p>
        </div>
      </div>
    );
  }

  /* ==================================================
     USER NOT FOUND
  ================================================== */

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <button
          type="button"
          onClick={handleBack}
          className="btn-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="card mt-6 p-8 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-error-500" />

          <p className="mt-3 font-semibold">
            User not found.
          </p>

          {error && (
            <p className="mt-2 text-sm text-error-600">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  /* ==================================================
     MOVER REVIEW
  ================================================== */

  if (
    selectedMover &&
    (
      section === 'mover-kyc' ||
      section === 'mover-form'
    )
  ) {
    const moverProfile =
      selectedMover.profile;

    const moverStatus =
      getStatus(selectedMover);

    return (
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">

        {/* Back */}
        <div className="mb-5">
          <button
            type="button"
            disabled={updating}
            onClick={() => {
              setSelectedMover(null);
              setSection('overview');
              setAdminReviewNote('');
              setError(null);
            }}
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-brand-600 disabled:opacity-50 dark:text-gray-300 dark:hover:text-brand-400"
          >
            <ArrowLeft className="h-5 w-5" />
            Back
          </button>
        </div>

        {/* Header */}
        <div className="card mb-5 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-brand-100 font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                {selectedMover.profile_photo_url ? (
                  <img
                    src={selectedMover.profile_photo_url}
                    alt={
                      selectedMover.driver_full_name ||
                      'Mover'
                    }
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Truck className="h-6 w-6" />
                )}
              </div>

              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  {selectedMover.driver_full_name ||
                    'Unnamed Mover'}
                </h1>

                <p className="text-sm text-gray-500">
                  {selectedMover.business_name ||
                    'Mover Registration'}
                </p>
              </div>
            </div>

            {statusBadge(moverStatus)}
          </div>
        </div>

        {/* Split Screen */}
        <div className="grid gap-5 lg:grid-cols-2">

          {/* LEFT - KYC */}
          <div className="card overflow-hidden">
            <div className="border-b border-gray-200 bg-brand-50 px-5 py-4 dark:border-brand-800 dark:bg-brand-900/40">
              <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                <ShieldCheck className="h-5 w-5 text-brand-600" />
                Mover KYC
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                Identity and verification information.
              </p>
            </div>

            <div className="space-y-5 p-5">

              <div className="grid gap-3 sm:grid-cols-2">
                <Info
                  label="Full Name"
                  value={
                    moverProfile?.full_name ||
                    selectedMover.driver_full_name
                  }
                  icon={User}
                />

                <Info
                  label="National ID"
                  value={
                    moverProfile?.national_id ||
                    selectedMover.national_id
                  }
                  icon={CreditCard}
                />

                <Info
                  label="Driving Licence"
                  value={
                    moverProfile?.dl_number ||
                    selectedMover.dl_number
                  }
                  icon={CreditCard}
                />

                <Info
                  label="Phone"
                  value={
                    moverProfile?.phone ||
                    selectedMover.phone
                  }
                  icon={Phone}
                />

                <Info
                  label="Email"
                  value={moverProfile?.email}
                  icon={Mail}
                />

                <Info
                  label="KYC Status"
                  value={
                    moverProfile?.kyc_completed
                      ? 'Completed'
                      : 'Not completed'
                  }
                  icon={ShieldCheck}
                />

                <Info
                  label="Verification"
                  value={
                    moverProfile?.verification_status
                  }
                  icon={ShieldCheck}
                />

                <Info
                  label="ID Document Type"
                  value={
                    moverProfile?.id_document_type
                  }
                  icon={FileText}
                />
              </div>

              <div>
                <h3 className="mb-3 text-sm font-bold text-gray-900 dark:text-white">
                  KYC Documents
                </h3>

                <div className="space-y-2">
                  {moverProfile?.id_document_url && (
                    <DocumentLink
                      label="Identity Document"
                      url={
                        moverProfile.id_document_url
                      }
                    />
                  )}

                  {moverProfile?.id_photo_url && (
                    <DocumentLink
                      label="ID Photo"
                      url={
                        moverProfile.id_photo_url
                      }
                    />
                  )}

                  {moverProfile?.selfie_url && (
                    <DocumentLink
                      label="Verification Selfie"
                      url={
                        moverProfile.selfie_url
                      }
                    />
                  )}

                  {selectedMover.dl_photo_url && (
                    <DocumentLink
                      label="Driving Licence"
                      url={
                        selectedMover.dl_photo_url
                      }
                    />
                  )}

                  {!moverProfile?.id_document_url &&
                    !moverProfile?.id_photo_url &&
                    !moverProfile?.selfie_url &&
                    !selectedMover.dl_photo_url && (
                      <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500 dark:bg-brand-900/40">
                        No KYC documents uploaded.
                      </div>
                    )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4 dark:border-brand-800">
                <p className="text-xs font-semibold uppercase text-gray-500">
                  Verification
                </p>

                <div className="mt-3">
                  {statusBadge(moverStatus)}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT - REGISTRATION */}
          <div className="card overflow-hidden">
            <div className="border-b border-gray-200 bg-success-50 px-5 py-4 dark:border-brand-800 dark:bg-success-900/10">
              <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                <FileText className="h-5 w-5 text-success-600" />
                Mover Registration
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                Information submitted during mover registration.
              </p>
            </div>

            <div className="space-y-5 p-5">

              <div className="grid gap-3 sm:grid-cols-2">

                <Info
                  label="Driver Name"
                  value={
                    selectedMover.driver_full_name
                  }
                  icon={User}
                />

                <Info
                  label="Business"
                  value={
                    selectedMover.business_name
                  }
                  icon={Building2}
                />

                <Info
                  label="National ID"
                  value={
                    selectedMover.national_id
                  }
                  icon={CreditCard}
                />

                <Info
                  label="Driving Licence"
                  value={
                    selectedMover.dl_number
                  }
                  icon={CreditCard}
                />

                <Info
                  label="Vehicle"
                  value={
                    selectedMover.vehicle_type
                  }
                  icon={Car}
                />

                <Info
                  label="Number Plate"
                  value={
                    selectedMover.number_plate
                  }
                  icon={Truck}
                />

                <Info
                  label="Operating City"
                  value={
                    selectedMover.operating_city
                  }
                  icon={MapPin}
                />

                <Info
                  label="Operating County"
                  value={
                    selectedMover.operating_county
                  }
                  icon={MapPin}
                />

                <Info
                  label="Phone"
                  value={
                    selectedMover.phone
                  }
                  icon={Phone}
                />

                <Info
                  label="Base Rate"
                  value={
                    selectedMover.base_rate_kes != null
                      ? `KES ${Number(
                          selectedMover.base_rate_kes
                        ).toLocaleString('en-KE')}`
                      : null
                  }
                  icon={CreditCard}
                />

                <Info
                  label="Availability"
                  value={
                    selectedMover.is_available
                      ? 'Available'
                      : 'Unavailable'
                  }
                  icon={CheckCircle2}
                />

                <Info
                  label="Start Time"
                  value={
                    selectedMover.start_time
                  }
                  icon={Clock}
                />

                <Info
                  label="End Time"
                  value={
                    selectedMover.end_time
                  }
                  icon={Clock}
                />

                <Info
                  label="Payment Channel"
                  value={
                    selectedMover.payment_channel
                  }
                  icon={CreditCard}
                />

                <Info
                  label="Payment Account"
                  value={
                    selectedMover.payment_account
                  }
                  icon={CreditCard}
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  Capacity
                </p>

                <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700 dark:bg-brand-900/40 dark:text-gray-300">
                  {formatValue(
                    selectedMover.capacity_details
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  Working Days
                </p>

                <div className="flex flex-wrap gap-2">
                  {Array.isArray(
                    selectedMover.working_days
                  ) &&
                  selectedMover.working_days.length > 0 ? (
                    selectedMover.working_days.map(
                      (day) => (
                        <span
                          key={String(day)}
                          className="badge bg-brand-50 capitalize text-brand-700 dark:bg-brand-800 dark:text-brand-200"
                        >
                          {String(day)}
                        </span>
                      )
                    )
                  ) : (
                    <span className="text-sm text-gray-500">
                      —
                    </span>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  Liability Agreement
                </p>

                <span
                  className={cn(
                    'badge',
                    selectedMover.liability_accepted
                      ? 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400'
                      : 'bg-error-50 text-error-700 dark:bg-error-900/30 dark:text-error-400'
                  )}
                >
                  {selectedMover.liability_accepted
                    ? 'Accepted'
                    : 'Not Accepted'}
                </span>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  References
                </p>

                <div className="space-y-2">
                  {Array.isArray(
                    selectedMover.reference_contacts
                  ) &&
                  selectedMover.reference_contacts.length > 0 ? (
                    selectedMover.reference_contacts.map(
                      (
                        reference: {
                          name?: string;
                          phone?: string;
                          relationship?: string;
                        },
                        index: number
                      ) => (
                        <div
                          key={`${reference.phone || 'reference'}-${index}`}
                          className="rounded-lg bg-gray-50 p-3 dark:bg-brand-900/40"
                        >
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {reference.name ||
                              'Unnamed Reference'}
                          </p>

                          <p className="text-xs text-gray-500">
                            {reference.phone ||
                              'No phone'}
                          </p>

                          <p className="text-xs capitalize text-gray-500">
                            {reference.relationship ||
                              'Relationship not provided'}
                          </p>
                        </div>
                      )
                    )
                  ) : (
                    <span className="text-sm text-gray-500">
                      No references provided.
                    </span>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  Registration Date
                </p>

                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {formatDate(
                    selectedMover.created_at
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ==================================================
            ADMIN REVIEW NOTE
        ================================================== */}

        <div className="card mt-5 p-5">
          <div className="mb-3">
            <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
              <FileText className="h-5 w-5 text-brand-600" />
              Admin Review Note
              <span className="text-xs font-normal text-gray-500">
                (optional)
              </span>
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              Add an optional message for the applicant. If
              provided, it will be included in the status
              notification email.
            </p>
          </div>

          <textarea
            value={adminReviewNote}
            onChange={(event) =>
              setAdminReviewNote(event.target.value)
            }
            disabled={updating}
            rows={4}
            maxLength={2000}
            placeholder="Optional reason, feedback, or review message..."
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-brand-800 dark:bg-brand-950 dark:text-white"
          />

          <div className="mt-2 flex justify-end">
            <span className="text-xs text-gray-400">
              {adminReviewNote.length}/2000
            </span>
          </div>
        </div>

        {/* ==================================================
            BOTTOM ACTIONS
        ================================================== */}

        <div className="card mt-5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

            <button
              type="button"
              disabled={updating}
              onClick={() => {
                setSelectedMover(null);
                setSection('overview');
                setAdminReviewNote('');
                setError(null);
              }}
              className="btn-secondary disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            <div className="flex flex-col gap-2 sm:flex-row">

              {/* REJECT */}
              <button
                type="button"
                disabled={updating}
                onClick={() =>
                  void updateMoverStatus(
                    selectedMover,
                    'rejected',
                    adminReviewNote
                  )
                }
                className="rounded-lg border border-error-200 bg-error-50 px-5 py-2.5 text-sm font-semibold text-error-700 hover:bg-error-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-900/50 dark:bg-error-900/20 dark:text-error-400"
              >
                {updating ? (
                  <RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-2 inline h-4 w-4" />
                )}

                {updating
                  ? 'Updating...'
                  : 'Reject'}
              </button>

              {/* PENDING */}
              <button
                type="button"
                disabled={updating}
                onClick={() =>
                  void updateMoverStatus(
                    selectedMover,
                    'pending',
                    adminReviewNote
                  )
                }
                className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {updating ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Clock className="mr-2 h-4 w-4" />
                )}

                {updating
                  ? 'Updating...'
                  : 'Set Pending'}
              </button>

              {/* APPROVE */}
              <button
                type="button"
                disabled={updating}
                onClick={() =>
                  void updateMoverStatus(
                    selectedMover,
                    'approved',
                    adminReviewNote
                  )
                }
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {updating ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}

                {updating
                  ? 'Updating...'
                  : 'Approve'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
            {error}
          </div>
        )}
      </div>
    );
  }

  /* ==================================================
     NORMAL USER DETAILS
  ================================================== */

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">

      {/* Back */}
      <button
        type="button"
        onClick={handleBack}
        className="mb-5 inline-flex items-center gap-2 rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-600 dark:hover:bg-brand-800"
        title="Back"
      >
        <ArrowLeft className="h-6 w-6" />
      </button>

      {/* Error */}
      {error && (
        <div className="mb-5 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
          {error}
        </div>
      )}

      {/* User header */}
      <div className="card mb-5 overflow-hidden">

        <div className="bg-gradient-to-r from-brand-50 to-brand-100 p-6 dark:from-brand-900/40 dark:to-brand-950">

          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">

            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-200 text-2xl font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">

              {user.profile_photo_url ? (
                <img
                  src={user.profile_photo_url}
                  alt={displayName(user)}
                  className="h-full w-full object-cover"
                />
              ) : (
                user.first_name?.charAt(0) ||
                user.full_name?.charAt(0) ||
                'U'
              )}

            </div>

            <div className="flex-1">

              <div className="flex flex-wrap items-center gap-2">

                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {displayName(user)}
                </h1>

                <span className="badge bg-brand-50 capitalize text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                  {formatValue(user.role)}
                </span>

              </div>

              <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">

                {user.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {user.email}
                  </span>
                )}

                {user.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {user.phone}
                  </span>
                )}

                {user.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {user.city}
                  </span>
                )}

              </div>
            </div>

            <div>
              {user.verification_status ===
              'verified' ? (
                <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Approved
                </span>
              ) : user.verification_status ===
                'rejected' ? (
                <span className="badge bg-error-50 text-error-700 dark:bg-error-900/30 dark:text-error-400">
                  <XCircle className="h-3 w-3" />
                  Rejected
                </span>
              ) : (
                <span className="badge bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
                  <Clock className="h-3 w-3" />
                  Pending
                </span>
              )}
            </div>

          </div>
        </div>

        {/* Navigation */}
        <div className="flex flex-wrap gap-2 border-t border-gray-200 p-4 dark:border-brand-800">

          <button
            type="button"
            onClick={() =>
              setSection('overview')
            }
            className={cn(
              'btn-secondary',
              section === 'overview' &&
                'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
            )}
          >
            <User className="h-4 w-4" />
            Overview
          </button>

          {user.role === 'landlord' && (
            <>
              <button
                type="button"
                onClick={() =>
                  setSection('landlord-kyc')
                }
                className={cn(
                  'btn-secondary',
                  section === 'landlord-kyc' &&
                    'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                )}
              >
                <ShieldCheck className="h-4 w-4" />
                Landlord KYC
              </button>

              <button
                type="button"
                onClick={() =>
                  setSection('landlord-form')
                }
                className={cn(
                  'btn-secondary',
                  section === 'landlord-form' &&
                    'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                )}
              >
                <FileText className="h-4 w-4" />
                Landlord Form
              </button>
            </>
          )}

          {user.role === 'mover' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelectedMover(null);
                  setSection('mover-kyc');
                }}
                className={cn(
                  'btn-secondary',
                  section === 'mover-kyc' &&
                    'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                )}
              >
                <ShieldCheck className="h-4 w-4" />
                Mover KYC
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedMover(null);
                  setSection('mover-form');
                }}
                className={cn(
                  'btn-secondary',
                  section === 'mover-form' &&
                    'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                )}
              >
                <FileText className="h-4 w-4" />
                Mover Form
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              if (user.role === 'landlord') {
                setSection('landlord-kyc');
                return;
              }

              if (user.role === 'mover') {
                setSelectedMover(null);
                setSection('mover-kyc');
                return;
              }

              setSection('overview');
            }}
            className="btn-primary"
          >
            <Eye className="h-4 w-4" />
            Review
          </button>

        </div>
      </div>

      {/* ==================================================
          OVERVIEW
      ================================================== */}

      {section === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-3">

          <div className="card p-5 lg:col-span-2">

            <h2 className="mb-4 font-bold text-gray-900 dark:text-white">
              Account Information
            </h2>

            <div className="grid gap-3 sm:grid-cols-2">

              <Info
                label="First Name"
                value={user.first_name}
                icon={User}
              />

              <Info
                label="Middle Name"
                value={user.middle_name}
                icon={User}
              />

              <Info
                label="Last Name"
                value={user.last_name}
                icon={User}
              />

              <Info
                label="Email"
                value={user.email}
                icon={Mail}
              />

              <Info
                label="Phone"
                value={user.phone}
                icon={Phone}
              />

              <Info
                label="City"
                value={user.city}
                icon={MapPin}
              />

              <Info
                label="County"
                value={user.county}
                icon={MapPin}
              />

              <Info
                label="Role"
                value={user.role}
                icon={User}
              />

              <Info
                label="KYC"
                value={
                  user.kyc_completed
                    ? 'Completed'
                    : 'Not completed'
                }
                icon={ShieldCheck}
              />

              <Info
                label="Created"
                value={formatDate(
                  user.created_at
                )}
                icon={CalendarDays}
              />

            </div>
          </div>

          <div className="card p-5">

            <h2 className="mb-4 font-bold text-gray-900 dark:text-white">
              Application Status
            </h2>

            <div className="space-y-3">

              <StatusRow
                label="Verification"
                value={
                  user.verification_status
                }
              />

              <StatusRow
                label="Landlord Application"
                value={
                  user.landlord_application_status
                }
              />

              <StatusRow
                label="Mover Application"
                value={
                  user.mover_application_status
                }
              />

              <StatusRow
                label="Admin Review Note"
                value={
                  user.admin_review_note
                }
              />

            </div>

            {user.subscription && (
              <div className="mt-5 border-t border-gray-200 pt-5 dark:border-brand-800">

                <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">
                  Subscription
                </h3>

                <div className="space-y-2">

                  <StatusRow
                    label="Plan"
                    value={
                      user.subscription.plan?.name ??
                      user.subscription.plan_id
                    }
                  />

                  <StatusRow
                    label="Status"
                    value={
                      user.subscription.status
                    }
                  />

                  <StatusRow
                    label="Billing Cycle"
                    value={
                      user.subscription.billing_cycle
                    }
                  />

                  <Info
                    label="Current Period Start"
                    value={formatDate(
                      user.subscription.current_period_start
                    )}
                    icon={CalendarDays}
                  />

                  <Info
                    label="Current Period End"
                    value={formatDate(
                      user.subscription.current_period_end
                    )}
                    icon={CalendarDays}
                  />

                  {user.subscription.grace_period_end && (
                    <Info
                      label="Grace Period Ends"
                      value={formatDate(
                        user.subscription.grace_period_end
                      )}
                      icon={Clock}
                    />
                  )}

                  <StatusRow
                    label="Auto Renew"
                    value={
                      user.subscription.auto_renew
                    }
                  />

                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ==================================================
          LANDLORD KYC
      ================================================== */}

      {section === 'landlord-kyc' &&
        user.role === 'landlord' && (
          <KycPanel
            title="Landlord KYC"
            user={user}
          />
        )}

      {/* ==================================================
          LANDLORD FORM
      ================================================== */}

      {section === 'landlord-form' &&
        user.role === 'landlord' && (
          <LandlordForm user={user} />
        )}

      {/* ==================================================
          MOVER LOADING
      ================================================== */}

      {(section === 'mover-kyc' ||
        section === 'mover-form') &&
        !selectedMover &&
        loadingMovers && (
          <div className="card p-10 text-center">

            <RefreshCw className="mx-auto h-7 w-7 animate-spin text-brand-600" />

            <p className="mt-3 text-sm text-gray-500">
              Loading mover registration...
            </p>

          </div>
        )}

      {/* ==================================================
          MOVER LIST
      ================================================== */}

      {(section === 'mover-kyc' ||
        section === 'mover-form') &&
        !selectedMover &&
        !loadingMovers && (

          <div className="card overflow-hidden">

            <div className="border-b border-gray-200 p-5 dark:border-brand-800">

              <div className="flex items-center justify-between">

                <div>
                  <h2 className="font-bold text-gray-900 dark:text-white">
                    Mover Registration
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Review the mover registration and KYC submitted by this user.
                  </p>
                </div>

                <Truck className="h-6 w-6 text-brand-600" />

              </div>
            </div>

            {movers.length === 0 ? (

              <div className="p-10 text-center">

                <Truck className="mx-auto h-10 w-10 text-gray-300" />

                <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-300">
                  No mover registration found for this user.
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  The user may not have submitted the mover registration form yet.
                </p>

              </div>

            ) : (

              <div className="divide-y divide-gray-100 dark:divide-brand-800">

                {movers.map((mover) => (

                  <div
                    key={mover.id}
                    className="flex flex-col gap-4 p-5 transition-colors hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-brand-900/30"
                  >

                    <div className="flex items-center gap-3">

                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-brand-100 font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">

                        {mover.profile_photo_url ? (
                          <img
                            src={
                              mover.profile_photo_url
                            }
                            alt={
                              mover.driver_full_name ||
                              'Mover'
                            }
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Truck className="h-5 w-5" />
                        )}

                      </div>

                      <div>

                        <p className="font-semibold text-gray-900 dark:text-white">
                          {mover.driver_full_name ||
                            'Unnamed Mover'}
                        </p>

                        <p className="text-xs text-gray-500">
                          {mover.business_name ||
                            mover.vehicle_type ||
                            'Mover'}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {mover.operating_city ||
                            '—'}

                          {mover.operating_county
                            ? `, ${mover.operating_county}`
                            : ''}
                        </p>

                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">

                      {statusBadge(
                        getStatus(mover)
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          openMoverReview(mover)
                        }
                        className="btn-primary"
                      >
                        <Eye className="h-4 w-4" />
                        View KYC & Registration
                      </button>

                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      {/* Bottom Back */}
      <div className="mt-6">

        <button
          type="button"
          onClick={handleBack}
          className="btn-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

      </div>
    </div>
  );
}

/* ==================================================
   LANDLORD KYC
================================================== */

function KycPanel({
  title,
  user,
}: {
  title: string;
  user: Profile;
}) {
  return (
    <div className="card p-5">

      <div className="mb-5 flex items-center gap-2">

        <ShieldCheck className="h-5 w-5 text-brand-600" />

        <h2 className="font-bold text-gray-900 dark:text-white">
          {title}
        </h2>

      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

        <Info
          label="Full Name"
          value={user.full_name}
          icon={User}
        />

        <Info
          label="National ID"
          value={user.national_id}
          icon={CreditCard}
        />

        <Info
          label="Phone"
          value={user.phone}
          icon={Phone}
        />

        <Info
          label="Email"
          value={user.email}
          icon={Mail}
        />

        <Info
          label="City"
          value={user.city}
          icon={MapPin}
        />

        <Info
          label="County"
          value={user.county}
          icon={MapPin}
        />

        <Info
          label="KYC"
          value={
            user.kyc_completed
              ? 'Completed'
              : 'Not completed'
          }
          icon={ShieldCheck}
        />

        <Info
          label="Verification"
          value={
            user.verification_status
          }
          icon={ShieldCheck}
        />

        <Info
          label="ID Document Type"
          value={
            user.id_document_type
          }
          icon={FileText}
        />

      </div>

      <div className="mt-6">

        <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">
          Documents
        </h3>

        <div className="space-y-2">

          {user.id_document_url && (
            <DocumentLink
              label="Identity Document"
              url={
                user.id_document_url
              }
            />
          )}

          {user.id_photo_url && (
            <DocumentLink
              label="ID Photo"
              url={
                user.id_photo_url
              }
            />
          )}

          {user.selfie_url && (
            <DocumentLink
              label="Selfie"
              url={
                user.selfie_url
              }
            />
          )}

          {!user.id_document_url &&
            !user.id_photo_url &&
            !user.selfie_url && (
              <p className="text-sm text-gray-500">
                No KYC documents uploaded.
              </p>
            )}

        </div>
      </div>
    </div>
  );
}

/* ==================================================
   LANDLORD FORM
================================================== */

function LandlordForm({
  user,
}: {
  user: Profile;
}) {
  return (
    <div className="card p-5">

      <div className="mb-5 flex items-center gap-2">

        <FileText className="h-5 w-5 text-brand-600" />

        <h2 className="font-bold text-gray-900 dark:text-white">
          Landlord Registration
        </h2>

      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

        <Info
          label="Full Name"
          value={user.full_name}
          icon={User}
        />

        <Info
          label="National ID"
          value={user.national_id}
          icon={CreditCard}
        />

        <Info
          label="Phone"
          value={user.phone}
          icon={Phone}
        />

        <Info
          label="Email"
          value={user.email}
          icon={Mail}
        />

        <Info
          label="City"
          value={user.city}
          icon={MapPin}
        />

        <Info
          label="County"
          value={user.county}
          icon={MapPin}
        />

        <Info
          label="Agency"
          value={
            user.is_agency
              ? 'Yes'
              : 'No'
          }
          icon={Building2}
        />

        <Info
          label="Application"
          value={
            user.landlord_application_status
          }
          icon={FileText}
        />

        <Info
          label="Admin Review Note"
          value={
            user.admin_review_note
          }
          icon={FileText}
        />

      </div>
    </div>
  );
}

/* ==================================================
   INFO COMPONENT
================================================== */

function Info({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value:
    | string
    | number
    | boolean
    | null
    | undefined;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-900/40">

      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">

        <Icon className="h-3.5 w-3.5" />

        {label}

      </p>

      <p className="mt-1 break-words text-sm font-semibold capitalize text-gray-900 dark:text-white">
        {formatValue(value)}
      </p>

    </div>
  );
}

/* ==================================================
   STATUS ROW
================================================== */

function StatusRow({
  label,
  value,
}: {
  label: string;
  value:
    | string
    | number
    | boolean
    | null
    | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3 dark:bg-brand-900/40">

      <span className="text-sm text-gray-500">
        {label}
      </span>

      <span className="max-w-[65%] text-right text-sm font-semibold capitalize text-gray-900 dark:text-white">
        {formatValue(value)}
      </span>

    </div>
  );
}

/* ==================================================
   DOCUMENT LINK
================================================== */

function DocumentLink({
  label,
  url,
}: {
  label: string;
  url: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between rounded-lg border border-gray-200 p-3 transition-colors hover:bg-gray-50 dark:border-brand-800 dark:hover:bg-brand-900/40"
    >

      <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">

        <FileText className="h-4 w-4 text-brand-600" />

        {label}

      </span>

      <Eye className="h-4 w-4 text-brand-600" />

    </a>
  );
}

/* ==================================================
   FORMAT VALUE
================================================== */

function formatValue(
  value:
    | string
    | number
    | boolean
    | null
    | undefined
): string {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '—';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  return String(value).replace(
    /_/g,
    ' '
  );
}

/* ==================================================
   FORMAT DATE
================================================== */

function formatDate(
  value:
    | string
    | null
    | undefined
): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    'en-KE',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }
  ).format(date);
}