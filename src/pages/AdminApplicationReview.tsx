import {
  CalendarDays,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  FileText,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  User,
  UserCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import type {
  Profile,
  Listing,
  Subscription,
  SubscriptionPlan,
  VerificationStatus,
} from '@/lib/supabase';

import openKycDocument from '@/Dashboards/openPrivateDocsHelper';

/* ============================================================
   TYPES
============================================================ */

export type ReviewStatus =
  | 'pending'
  | 'approved'
  | 'rejected';

export interface ApplicationRecord {
  id: string;
  user_id: string;

  email: string | null;
  full_name: string | null;

  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;

  phone: string | null;
  national_id: string | null;

  city: string | null;
  county: string | null;

  is_agency: boolean | null;

  id_document_url: string | null;
  id_document_type:
    | ''
    | 'national_id'
    | 'passport'
    | null;

  landlord_application_status:
    | 'not_requested'
    | 'pending'
    | 'approved'
    | 'rejected'
    | null;

  real_estate_application_status:
    | 'not_requested'
    | 'pending'
    | 'approved'
    | 'rejected'
    | null;

  verification_status:
    | VerificationStatus
    | string
    | null;

  kyc_completed: boolean | null;

  admin_review_note: string | null;

  created_at: string | null;
  updated_at: string | null;
}

/**
 * Alias for compatibility with existing landlord code.
 */
export type LandlordApplication = ApplicationRecord;

/**
 * Real Estate uses the same application fields.
 */
export type RealEstateApplication = ApplicationRecord;

export interface ApplicationFormProps {
  user: Profile;

  application:
    | ApplicationRecord
    | null;

  updating: boolean;

  adminReviewNote: string;

  onReviewNoteChange: (
    value: string
  ) => void;

  onUpdateStatus: (
    status: ReviewStatus,
    reviewNote?: string
  ) => void | Promise<void>;

  applicationType:
    | 'landlord'
    | 'real_estate';
}

export interface PropertiesPanelProps {
  listings: Listing[];
  loading: boolean;
  role:
    | 'landlord'
    | 'real_estate';
}

export interface SubscriptionPanelProps {
  subscription:
    | Subscription
    | null
    | undefined;

  role:
    | 'landlord'
    | 'real_estate';
}

/* ============================================================
   LANDLORD FORM
============================================================ */

export function LandlordForm({
  user,
  application,
  updating,
  adminReviewNote,
  onReviewNoteChange,
  onUpdateStatus,
}: Omit<
  ApplicationFormProps,
  'applicationType'
>) {
  return (
    <ApplicationFormView
      user={user}
      application={application}
      updating={updating}
      adminReviewNote={adminReviewNote}
      onReviewNoteChange={onReviewNoteChange}
      onUpdateStatus={onUpdateStatus}
      applicationType="landlord"
    />
  );
}

/* ============================================================
   REAL ESTATE FORM
============================================================ */

export function RealEstateForm({
  user,
  application,
  updating,
  adminReviewNote,
  onReviewNoteChange,
  onUpdateStatus,
}: Omit<
  ApplicationFormProps,
  'applicationType'
>) {
  return (
    <ApplicationFormView
      user={user}
      application={application}
      updating={updating}
      adminReviewNote={adminReviewNote}
      onReviewNoteChange={onReviewNoteChange}
      onUpdateStatus={onUpdateStatus}
      applicationType="real_estate"
    />
  );
}

/* ============================================================
   SHARED APPLICATION FORM
============================================================ */

function ApplicationFormView({
  user,
  application,
  updating,
  adminReviewNote,
  onReviewNoteChange,
  onUpdateStatus,
  applicationType,
}: ApplicationFormProps) {
  const app: ApplicationRecord =
    application ?? {
      id: user.id,
      user_id: user.id,

      email: user.email ?? null,
      full_name: user.full_name ?? null,

      first_name: user.first_name ?? null,
      middle_name: user.middle_name ?? null,
      last_name: user.last_name ?? null,

      phone: user.phone ?? null,
      national_id: user.national_id ?? null,

      city: user.city ?? null,
      county: user.county ?? null,

      is_agency: user.is_agency ?? false,

      id_document_url:
        user.id_document_url ?? null,

      id_document_type:
        user.id_document_type ?? null,

      landlord_application_status:
        user.landlord_application_status ??
        null,

      real_estate_application_status:
        user.real_estate_application_status ??
        null,

      verification_status:
        user.verification_status ?? null,

      kyc_completed:
        user.kyc_completed ?? false,

      admin_review_note:
        user.admin_review_note ?? null,

      created_at:
        user.created_at ?? null,

      updated_at:
        user.updated_at ?? null,
    };

  const isRealEstate =
    applicationType === 'real_estate';

  const applicationLabel =
    isRealEstate
      ? 'Real Estate Application'
      : 'Landlord Application';

  const applicationStatus =
    isRealEstate
      ? app.real_estate_application_status
      : app.landlord_application_status;

  const normalizedStatus =
    String(
      applicationStatus ?? ''
    ).toLowerCase();

  const currentStatus: ReviewStatus =
    normalizedStatus === 'approved'
      ? 'approved'
      : normalizedStatus === 'rejected'
        ? 'rejected'
        : 'pending';

  return (
    <div className="space-y-5">

      {/* ==================================================
          HEADER / STATUS
      ================================================== */}

      <div className="card overflow-hidden">

        <div className="border-b border-gray-200 bg-brand-50 px-5 py-4 dark:border-brand-800 dark:bg-brand-900/40">

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

            <div>

              <div className="flex items-center gap-2">

                <FileText className="h-5 w-5 text-brand-600" />

                <h2 className="font-bold text-gray-900 dark:text-white">
                  {applicationLabel}
                </h2>

              </div>

              <p className="mt-1 text-xs text-gray-500">
                Information submitted during the application.
              </p>

            </div>

            {statusBadge(currentStatus)}

          </div>

        </div>

        {/* ==================================================
            APPLICATION INFORMATION
        ================================================== */}

        <div className="p-5">

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

            <Info
              label="Full Name"
              value={
                app.full_name ??
                user.full_name
              }
              icon={User}
            />

            <Info
              label="First Name"
              value={
                app.first_name ??
                user.first_name
              }
              icon={User}
            />

            <Info
              label="Middle Name"
              value={
                app.middle_name ??
                user.middle_name
              }
              icon={User}
            />

            <Info
              label="Last Name"
              value={
                app.last_name ??
                user.last_name
              }
              icon={User}
            />

            <Info
              label="National ID"
              value={
                app.national_id ??
                user.national_id
              }
              icon={CreditCard}
            />

            <Info
              label="Phone"
              value={
                app.phone ??
                user.phone
              }
              icon={Phone}
            />

            <Info
              label="Email"
              value={
                app.email ??
                user.email
              }
              icon={Mail}
            />

            <Info
              label="City"
              value={
                app.city ??
                user.city
              }
              icon={MapPin}
            />

            <Info
              label="County"
              value={
                app.county ??
                user.county
              }
              icon={MapPin}
            />

            <Info
              label="Application Type"
              value={
                isRealEstate
                  ? 'Real Estate'
                  : 'Landlord'
              }
              icon={Building2}
            />

            <Info
              label="Agency"
              value={
                isRealEstate
                  ? 'Yes'
                  : app.is_agency
              }
              icon={Building2}
            />

            <Info
              label="Application Status"
              value={applicationStatus}
              icon={FileText}
            />

            <Info
              label="Verification"
              value={
                app.verification_status ??
                user.verification_status
              }
              icon={ShieldCheck}
            />

            <Info
              label="KYC Completion"
              value={
                app.kyc_completed
                  ? 'Completed'
                  : 'Not completed'
              }
              icon={ShieldCheck}
            />

            <Info
              label="Created"
              value={formatDate(
                app.created_at ??
                user.created_at
              )}
              icon={CalendarDays}
            />

          </div>

        </div>

      </div>

      {/* ==================================================
          KYC INFORMATION
      ================================================== */}

      <KycPanel
        title={`${isRealEstate ? 'Real Estate' : 'Landlord'} KYC`}
        user={user}
      />

      {/* ==================================================
          ADMIN REVIEW NOTE
      ================================================== */}

      <div className="card p-5">

        <div className="mb-3">

          <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">

            <FileText className="h-5 w-5 text-brand-600" />

            Admin Review Note

            <span className="text-xs font-normal text-gray-500">
              (optional)
            </span>

          </h2>

          <p className="mt-1 text-xs text-gray-500">
            Add an optional message for the applicant.
            If provided, it will be included in the
            application status notification email.
          </p>

        </div>

        <textarea
          value={adminReviewNote}
          onChange={(event) =>
            onReviewNoteChange(
              event.target.value
            )
          }
          disabled={updating}
          rows={4}
          maxLength={2000}
          placeholder="Optional reason, feedback, or review message..."
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-brand-800 dark:bg-brand-950 dark:text-white"
        />

        <div className="mt-2 flex justify-end">

          <span className="text-xs text-gray-400">
            {adminReviewNote.length}/2000
          </span>

        </div>

      </div>

      {/* ==================================================
          ADMIN ACTIONS
      ================================================== */}

      <div className="card p-4">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

          <div>

            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Application Decision
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Set the application status after reviewing
              the submitted information and KYC.
            </p>

          </div>

          <div className="flex flex-col gap-2 sm:flex-row">

            <button
              type="button"
              disabled={updating}
              onClick={() =>
                void onUpdateStatus(
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

            <button
              type="button"
              disabled={updating}
              onClick={() =>
                void onUpdateStatus(
                  'pending',
                  adminReviewNote
                )
              }
              className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >

              {updating ? (
                <RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />
              ) : (
                <Clock className="mr-2 inline h-4 w-4" />
              )}

              {updating
                ? 'Updating...'
                : 'Set Pending'}

            </button>

            <button
              type="button"
              disabled={updating}
              onClick={() =>
                void onUpdateStatus(
                  'approved',
                  adminReviewNote
                )
              }
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >

              {updating ? (
                <RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 inline h-4 w-4" />
              )}

              {updating
                ? 'Updating...'
                : 'Approve'}

            </button>

          </div>

        </div>

      </div>

      {/* ==================================================
          SAVED REVIEW NOTE
      ================================================== */}

      {app.admin_review_note && (

        <div className="card p-5">

          <div className="flex items-start gap-3">

            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />

            <div>

              <p className="text-sm font-bold text-gray-900 dark:text-white">
                Current Admin Review Note
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
                {app.admin_review_note}
              </p>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}

/* ============================================================
   KYC PANEL
============================================================ */

export function KycPanel({
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
          value={user.verification_status}
          icon={ShieldCheck}
        />

        <Info
          label="ID Document Type"
          value={user.id_document_type}
          icon={FileText}
        />

      </div>

      <div className="mt-6">

        <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">
          Documents
        </h3>

        <div className="space-y-2">

          {user.id_document_url && (
            <DocumentRow
              title="ID Document"
              description="Identity document uploaded"
              url={user.id_document_url}
              onOpen={async (path) => {
                const message =
                  await openKycDocument(
                    path,
                    'id'
                  );

                if (message) {
                  console.error(message);
                }
              }}
            />
          )}

          {user.id_photo_url && (
            <DocumentRow
              title="ID Photo"
              description="ID photo uploaded"
              url={user.id_photo_url}
              onOpen={async (path) => {
                const message =
                  await openKycDocument(
                    path,
                    'id'
                  );

                if (message) {
                  console.error(message);
                }
              }}
            />
          )}

          {user.selfie_url && (
            <DocumentRow
              title="Selfie"
              description="Selfie uploaded"
              url={user.selfie_url}
              onOpen={async (path) => {
                const message =
                  await openKycDocument(
                    path,
                    'id'
                  );

                if (message) {
                  console.error(message);
                }
              }}
            />
          )}

          {!user.id_document_url &&
            !user.id_photo_url &&
            !user.selfie_url && (

              <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500 dark:bg-brand-900/40">
                No KYC documents uploaded.
              </div>

          )}

        </div>

      </div>

    </div>
  );
}

/* ============================================================
   LANDLORD PROPERTIES
============================================================ */

export function LandlordPropertiesPanel({
  listings,
  loading,
}: {
  listings: Listing[];
  loading: boolean;
}) {
  return (
    <PropertiesPanel
      listings={listings}
      loading={loading}
      role="landlord"
    />
  );
}

/* ============================================================
   REAL ESTATE PROPERTIES
============================================================ */

export function RealEstatePropertiesPanel({
  listings,
  loading,
}: {
  listings: Listing[];
  loading: boolean;
}) {
  return (
    <PropertiesPanel
      listings={listings}
      loading={loading}
      role="real_estate"
    />
  );
}

/* ============================================================
   SHARED PROPERTIES PANEL
============================================================ */

function PropertiesPanel({
  listings,
  loading,
  role,
}: PropertiesPanelProps) {
  const label =
    role === 'real_estate'
      ? 'real estate'
      : 'landlord';

  if (loading) {
    return (
      <div className="card p-10 text-center">

        <RefreshCw className="mx-auto h-7 w-7 animate-spin text-brand-600" />

        <p className="mt-3 text-sm text-gray-500">
          Loading {label} properties...
        </p>

      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="card p-10 text-center">

        <Building2 className="mx-auto h-10 w-10 text-gray-300" />

        <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-300">
          No properties/listings found for this {label}.
        </p>

      </div>
    );
  }

  return (
    <div className="space-y-4">

      {listings.map((listing) => (

        <div
          key={listing.id}
          className="card overflow-hidden"
        >

          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">

            <div className="flex-1">

              <div className="flex flex-wrap items-center gap-2">

                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {listing.title ||
                    'Untitled listing'}
                </h3>

                <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                  {formatValue(
                    listing.listing_type
                  )}
                </span>

              </div>

              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                {listing.description ||
                  'No description provided.'}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

                <Info
                  label="City"
                  value={listing.city}
                  icon={MapPin}
                />

                <Info
                  label="County"
                  value={listing.county}
                  icon={MapPin}
                />

                <Info
                  label="Price"
                  value={
                    listing.price_kes != null
                      ? `KES ${Number(
                          listing.price_kes
                        ).toLocaleString('en-KE')}`
                      : null
                  }
                  icon={CreditCard}
                />

                <Info
                  label="Beds"
                  value={listing.beds}
                  icon={Building2}
                />

                <Info
                  label="Baths"
                  value={listing.baths}
                  icon={Building2}
                />

                <Info
                  label="Size"
                  value={listing.size}
                  icon={Building2}
                />

                <Info
                  label="Status"
                  value={listing.status}
                  icon={FileText}
                />

                <Info
                  label="Created"
                  value={formatDate(
                    listing.created_at
                  )}
                  icon={CalendarDays}
                />

              </div>

            </div>

            {listing.media &&
              listing.media.length > 0 && (

                <div className="w-full max-w-xs">

                  <img
                    src={
                      listing.media[0]?.url
                    }
                    alt={
                      listing.title ||
                      'Property image'
                    }
                    className="h-40 w-full rounded-xl object-cover"
                  />

                </div>

            )}

          </div>

        </div>

      ))}

    </div>
  );
}

/* ============================================================
   LANDLORD SUBSCRIPTION
============================================================ */

export function LandlordSubscriptionPanel({
  subscription,
}: {
  subscription:
    | Subscription
    | null
    | undefined;
}) {
  return (
    <SubscriptionPanel
      subscription={subscription}
      role="landlord"
    />
  );
}

/* ============================================================
   REAL ESTATE SUBSCRIPTION
============================================================ */

export function RealEstateSubscriptionPanel({
  subscription,
}: {
  subscription:
    | Subscription
    | null
    | undefined;
}) {
  return (
    <SubscriptionPanel
      subscription={subscription}
      role="real_estate"
    />
  );
}

/* ============================================================
   SHARED SUBSCRIPTION PANEL
============================================================ */

function SubscriptionPanel({
  subscription,
  role,
}: SubscriptionPanelProps) {
  const title =
    role === 'real_estate'
      ? 'Real Estate Subscription'
      : 'Landlord Subscription';

  if (!subscription) {
    return (
      <div className="card p-10 text-center">

        <CreditCard className="mx-auto h-10 w-10 text-gray-300" />

        <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-300">
          No active subscription found.
        </p>

      </div>
    );
  }

  return (
    <div className="card p-5">

      <div className="mb-5 flex items-center gap-2">

        <CreditCard className="h-5 w-5 text-brand-600" />

        <h2 className="font-bold text-gray-900 dark:text-white">
          {title}
        </h2>

      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

        <Info
          label="Plan"
          value={
            subscription.plan?.name ??
            subscription.plan_id
          }
          icon={Building2}
        />

        <Info
          label="Audience"
          value={
            subscription.plan?.audience
          }
          icon={Building2}
        />

        <Info
          label="Billing Cycle"
          value={
            subscription.billing_cycle
          }
          icon={CalendarDays}
        />

        <Info
          label="Status"
          value={subscription.status}
          icon={ShieldCheck}
        />

        <Info
          label="Monthly Price"
          value={
            subscription.plan
              ?.monthly_price_kes != null
              ? `KES ${Number(
                  subscription.plan
                    .monthly_price_kes
                ).toLocaleString('en-KE')}`
              : null
          }
          icon={CreditCard}
        />

        <Info
          label="Annual Price"
          value={
            subscription.plan
              ?.annual_price_kes != null
              ? `KES ${Number(
                  subscription.plan
                    .annual_price_kes
                ).toLocaleString('en-KE')}`
              : null
          }
          icon={CreditCard}
        />

        <Info
          label="Billing Amount"
          value={
            subscription.billing_amount_kes != null
              ? `KES ${Number(
                  subscription.billing_amount_kes
                ).toLocaleString('en-KE')}`
              : null
          }
          icon={CreditCard}
        />

        <Info
          label="Current Period Start"
          value={formatDate(
            subscription.current_period_start
          )}
          icon={CalendarDays}
        />

        <Info
          label="Current Period End"
          value={formatDate(
            subscription.current_period_end
          )}
          icon={CalendarDays}
        />

        <Info
          label="Grace Period End"
          value={formatDate(
            subscription.grace_period_end
          )}
          icon={Clock}
        />

        <Info
          label="Auto Renew"
          value={
            subscription.auto_renew
              ? 'Yes'
              : 'No'
          }
          icon={CheckCircle2}
        />

        <Info
          label="Cancel at Period End"
          value={
            subscription.cancel_at_period_end
              ? 'Yes'
              : 'No'
          }
          icon={Clock}
        />

        <Info
          label="PayPal Status"
          value={
            subscription.paypal_status
          }
          icon={CreditCard}
        />

        <Info
          label="Next Billing"
          value={formatDate(
            subscription.next_billing_at
          )}
          icon={CalendarDays}
        />

      </div>

    </div>
  );
}

/* ============================================================
   INFO COMPONENT
============================================================ */

export function Info({
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

/* ============================================================
   STATUS ROW
============================================================ */

export function StatusRow({
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

/* ============================================================
   DOCUMENT ROW
============================================================ */

export function DocumentRow({
  title,
  description,
  url,
  onOpen,
}: {
  title: string;

  description: string;

  url:
    | string
    | null
    | undefined;

  onOpen: (
    documentPath:
      | string
      | null
      | undefined
  ) => void | Promise<void>;
}) {
  const handleOpen = async (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (!url) {
      return;
    }

    try {
      await onOpen(url);
    } catch (error) {
      console.error(
        'Failed to open KYC document:',
        error
      );
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-brand-800">

      <div className="flex items-center gap-3">

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-brand-800">

          <UserCheck className="h-5 w-5 text-gray-600 dark:text-brand-200" />

        </div>

        <div className="min-w-0">

          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {title}
          </p>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {description}
          </p>

        </div>

      </div>

      {url ? (

        <button
          type="button"
          onClick={(event) => {
            void handleOpen(event);
          }}
          className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
        >

          <Eye className="h-3.5 w-3.5" />

          View

        </button>

      ) : (

        <span className="text-xs text-gray-400">
          Not uploaded
        </span>

      )}

    </div>
  );
}

/* ============================================================
   STATUS BADGE
============================================================ */

function statusBadge(
  status: ReviewStatus
) {
  if (status === 'approved') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Approved
      </span>
    );
  }

  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-error-50 px-3 py-1 text-xs font-semibold text-error-700 dark:bg-error-900/30 dark:text-error-400">
        <XCircle className="h-3.5 w-3.5" />
        Rejected
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
      <Clock className="h-3.5 w-3.5" />
      Pending
    </span>
  );
}

/* ============================================================
   FORMAT VALUE
============================================================ */

export function formatValue(
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

/* ============================================================
   FORMAT DATE
============================================================ */

export function formatDate(
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