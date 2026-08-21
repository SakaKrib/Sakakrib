import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

interface PMSListing {
  id: string;
  title: string;
  city: string;
  county: string;
  price_kes: number;
  is_published: boolean;
  status?: string;
  activated_at?: string;
  deactivated_at?: string | null;
}

interface PMSUnitSelectorProps {
  listings: PMSListing[];
  availableListings: PMSListing[];
  // Maximum listings/units allowed by the subscription
  // (subscription_plans.max_listings). Renamed from maxUnits, which
  // does not exist as a column anywhere in the live schema.
  maxListings: number | null;
  usedListings: number;
  onAdd: (listingId: string) => Promise<void>;
  onRemove: (listingId: string) => Promise<void>;
}

export default function PMSUnitSelector({
  listings,
  availableListings,
  maxListings,
  usedListings,
  onAdd,
  onRemove,
}: PMSUnitSelectorProps) {
  const [processingId, setProcessingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const limitReached =
    maxListings !== null && usedListings >= maxListings;

  const usagePercentage =
    maxListings === null || maxListings <= 0
      ? 0
      : Math.min(100, (usedListings / maxListings) * 100);

  const handleAdd = async (listingId: string) => {
    if (limitReached) {
      setError(
        "You have reached your PMS property limit."
      );
      return;
    }

    try {
      setProcessingId(listingId);
      setError(null);

      await onAdd(listingId);
    } catch (err) {
      console.error(
        "Failed to add PMS property:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to add property to PMS."
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleRemove = async (listingId: string) => {
    const confirmed = window.confirm(
      "Remove this property from PMS management?"
    );

    if (!confirmed) {
      return;
    }

    try {
      setProcessingId(listingId);
      setError(null);

      await onRemove(listingId);
    } catch (err) {
      console.error(
        "Failed to remove PMS property:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to remove property from PMS."
      );
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Usage */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">
              PMS property usage
            </p>

            <p className="mt-1 text-xl font-bold">
              {usedListings}
              {maxListings === null
                ? " / Unlimited"
                : ` / ${maxListings}`}
            </p>
          </div>

          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100">
            <Building2 className="h-5 w-5 text-gray-700" />
          </div>
        </div>

        {maxListings !== null && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all ${
                  limitReached
                    ? "bg-red-500"
                    : usagePercentage >= 80
                      ? "bg-amber-500"
                      : "bg-green-500"
                }`}
                style={{
                  width: `${usagePercentage}%`,
                }}
              />
            </div>

            <p className="mt-2 text-xs text-gray-500">
              {Math.max(0, maxListings - usedListings)}{" "}
              {Math.max(0, maxListings - usedListings) === 1
                ? "property"
                : "properties"}{" "}
              remaining
            </p>
          </div>
        )}
      </div>

      {/* Managed Properties */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />

            <h2 className="font-semibold">
              Managed properties
            </h2>
          </div>

          <p className="mt-1 text-sm text-gray-500">
            Properties currently connected to your
            PMS subscription.
          </p>
        </div>

        {listings.length === 0 ? (
          <div className="p-8 text-center">
            <Building2 className="mx-auto h-10 w-10 text-gray-300" />

            <p className="mt-3 font-medium text-gray-700">
              No properties managed yet
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Add a property below to start managing
              it with PMS.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {listings.map((listing) => {
              const processing =
                processingId === listing.id;

              return (
                <div
                  key={listing.id}
                  className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">
                      {listing.title}
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                      {listing.city},{" "}
                      {listing.county}
                    </p>

                    <p className="mt-1 text-sm font-medium">
                      KES{" "}
                      {Number(
                        listing.price_kes
                      ).toLocaleString("en-KE")}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={processing}
                    onClick={() =>
                      handleRemove(listing.id)
                    }
                    className="light-button inline-flex items-center justify-center gap-2"
                  >
                    {processing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}

                    {processing
                      ? "Removing..."
                      : "Remove"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Available Properties */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b p-5">
          <h2 className="font-semibold">
            Available properties
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Listings eligible to be added to PMS.
          </p>
        </div>

        {availableListings.length === 0 ? (
          <div className="p-8 text-center">
            <Building2 className="mx-auto h-10 w-10 text-gray-300" />

            <p className="mt-3 font-medium text-gray-700">
              No eligible properties
            </p>

            <p className="mt-1 text-sm text-gray-500">
              All eligible listings are already
              managed by PMS.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {availableListings.map((listing) => {
              const processing =
                processingId === listing.id;

              return (
                <div
                  key={listing.id}
                  className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">
                      {listing.title}
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                      {listing.city},{" "}
                      {listing.county}
                    </p>

                    <p className="mt-1 text-sm font-medium">
                      KES{" "}
                      {Number(
                        listing.price_kes
                      ).toLocaleString("en-KE")}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={
                      processing || limitReached
                    }
                    onClick={() =>
                      handleAdd(listing.id)
                    }
                    className="light-button inline-flex items-center justify-center gap-2"
                  >
                    {processing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}

                    {processing
                      ? "Adding..."
                      : "Add to PMS"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {limitReached && (
          <div className="border-t bg-amber-50 p-4 text-sm text-amber-700">
            Your plan has reached its property
            limit. Upgrade your subscription to add
            another property.
          </div>
        )}
      </div>
    </div>
  );
}