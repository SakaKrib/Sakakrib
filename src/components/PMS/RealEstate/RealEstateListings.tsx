import {
  Building2,
  CheckCircle2,
  Clock3,
  Eye,
  MapPin,
  Plus,
  WalletCards,
  XCircle,
} from 'lucide-react';

import type { RealEstateListingSummary } from '@/lib/RealEstateTs/Realestatepmsaccess';

interface RealEstateListingsProps {
  /**
   * Listings supplied by the real-estate dashboard/service.
   *
   * Optional so the component can safely render while dashboard
   * data is unavailable.
   */
  listings?: RealEstateListingSummary[];

  onOpenListing?: (listingId: string) => void;

  onCreateListing?: () => void;
}

function formatKES(amount: number | null | undefined): string {
  if (
    amount === null ||
    amount === undefined ||
    Number.isNaN(amount)
  ) {
    return 'Price on request';
  }

  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(amount);
}

function getApprovalLabel(
  listing: RealEstateListingSummary,
) {
  const approvalStatus =
    listing.approval_status?.toLowerCase();

  if (
    listing.is_approved ||
    approvalStatus === 'approved'
  ) {
    return {
      label: 'Approved',
      className:
        'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      icon: CheckCircle2,
    };
  }

  if (
    approvalStatus === 'rejected' ||
    approvalStatus === 'declined'
  ) {
    return {
      label: 'Rejected',
      className:
        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      icon: XCircle,
    };
  }

  return {
    label: 'Pending approval',
    className:
      'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    icon: Clock3,
  };
}

function getListingTypeLabel(
  listingType: string | null | undefined,
) {
  switch (listingType?.toLowerCase()) {
    case 'rent':
      return 'For Rent';

    case 'sale':
      return 'For Sale';

    default:
      return listingType || 'Property';
  }
}

function ListingCard({
  listing,
  onOpenListing,
}: {
  listing: RealEstateListingSummary;
  onOpenListing?: (listingId: string) => void;
}) {
  const approval = getApprovalLabel(listing);
  const ApprovalIcon = approval.icon;

  const handleOpen = () => {
    if (onOpenListing) {
      onOpenListing(listing.id);
    }
  };

  return (
    <article className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-brand-700 dark:bg-brand-900">
      {/* ======================================================
          IMAGE / HERO
         ====================================================== */}

      <button
        type="button"
        onClick={handleOpen}
        disabled={!onOpenListing}
        className="relative block w-full text-left disabled:cursor-default"
        aria-label={`Open ${listing.title}`}
      >
        <div className="aspect-[16/10] overflow-hidden bg-gray-100 dark:bg-brand-800">
          {listing.cover_photo_url ? (
            <img
              src={listing.cover_photo_url}
              alt={listing.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Building2 className="h-12 w-12 text-gray-300 dark:text-brand-600" />
            </div>
          )}

          {/* Listing type */}

          <div className="absolute left-3 top-3">
            <span className="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              {getListingTypeLabel(listing.listing_type)}
            </span>
          </div>

          {/* Payment */}

          {listing.is_paid && (
            <div className="absolute right-3 top-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-green-600/90 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                <WalletCards className="h-3.5 w-3.5" />
                Paid
              </span>
            </div>
          )}

          {/* Unpaid */}

          {!listing.is_paid && (
            <div className="absolute right-3 top-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-600/90 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                <WalletCards className="h-3.5 w-3.5" />
                Payment required
              </span>
            </div>
          )}
        </div>
      </button>

      {/* ======================================================
          CONTENT
         ====================================================== */}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-gray-900 dark:text-white">
              {listing.title}
            </h3>

            <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
              <MapPin className="h-4 w-4 shrink-0" />

              <span className="truncate">
                {listing.city}

                {listing.county
                  ? `, ${listing.county}`
                  : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Price + approval */}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="font-bold text-gray-900 dark:text-white">
            {formatKES(listing.price_kes)}
          </p>

          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${approval.className}`}
          >
            <ApprovalIcon className="h-3.5 w-3.5" />

            {approval.label}
          </span>
        </div>

        {/* Footer */}

        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-brand-800">
          <span
            className={`text-xs font-medium ${
              listing.is_published
                ? 'text-green-600 dark:text-green-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {listing.is_published
              ? 'Published'
              : 'Unpublished'}
          </span>

          {onOpenListing && (
            <button
              type="button"
              onClick={handleOpen}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
            >
              <Eye className="h-4 w-4" />

              View listing
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/* ============================================================
 * MAIN
 * ============================================================ */

export default function RealEstateListings({
  listings = [],
  onOpenListing,
  onCreateListing,
}: RealEstateListingsProps) {
  /* ==========================================================
     EMPTY STATE
     ========================================================== */

  if (listings.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 dark:border-brand-700 dark:bg-brand-900/40">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900">
            <Building2 className="h-7 w-7 text-brand-600 dark:text-brand-300" />
          </div>

          <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
            No listings yet
          </h3>

          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Your properties will appear here once you
            create your first listing.
          </p>

          {onCreateListing && (
            <button
              type="button"
              onClick={onCreateListing}
              className="btn-primary mt-5 inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />

              Create listing
            </button>
          )}
        </div>
      </section>
    );
  }

  /* ==========================================================
     LISTINGS
     ========================================================== */

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Your listings
          </h2>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {listings.length}{' '}
            {listings.length === 1
              ? 'property'
              : 'properties'}{' '}
            in your account
          </p>
        </div>

        {onCreateListing && (
          <button
            type="button"
            onClick={onCreateListing}
            className="btn-primary inline-flex shrink-0 items-center gap-2"
          >
            <Plus className="h-4 w-4" />

            Add listing
          </button>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            onOpenListing={onOpenListing}
          />
        ))}
      </div>
    </section>
  );
}