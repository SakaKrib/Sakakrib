import {
  Home,
  Building2,
  MapPin,
  CalendarDays,
  ArrowRight,
  KeyRound,
} from 'lucide-react';

import { formatKES } from '@/lib/utils';

export interface RenterPropertyData {
  property: {
    id: string;
    title: string | null;
    city: string | null;
    county: string | null;
    address: string | null;
    cover_image_url: string | null;
  } | null;

  unit: {
    id: string;
    unit_number: string | null;
    name: string | null;
    monthly_rent: number | null;
  } | null;

  association: {
    status: string | null;
    rent_amount: number | null;
    lease_start_date: string | null;
    lease_end_date: string | null;
  } | null;
}

interface RenterPropertyCardProps {
  data: RenterPropertyData;
  onViewProperty?: (propertyId: string) => void;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getStatusLabel(status: string | null | undefined) {
  if (!status) return 'Active';

  const normalized = status.toLowerCase();

  if (normalized === 'active') return 'Active';
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'pending') return 'Pending';
  if (normalized === 'ended') return 'Ended';
  if (normalized === 'cancelled') return 'Cancelled';

  return status;
}

function getStatusClasses(status: string | null | undefined) {
  const normalized = status?.toLowerCase();

  if (
    normalized === 'active' ||
    normalized === 'approved' ||
    normalized === 'current'
  ) {
    return 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400';
  }

  if (normalized === 'pending') {
    return 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400';
  }

  if (
    normalized === 'ended' ||
    normalized === 'cancelled' ||
    normalized === 'canceled'
  ) {
    return 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400';
  }

  return 'bg-gray-100 text-gray-700 dark:bg-brand-800 dark:text-gray-300';
}

export default function RenterPropertyCard({
  data,
  onViewProperty,
}: RenterPropertyCardProps) {
  const { property, unit, association } = data;

  const propertyName =
    property?.title || 'Current Rental Property';

  const location =
    property?.city ||
    property?.county ||
    'Location unavailable';

  const unitName =
    unit?.unit_number ||
    unit?.name ||
    'Unit unavailable';

  const rent =
    association?.rent_amount ??
    unit?.monthly_rent ??
    null;

  const hasProperty = Boolean(
    property || unit || association
  );

  if (!hasProperty) {
    return (
      <section className="card overflow-hidden">
        <div className="p-6 sm:p-8">
          <div className="mx-auto flex max-w-lg flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-800/50">
              <Home className="h-7 w-7 text-brand-600 dark:text-brand-400" />
            </div>

            <h2 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
              No Current Home
            </h2>

            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              You do not currently have a rental property
              associated with your account.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card overflow-hidden">
      <div className="grid lg:grid-cols-[1.35fr_1fr]">
        {/* ====================================================
            PROPERTY
        ==================================================== */}

        <div className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            {property?.cover_image_url ? (
              <img
                src={property.cover_image_url}
                alt={propertyName}
                className="h-14 w-14 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-800/50">
                <Building2 className="h-7 w-7 text-brand-600 dark:text-brand-400" />
              </div>
            )}

            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-600 dark:text-brand-400">
                Current Home
              </p>

              <h2 className="mt-1 truncate text-lg font-bold text-gray-900 dark:text-white">
                {propertyName}
              </h2>

              <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                <MapPin className="h-4 w-4 shrink-0" />

                <span className="truncate">
                  {location}
                </span>
              </p>
            </div>
          </div>

          {property?.address && (
            <div className="mt-5 rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Address
              </p>

              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                {property.address}
              </p>
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-brand-600 dark:text-brand-400" />

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Unit
                </p>
              </div>

              <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                {unitName}
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Monthly Rent
              </p>

              <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                {formatKES(rent)}
              </p>
            </div>
          </div>

          {property?.id && onViewProperty && (
            <button
              type="button"
              onClick={() => onViewProperty(property.id)}
              className="btn-secondary mt-5 inline-flex items-center gap-2 text-sm"
            >
              View Property
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ====================================================
            LEASE
        ==================================================== */}

        <div className="border-t border-gray-200 bg-gray-50 p-6 dark:border-brand-800 dark:bg-brand-800/20 sm:p-7 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-brand-600 dark:text-brand-400" />

              <h3 className="font-semibold text-gray-900 dark:text-white">
                Lease Information
              </h3>
            </div>

            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(
                association?.status
              )}`}
            >
              {getStatusLabel(association?.status)}
            </span>
          </div>

          <div className="mt-6 space-y-5">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Lease Start
              </p>

              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {formatDate(
                  association?.lease_start_date
                )}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Lease End
              </p>

              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {formatDate(
                  association?.lease_end_date
                )}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Agreed Monthly Rent
              </p>

              <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
                {formatKES(
                  association?.rent_amount ??
                    unit?.monthly_rent ??
                    null
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
