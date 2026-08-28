import {
  ArrowRight,
  BedDouble,
  Building2,
  CalendarDays,
  Home,
  MapPin,
} from 'lucide-react';

import type { Listing } from '@/lib/supabase';
import { formatKES } from '@/lib/utils';

export interface RenterAssociationSummary {
  status: string;
  rent_amount: number;
  lease_start: string | null;
  lease_end: string | null;
}

export interface RenterUnitSummary {
  id: string;
  listing_id: string;
  unit_number: string;
  unit_type: string;
  rent: number;
  deposit_amount: number;
  size: string | null;
  beds: number;
  baths: number;
}

interface RenterHomeCardProps {
  association: RenterAssociationSummary | null;
  unit: RenterUnitSummary | null;
  listing: Pick<
    Listing,
    | 'id'
    | 'title'
    | 'property_name'
    | 'property_type'
    | 'city'
    | 'county'
    | 'location_search'
    | 'cover_image_url'
  > | null;
  onViewProperty?: (listingId: string) => void;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatStatus(status: string | null | undefined) {
  if (!status) return 'Active';

  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function RenterHomeCard({
  association,
  unit,
  listing,
  onViewProperty,
}: RenterHomeCardProps) {
  const rent =
    association?.rent_amount ?? unit?.rent ?? null;

  const location =
    listing?.location_search ||
    [listing?.city, listing?.county]
      .filter(Boolean)
      .join(', ') ||
    'Location unavailable';

  if (!association || !unit) {
    return (
      <section className="card overflow-hidden">
        <div className="p-6 text-center sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-800/50">
            <Home className="h-7 w-7 text-brand-600 dark:text-brand-400" />
          </div>

          <h2 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
            No current home
          </h2>

          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
            Your active rental association will appear here once a
            landlord associates you with a unit.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="card overflow-hidden">
      <div className="grid lg:grid-cols-[1.45fr_1fr]">
        <div className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-800/50">
              <Building2 className="h-6 w-6 text-brand-600 dark:text-brand-400" />
            </div>

            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                Current home
              </p>

              <h2 className="mt-1 truncate text-xl font-bold text-gray-900 dark:text-white">
                {listing?.property_name ||
                  listing?.title ||
                  'Current rental property'}
              </h2>

              <p className="mt-1 flex items-start gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{location}</span>
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/40">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Unit
              </p>
              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {unit.unit_number}
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {unit.unit_type}
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/40">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Monthly rent
              </p>
              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {formatKES(rent)}
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/40">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Home details
              </p>
              <p className="mt-1 flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                <BedDouble className="h-4 w-4 text-brand-500" />
                {unit.beds} bed · {unit.baths} bath
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {listing?.id && onViewProperty && (
              <button
                type="button"
                onClick={() => onViewProperty(listing.id)}
                className="btn-secondary inline-flex items-center gap-2 text-sm"
              >
                View property
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 bg-gray-50 p-6 dark:border-brand-800 dark:bg-brand-800/20 lg:border-l lg:border-t-0 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Lease
              </h3>
            </div>

            <span className="badge bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400">
              {formatStatus(association.status)}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Lease start
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                {formatDate(association.lease_start)}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Lease end
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                {formatDate(association.lease_end)}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Security deposit
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                {formatKES(unit.deposit_amount)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
