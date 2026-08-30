import { useEffect, useState } from 'react';
import {
  Truck,
  MapPin,
  Search,
  Loader2,
  Star,
  Filter,
  X,
} from 'lucide-react';

import { useNav } from '@/context/NavContext';

import {
  KENYAN_CITIES,
  VEHICLE_TYPES,
  formatKES,
  cn,
} from '@/lib/utils';

import {
  protectedGet,
} from '@/lib/protectedApi';

import type {
  Mover,
} from '@/lib/supabase';

// ============================================================
// TYPES
// ============================================================

interface MoverRating {
  avg: number;
  count: number;
}

type RatingsMap = Record<string, MoverRating>;

// ============================================================
// HELPERS
// ============================================================

const vehicleLabel = (type: string): string => {
  return (
    VEHICLE_TYPES.find(
      (vehicle) => vehicle.value === type
    )?.label || type
  );
};

// ============================================================
// MOVERS PAGE
// ============================================================

export default function MoversPage() {
  const { navigate } = useNav();

  const [movers, setMovers] = useState<Mover[]>([]);
  const [ratingsMap, setRatingsMap] =
    useState<RatingsMap>({});

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [search, setSearch] =
    useState('');

  const [filterCity, setFilterCity] =
    useState('');

  const [filterVehicle, setFilterVehicle] =
    useState('');

  const [showFilters, setShowFilters] =
    useState(false);

  // ==========================================================
  // FETCH MOVERS
  // ==========================================================

  useEffect(() => {
    let cancelled = false;

    const fetchMovers = async () => {
      setLoading(true);
      setError(null);

      try {
        // ------------------------------------------------------
        // Build PostgREST query
        // ------------------------------------------------------

        const params = new URLSearchParams();

        params.set('is_available', 'eq.true');
        params.set(
          'order',
          'created_at.desc'
        );

        // ------------------------------------------------------
        // City filter
        // ------------------------------------------------------

        if (filterCity) {
          params.set(
            'operating_city',
            `eq.${filterCity}`
          );
        }

        // ------------------------------------------------------
        // Vehicle filter
        // ------------------------------------------------------

        if (filterVehicle) {
          params.set(
            'vehicle_type',
            `eq.${filterVehicle}`
          );
        }

        // ------------------------------------------------------
        // Search
        // ------------------------------------------------------
        //
        // Search driver name OR operating city.
        //
        // We encode the complete PostgREST filter using
        // URLSearchParams so user input cannot break the URL.
        // ------------------------------------------------------

        const trimmedSearch =
          search.trim();

        if (trimmedSearch) {
          params.set(
            'or',
            `(` +
              `driver_full_name.ilike.*${trimmedSearch}*,` +
              `operating_city.ilike.*${trimmedSearch}*` +
              `)`
          );
        }

        // ------------------------------------------------------
        // Protected API request
        // ------------------------------------------------------

        const moverData =
          await protectedGet<Mover[]>(
            `/rest/v1/movers?${params.toString()}`
          );

        if (cancelled) {
          return;
        }

        const loadedMovers =
          Array.isArray(moverData)
            ? moverData
            : [];

        setMovers(loadedMovers);

        // ------------------------------------------------------
        // Clear old ratings immediately.
        // ------------------------------------------------------

        setRatingsMap({});

        // ------------------------------------------------------
        // No movers = no review query required.
        // ------------------------------------------------------

        if (loadedMovers.length === 0) {
          return;
        }

        // ------------------------------------------------------
        // Fetch ratings for returned movers.
        // ------------------------------------------------------

        const moverIds =
          loadedMovers.map(
            (mover) => mover.id
          );

        const reviewParams =
          new URLSearchParams();

        reviewParams.set(
          'select',
          'mover_id,rating'
        );

        reviewParams.set(
          'review_type',
          'eq.mover'
        );

        reviewParams.set(
          'mover_id',
          `in.(${moverIds.join(',')})`
        );

        const reviews =
          await protectedGet<
            Array<{
              mover_id: string;
              rating: number;
            }>
          >(
            `/rest/v1/reviews?${reviewParams.toString()}`
          );

        if (cancelled) {
          return;
        }

        // ------------------------------------------------------
        // Calculate average rating per mover.
        // ------------------------------------------------------

        const map: RatingsMap = {};

        if (Array.isArray(reviews)) {
          for (const review of reviews) {
            if (
              !review.mover_id ||
              typeof review.rating !== 'number'
            ) {
              continue;
            }

            if (!map[review.mover_id]) {
              map[review.mover_id] = {
                avg: 0,
                count: 0,
              };
            }

            map[review.mover_id].avg +=
              review.rating;

            map[review.mover_id].count += 1;
          }
        }

        // ------------------------------------------------------
        // Convert totals into averages.
        // ------------------------------------------------------

        for (const id of Object.keys(map)) {
          if (map[id].count > 0) {
            map[id].avg =
              map[id].avg /
              map[id].count;
          }
        }

        setRatingsMap(map);
      } catch (requestError) {
        if (cancelled) {
          return;
        }

        console.error(
          'Failed to load movers:',
          requestError
        );

        setMovers([]);
        setRatingsMap({});

        if (
          requestError instanceof Error
        ) {
          setError(
            requestError.message
          );
        } else {
          setError(
            'Unable to load movers. Please try again.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchMovers();

    return () => {
      cancelled = true;
    };
  }, [
    search,
    filterCity,
    filterVehicle,
  ]);

  // ==========================================================
  // CLEAR FILTERS
  // ==========================================================

  const clearFilters = () => {
    setFilterCity('');
    setFilterVehicle('');
  };

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Find Movers
        </h1>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Verified professional movers across Kenya.
          10% platform commission applies to all bookings.
        </p>
      </div>

      {/* =====================================================
          SEARCH + FILTER BUTTON
      ===================================================== */}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search by name or city..."
            className="input-field pl-10"
            aria-label="Search movers"
          />
        </div>

        <button
          type="button"
          onClick={() =>
            setShowFilters(
              (current) => !current
            )
          }
          className={cn(
            'btn-secondary',
            showFilters &&
              'border-brand-500 text-brand-600 dark:text-brand-400'
          )}
          aria-expanded={showFilters}
          aria-controls="mover-filters"
        >
          <Filter className="h-4 w-4" />
          Filters
        </button>
      </div>

      {/* =====================================================
          FILTERS
      ===================================================== */}

      {showFilters && (
        <div
          id="mover-filters"
          className="card animate-slide-down mb-6 p-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">

            {/* City */}

            <div>
              <label
                htmlFor="mover-city-filter"
                className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400"
              >
                City
              </label>

              <select
                id="mover-city-filter"
                value={filterCity}
                onChange={(event) =>
                  setFilterCity(
                    event.target.value
                  )
                }
                className="input-field text-sm"
              >
                <option value="">
                  All Cities
                </option>

                {KENYAN_CITIES.map(
                  (city) => (
                    <option
                      key={city}
                      value={city}
                    >
                      {city}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* Vehicle */}

            <div>
              <label
                htmlFor="mover-vehicle-filter"
                className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400"
              >
                Vehicle Type
              </label>

              <select
                id="mover-vehicle-filter"
                value={filterVehicle}
                onChange={(event) =>
                  setFilterVehicle(
                    event.target.value
                  )
                }
                className="input-field text-sm"
              >
                <option value="">
                  All Vehicles
                </option>

                {VEHICLE_TYPES.map(
                  (vehicle) => (
                    <option
                      key={vehicle.value}
                      value={vehicle.value}
                    >
                      {vehicle.label}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          {/* Clear */}

          {(filterCity ||
            filterVehicle) && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 flex items-center gap-1 text-xs font-medium text-error-600"
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* =====================================================
          ERROR
      ===================================================== */}

      {error && !loading && (
        <div className="mb-6 rounded-lg border border-error-200 bg-error-50 px-2 py-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-400">
          <div className="flex items-start justify-between gap-4">
            <p>{error}</p>

            <button
              type="button"
              onClick={() =>
                window.location.reload()
              }
              className="shrink-0 font-medium underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
          LOADING
      ===================================================== */}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : movers.length === 0 ? (

        /* ===================================================
           EMPTY STATE
        =================================================== */

        <div className="py-20 text-center">

          <Truck className="mx-auto h-12 w-12 text-gray-300" />

          <p className="mt-4 text-gray-500 dark:text-gray-400">
            No movers found. Try adjusting your
            filters.
          </p>

          {(search ||
            filterCity ||
            filterVehicle) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                clearFilters();
              }}
              className="btn-secondary mt-5"
            >
              Clear Search
            </button>
          )}
        </div>

      ) : (

        /* ===================================================
           MOVER GRID
        =================================================== */

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">

          {movers.map((mover) => {
            const rating =
              ratingsMap[mover.id];

            return (
              <button
                key={mover.id}
                type="button"
                onClick={() =>
                  navigate(
                    'mover-detail',
                    mover.id
                  )
                }
                className="card group overflow-hidden text-left transition-all hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-brand-950"
              >

                {/* =================================================
                    MOVER HEADER
                ================================================= */}

                <div className="flex items-start gap-4 p-5">

                  {/* Vehicle icon */}

                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 text-white shadow-md">

                    <Truck className="h-8 w-8" />

                  </div>

                  {/* Mover information */}

                  <div className="min-w-0 flex-1">

                    <h3 className="truncate text-base font-semibold text-gray-900 dark:text-white">
                      {mover.driver_full_name}
                    </h3>

                    <p className="mt-1 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">

                      <MapPin className="h-3.5 w-3.5 shrink-0" />

                      <span className="truncate">
                        {mover.operating_city}
                        {mover.operating_county
                          ? `, ${mover.operating_county}`
                          : ''}
                      </span>

                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">

                      <span className="badge bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400">
                        {vehicleLabel(
                          mover.vehicle_type
                        )}
                      </span>

                      {mover.number_plate && (
                        <span className="badge bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300">
                          {mover.number_plate}
                        </span>
                      )}

                    </div>
                  </div>
                </div>

                {/* =================================================
                    FOOTER
                ================================================= */}

                <div className="border-t border-gray-200 px-5 py-3 dark:border-brand-800">

                  <div className="flex items-center justify-between gap-3">

                    {/* Rate */}

                    {mover.base_rate_kes &&
                    mover.base_rate_kes > 0 ? (
                      <span className="text-sm font-semibold text-brand-600 dark:text-brand-400">
                        From{' '}
                        {formatKES(
                          mover.base_rate_kes
                        )}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">
                        Rate on request
                      </span>
                    )}

                    {/* Rating */}

                    {rating &&
                      rating.count > 0 && (
                        <span className="flex shrink-0 items-center gap-1 text-sm">

                          <Star className="h-4 w-4 fill-warning-500 text-warning-500" />

                          <span className="font-semibold text-gray-900 dark:text-white">
                            {rating.avg.toFixed(
                              1
                            )}
                          </span>

                          <span className="text-gray-400">
                            ({rating.count})
                          </span>

                        </span>
                      )}

                  </div>
                </div>

              </button>
            );
          })}

        </div>
      )}
    </div>
  );
};