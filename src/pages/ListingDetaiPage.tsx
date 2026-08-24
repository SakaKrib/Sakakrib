import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BedDouble,
  Bath,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit3,
  Home,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  XCircle,
  AlertCircle,
  Ruler,
  RefreshCw,
  Settings,
} from 'lucide-react';

import {
  supabase,
  Listing,
  ListingMedia,
} from '@/lib/supabase';

import { cn } from '@/lib/utils';

/* ============================================================
   TYPES
============================================================ */

interface ListingDetailPageProps {
  listingId: string;
  onBack?: () => void;
  navigate?: (page: string, id?: string) => void;
}

/**
 * Listing detail is composed from:
 *
 * listings
 * +
 * listing_media
 *
 * We intentionally do NOT add `images` because the actual
 * database does not have an images column on listings.
 */
interface ListingDetail extends Listing {
  listing_media: ListingMedia[];
}

type ListingStatus =
  | 'approved'
  | 'pending'
  | 'rejected'
  | 'unknown';

/* ============================================================
   HELPERS
============================================================ */

const normalizeStatus = (
  value: string | null | undefined
): string => {
  return (value ?? '').trim().toLowerCase();
};

const getListingStatus = (
  listing: Listing
): ListingStatus => {
  const status = normalizeStatus(
    listing.approval_status || listing.status
  );

  if (
    status === 'approved' ||
    status === 'active' ||
    status === 'published' ||
    status === 'verified'
  ) {
    return 'approved';
  }

  if (
    status === 'pending' ||
    status === 'pending_review' ||
    status === 'pending_verification' ||
    status === 'submitted'
  ) {
    return 'pending';
  }

  if (
    status === 'rejected' ||
    status === 'declined'
  ) {
    return 'rejected';
  }

  return 'unknown';
};

const formatKES = (
  value: number | string | null | undefined
): string => {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '—';
  }

  const amount = Number(value);

  if (Number.isNaN(amount)) {
    return '—';
  }

  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (
  value: string | null | undefined
): string => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-KE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

const getLocation = (
  listing: Listing
): string => {
  return [
    listing.location_search,
    listing.city,
    listing.county,
  ]
    .filter(Boolean)
    .join(', ') || 'Location not provided';
};

/**
 * Convert listing_media records into image URLs.
 *
 * Images come from listing_media, NOT listings.images.
 */
const getImages = (
  media: ListingMedia[]
): string[] => {
  return [...media]
    .filter(
      (item) =>
        item.media_type === 'photo'
    )
    .sort(
      (a, b) =>
        (a.position ?? 0) -
        (b.position ?? 0)
    )
    .map((item) => item.url)
    .filter(
      (url): url is string =>
        typeof url === 'string' &&
        url.trim().length > 0
    );
};

const getStatusConfig = (
  status: ListingStatus
) => {
  switch (status) {
    case 'approved':
      return {
        label: 'Approved',
        icon: CheckCircle2,
        wrapper:
          'bg-success-50 text-success-700 border-success-200 dark:bg-success-900/20 dark:text-success-400 dark:border-success-900/40',
        iconClass:
          'text-success-600 dark:text-success-400',
      };

    case 'pending':
      return {
        label: 'Pending Review',
        icon: Clock,
        wrapper:
          'bg-warning-50 text-warning-700 border-warning-200 dark:bg-warning-900/20 dark:text-warning-400 dark:border-warning-900/40',
        iconClass:
          'text-warning-600 dark:text-warning-400',
      };

    case 'rejected':
      return {
        label: 'Rejected',
        icon: XCircle,
        wrapper:
          'bg-error-50 text-error-700 border-error-200 dark:bg-error-900/20 dark:text-error-400 dark:border-error-900/40',
        iconClass:
          'text-error-600 dark:text-error-400',
      };

    default:
      return {
        label: 'Status Unknown',
        icon: AlertCircle,
        wrapper:
          'bg-gray-100 text-gray-700 border-gray-200 dark:bg-brand-800 dark:text-gray-300 dark:border-brand-700',
        iconClass:
          'text-gray-500',
      };
  }
};

/* ============================================================
   PAGE
============================================================ */

export default function ListingDetailPage({
  listingId,
  onBack,
  navigate,
}: ListingDetailPageProps) {
  const [listing, setListing] =
    useState<ListingDetail | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [activeImage, setActiveImage] =
    useState(0);

  /* ==========================================================
     LOAD LISTING
  ========================================================== */

  const loadListing = useCallback(
    async (showLoader = true) => {
      if (!listingId) {
        setError(
          'No listing was selected.'
        );
        setLoading(false);
        return;
      }

      if (showLoader) {
        setLoading(true);
      }

      setError(null);

      try {
        /*
         * ------------------------------------------------------
         * 1. LOAD LISTING
         *
         * IMPORTANT:
         * Do not select `images`.
         * Do not select `rejection_reason`.
         *
         * Neither exists in the actual listings table.
         * ------------------------------------------------------
         */

        const {
          data: listingData,
          error: listingError,
        } = await supabase
          .from('listings')
          .select(`
            id,
            user_id,
            title,
            description,
            city,
            county,
            price_kes,
            listing_type,
            deposit_required,
            deposit_structure,
            deposit_amount,
            size,
            beds,
            baths,
            contact_phone,
            contact_email,
            social_links,
            is_paid,
            is_published,
            created_at,
            updated_at,
            approval_status,
            admin_reviewed_at,
            admin_review_note,
            is_approved,
            property_name,
            property_type,
            location_search,
            latitude,
            longitude,
            booking_enabled,
            payment_enabled,
            is_property_management,
            ai_caption,
            ai_caption_generated_at,
            status
          `)
          .eq('id', listingId)
          .maybeSingle();

        if (listingError) {
          throw listingError;
        }

        if (!listingData) {
          setListing(null);
          setError(
            'This listing could not be found or you do not have access to it.'
          );
          return;
        }

        /*
         * ------------------------------------------------------
         * 2. LOAD MEDIA SEPARATELY
         *
         * This is intentional.
         *
         * It means this component does not depend on Supabase
         * generating a `listing_media` relationship property
         * on the Listing TypeScript interface.
         * ------------------------------------------------------
         */

        const {
          data: mediaData,
          error: mediaError,
        } = await supabase
          .from('listing_media')
          .select(`
            id,
            listing_id,
            user_id,
            url,
            label,
            media_type,
            position,
            created_at,
            unit_id
          `)
          .eq(
            'listing_id',
            listingId
          )
          .order('position', {
            ascending: true,
          });

        if (mediaError) {
          throw mediaError;
        }

        /*
         * ------------------------------------------------------
         * 3. COMPOSE THE DETAIL OBJECT
         * ------------------------------------------------------
         */

        const detail: ListingDetail = {
          ...(listingData as Listing),
          listing_media:
            (mediaData ??
              []) as ListingMedia[],
        };

        setListing(detail);
        setActiveImage(0);
      } catch (err) {
        console.error(
          'Listing detail load error:',
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load this listing.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [listingId]
  );

  /* ==========================================================
     INITIAL LOAD
  ========================================================== */

  useEffect(() => {
    loadListing();
  }, [loadListing]);

  /* ==========================================================
     NAVIGATION
  ========================================================== */

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    if (navigate) {
      navigate(
        'landlord-dashboard'
      );
      return;
    }

    window.history.back();
  };

  const handleManage = () => {
    if (!listing) {
      return;
    }

    if (navigate) {
      navigate(
        'listing-manage',
        listing.id
      );
      return;
    }

    window.location.hash =
      `#listing-manage/${listing.id}`;
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadListing(false);
  };

  /* ==========================================================
     LOADING STATE
  ========================================================== */

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="card flex min-h-[500px] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-9 w-9 animate-spin text-brand-600" />

            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Loading listing...
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ==========================================================
     NOT FOUND
  ========================================================== */

  if (!listing) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={handleBack}
          className="mb-5 flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        <div className="card flex min-h-[400px] items-center justify-center p-8 text-center">
          <div>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-error-50 text-error-600 dark:bg-error-900/20 dark:text-error-400">
              <AlertCircle className="h-7 w-7" />
            </div>

            <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
              Listing Not Found
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
              {error ||
                'The listing you are looking for could not be found.'}
            </p>

            <button
              type="button"
              onClick={handleBack}
              className="btn-primary mt-5"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ==========================================================
     DERIVED DATA
  ========================================================== */

  const status =
    getListingStatus(listing);

  const statusConfig =
    getStatusConfig(status);

  const StatusIcon =
    statusConfig.icon;

  /*
   * THIS IS NOW CORRECT:
   *
   * listing_media comes from the local ListingDetail type,
   * not the global Listing type.
   */
  const images = getImages(
    listing.listing_media
  );

  const reviewNote =
    listing.admin_review_note?.trim() || '';

  /* ==========================================================
     MAIN PAGE
  ========================================================== */

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">

      {/* ======================================================
          TOP NAVIGATION
      ====================================================== */}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-2 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-secondary"
          >
            <RefreshCw
              className={cn(
                'h-4 w-4',
                refreshing &&
                  'animate-spin'
              )}
            />
            Refresh
          </button>

          <button
            type="button"
            onClick={handleManage}
            className="btn-primary"
          >
            <Settings className="h-4 w-4" />
            Manage Listing
          </button>
        </div>
      </div>

      {/* ======================================================
          ERROR
      ====================================================== */}

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ======================================================
          IMAGE GALLERY
      ====================================================== */}

      <div className="card overflow-hidden">
        <div className="relative bg-brand-950">
          <div className="aspect-[16/8] w-full">
            {images.length > 0 ? (
              <img
                src={images[activeImage]}
                alt={
                  listing.title ||
                  'Property listing'
                }
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-brand-100 dark:bg-brand-900">
                <Home className="h-20 w-20 text-brand-300 dark:text-brand-700" />
              </div>
            )}
          </div>

          {/* Status */}

          <div className="absolute left-4 top-4">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold',
                statusConfig.wrapper
              )}
            >
              <StatusIcon
                className={cn(
                  'h-4 w-4',
                  statusConfig.iconClass
                )}
              />

              {statusConfig.label}
            </span>
          </div>

          {/* Image counter */}

          {images.length > 1 && (
            <div className="absolute bottom-4 right-4 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
              {activeImage + 1} / {images.length}
            </div>
          )}
        </div>

        {/* Thumbnails */}

        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto border-t border-gray-200 bg-white p-3 dark:border-brand-800 dark:bg-brand-950">
            {images.map(
              (image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  onClick={() =>
                    setActiveImage(
                      index
                    )
                  }
                  className={cn(
                    'h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-all',
                    activeImage ===
                      index
                      ? 'border-brand-600'
                      : 'border-transparent opacity-70 hover:opacity-100'
                  )}
                >
                  <img
                    src={image}
                    alt={`Property image ${
                      index + 1
                    }`}
                    className="h-full w-full object-cover"
                  />
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* ======================================================
          TITLE + PRICE
      ====================================================== */}

      <div className="mt-5 card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {listing.title ||
                'Untitled Listing'}
            </h1>

            <p className="mt-2 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <MapPin className="h-4 w-4 shrink-0 text-brand-600" />
              {getLocation(listing)}
            </p>

            {listing.property_name && (
              <p className="mt-1 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Building2 className="h-4 w-4 shrink-0" />
                {listing.property_name}
              </p>
            )}
          </div>

          <div className="shrink-0 sm:text-right">
            <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">
              {formatKES(
                listing.price_kes
              )}
            </p>

            {listing.listing_type && (
              <p className="mt-1 text-xs capitalize text-gray-500 dark:text-gray-400">
                {String(
                  listing.listing_type
                ).replace(
                  /_/g,
                  ' '
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================
          ADMIN REVIEW NOTE
      ====================================================== */}

      {reviewNote && (
        <div
          className={cn(
            'mt-5 rounded-2xl border p-5',
            status === 'rejected'
              ? 'border-error-200 bg-error-50 dark:border-error-900/40 dark:bg-error-900/10'
              : 'border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20'
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                status === 'rejected'
                  ? 'bg-error-100 text-error-600 dark:bg-error-900/30 dark:text-error-400'
                  : 'bg-brand-100 text-brand-600 dark:bg-brand-800 dark:text-brand-300'
              )}
            >
              {status === 'rejected' ? (
                <AlertCircle className="h-5 w-5" />
              ) : (
                <ShieldCheck className="h-5 w-5" />
              )}
            </div>

            <div className="min-w-0">
              <h2
                className={cn(
                  'font-bold',
                  status === 'rejected'
                    ? 'text-error-800 dark:text-error-300'
                    : 'text-brand-800 dark:text-brand-300'
                )}
              >
                Admin Review Note
              </h2>

              <p
                className={cn(
                  'mt-1 whitespace-pre-wrap text-sm leading-6',
                  status === 'rejected'
                    ? 'text-error-700 dark:text-error-400'
                    : 'text-gray-600 dark:text-gray-300'
                )}
              >
                {reviewNote}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================
          PROPERTY DETAILS
      ====================================================== */}

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <DetailCard
          icon={
            <BedDouble className="h-5 w-5" />
          }
          label="Bedrooms"
          value={
            listing.beds ?? '—'
          }
        />

        <DetailCard
          icon={
            <Bath className="h-5 w-5" />
          }
          label="Bathrooms"
          value={
            listing.baths ?? '—'
          }
        />

        <DetailCard
          icon={
            <Ruler className="h-5 w-5" />
          }
          label="Size"
          value={
            listing.size || '—'
          }
        />

        <DetailCard
          icon={
            <Building2 className="h-5 w-5" />
          }
          label="Property Type"
          value={
            listing.property_type ||
            '—'
          }
        />
      </div>

      {/* ======================================================
          DESCRIPTION + INFORMATION
      ====================================================== */}

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
            <Home className="h-5 w-5 text-brand-600" />
            Property Description
          </h2>

          <div className="mt-4">
            {listing.description ? (
              <p className="whitespace-pre-wrap text-sm leading-7 text-gray-600 dark:text-gray-300">
                {listing.description}
              </p>
            ) : (
              <p className="text-sm italic text-gray-400">
                No description provided.
              </p>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Listing Information
          </h2>

          <div className="mt-4 space-y-4">
            <InfoRow
              label="Listing Type"
              value={
                listing.listing_type
                  ? String(
                      listing.listing_type
                    ).replace(
                      /_/g,
                      ' '
                    )
                  : '—'
              }
            />

            <InfoRow
              label="Property Type"
              value={
                listing.property_type ||
                '—'
              }
            />

            <InfoRow
              label="Location"
              value={getLocation(
                listing
              )}
            />

            <InfoRow
              label="Created"
              value={formatDate(
                listing.created_at
              )}
            />

            <InfoRow
              label="Last Updated"
              value={formatDate(
                listing.updated_at
              )}
            />
          </div>
        </div>
      </div>

      {/* ======================================================
          PRICING & DEPOSIT
      ====================================================== */}

      <div className="mt-5 card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
          <DollarSign className="h-5 w-5 text-brand-600" />
          Pricing & Deposit
        </h2>

        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard
            label="Price"
            value={formatKES(
              listing.price_kes
            )}
          />

          <InfoCard
            label="Deposit Required"
            value={
              listing.deposit_required
                ? 'Yes'
                : 'No'
            }
          />

          <InfoCard
            label="Deposit Structure"
            value={
              listing.deposit_structure ||
              '—'
            }
          />

          <InfoCard
            label="Deposit Amount"
            value={
              listing.deposit_amount !==
              null
                ? formatKES(
                    listing.deposit_amount
                  )
                : '—'
            }
          />
        </div>
      </div>

      {/* ======================================================
          CONTACT
      ====================================================== */}

      <div className="mt-5 card p-5">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          Contact Information
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 dark:border-brand-800">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
              <Phone className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Phone
              </p>

              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {listing.contact_phone ||
                  'Not provided'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 dark:border-brand-800">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
              <Mail className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Email
              </p>

              <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                {listing.contact_email ||
                  'Not provided'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================
          FEATURES
      ====================================================== */}

      <div className="mt-5 card p-5">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          Listing Features
        </h2>

        <div className="mt-4 flex flex-wrap gap-2">
          <FeatureBadge
            label="Booking Enabled"
            enabled={Boolean(
              listing.booking_enabled
            )}
          />

          <FeatureBadge
            label="Payment Enabled"
            enabled={Boolean(
              listing.payment_enabled
            )}
          />

          <FeatureBadge
            label="Property Management"
            enabled={Boolean(
              listing.is_property_management
            )}
          />

          <FeatureBadge
            label="Deposit Required"
            enabled={Boolean(
              listing.deposit_required
            )}
          />

          <FeatureBadge
            label="Published"
            enabled={Boolean(
              listing.is_published
            )}
          />

          <FeatureBadge
            label="Approved"
            enabled={Boolean(
              listing.is_approved
            )}
          />
        </div>
      </div>

      {/* ======================================================
          LOCATION
      ====================================================== */}

      {(
        listing.latitude !==
          null &&
        listing.latitude !==
          undefined
      ) ||
      (
        listing.longitude !==
          null &&
        listing.longitude !==
          undefined
      ) ? (
        <div className="mt-5 card p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
            <MapPin className="h-5 w-5 text-brand-600" />
            Property Location
          </h2>

          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-brand-800 dark:bg-brand-900/30">
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow
                label="Latitude"
                value={
                  listing.latitude ??
                  '—'
                }
              />

              <InfoRow
                label="Longitude"
                value={
                  listing.longitude ??
                  '—'
                }
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* ======================================================
          BOTTOM ACTIONS
      ====================================================== */}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={handleBack}
          className="btn-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        <button
          type="button"
          onClick={handleManage}
          className="btn-primary"
        >
          <Edit3 className="h-4 w-4" />
          Manage This Listing
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   DETAIL CARD
============================================================ */

function DetailCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
          {icon}
        </div>

        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {label}
          </p>

          <p className="mt-1 font-bold capitalize text-gray-900 dark:text-white">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   INFO ROW
============================================================ */

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold capitalize text-gray-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

/* ============================================================
   INFO CARD
============================================================ */

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-brand-800">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {label}
      </p>

      <p className="mt-2 text-sm font-bold capitalize text-gray-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

/* ============================================================
   FEATURE BADGE
============================================================ */

function FeatureBadge({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold',
        enabled
          ? 'border-success-200 bg-success-50 text-success-700 dark:border-success-900/40 dark:bg-success-900/20 dark:text-success-400'
          : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-brand-800 dark:bg-brand-900/30 dark:text-gray-400'
      )}
    >
      {enabled ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <XCircle className="h-3.5 w-3.5" />
      )}

      {label}
    </span>
  );
}