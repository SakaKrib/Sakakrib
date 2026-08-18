import {
  AlertCircle,
  Check,
  Home,
  Loader2,
  MapPin,
  Plus,
} from "lucide-react";
import { useState } from "react";

interface PMSListing {
  id: string;
  title: string;
  city: string;
  county: string;
  price_kes: number;
  is_published: boolean;
}

interface PMSUnitCount {
  unit_count: number;
  max_units: number | null;
  remaining_units?: number | null;
}

interface PMSUnitSelectorProps {
  listings: PMSListing[];
  unitCount: PMSUnitCount | null;
  onAdd: (listingId: string) => Promise<void>;
}

function formatKES(value: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function PMSUnitSelector({
  listings,
  unitCount,
  onAdd,
}: PMSUnitSelectorProps) {
  const [addingId, setAddingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  // ==========================================================
  // UNIT COUNT GUARD
  // ==========================================================

  if (!unitCount) {
    return (
      <div className="rounded-xl border bg-white p-5">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-gray-500" />

          <p className="text-sm text-gray-600">
            Unable to determine your PMS property
            limit.
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================
  // PMS LIMIT
  // ==========================================================

  const isLimitReached =
    unitCount.max_units !== null &&
    unitCount.remaining_units != null &&
    unitCount.remaining_units <= 0;

  // ==========================================================
  // ADD PROPERTY
  // ==========================================================

  const handleAdd = async (
    listingId: string
  ) => {
    setError(null);
    setAddingId(listingId);

    try {
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
      setAddingId(null);
    }
  };

  return (
    <div className="rounded-xl border bg-white">
      {/* Header */}
      <div className="border-b p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              Add properties to PMS
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Select properties you want to manage
              through Saka Crib PMS.
            </p>
          </div>

          <div className="rounded-lg bg-gray-100 px-3 py-2 text-right">
            <p className="text-xs text-gray-500">
              Available slots
            </p>

            <p className="font-semibold">
              {unitCount.max_units === null
                ? "Unlimited"
                : unitCount.remaining_units ?? 0}
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />

            <p className="text-sm text-red-700">
              {error}
            </p>
          </div>
        )}
      </div>

      {/* Limit reached */}
      {isLimitReached && (
        <div className="m-5 flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />

          <div>
            <p className="font-medium text-orange-800">
              PMS property limit reached
            </p>

            <p className="mt-1 text-sm text-orange-700">
              Upgrade your subscription to manage
              more properties.
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {listings.length === 0 && (
        <div className="p-8 text-center">
          <Home className="mx-auto h-8 w-8 text-gray-400" />

          <h3 className="mt-3 font-medium">
            No properties available
          </h3>

          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            All of your eligible properties are
            already managed by PMS, or you haven't
            created a property yet.
          </p>
        </div>
      )}

      {/* Properties */}
      {listings.length > 0 && (
        <div className="divide-y">
          {listings.map((listing) => {
            const isAdding =
              addingId === listing.id;

            return (
              <div
                key={listing.id}
                className="p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                  {/* Property information */}
                  <div className="flex min-w-0 gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                      <Home className="h-5 w-5 text-gray-600" />
                    </div>

                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">
                        {listing.title}
                      </h3>

                      <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                        <MapPin className="h-3.5 w-3.5" />

                        <span>
                          {listing.city},{" "}
                          {listing.county}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {formatKES(
                            listing.price_kes
                          )}
                        </span>

                        {listing.is_published ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            Published
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            Unpublished
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Add button */}
                  <button
                    type="button"
                    disabled={
                      isAdding ||
                      isLimitReached
                    }
                    onClick={() =>
                      handleAdd(listing.id)
                    }
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isAdding ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        {isLimitReached ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}

                        {isLimitReached
                          ? "Limit reached"
                          : "Add to PMS"}
                      </>
                    )}
                  </button>

                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}