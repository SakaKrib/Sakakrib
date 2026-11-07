import { useEffect, useState } from 'react';
import {
  Truck,
  MapPin,
  Search,
  Loader2,
  Star,
  Filter,
  X,
  ArrowRight,
  Clock,
  ShieldCheck,
} from 'lucide-react';

import { useNav } from '@/context/NavContext';
import { useAuth } from '@/context/AuthContext';
import SignInPrompt from '@/components/SignInPrompt';

import {
  KENYAN_CITIES,
  VEHICLE_TYPES,
  formatKES,
  cn,
} from '@/lib/utils';

import { protectedGet } from '@/lib/djangoLegacyApi';
import { protectedGet as djangoGet, resolveDjangoMediaUrl } from '@/lib/djangoApi';
import { useMarketplaceEvents } from '@/lib/useMarketplaceEvents';

import type { Mover } from '@/types/domain';

import Select from '@/components/ui/Select';
/** Mover as returned by /api/core/movers/ (rating is aggregated server-side). */
type MoverRow = Mover & { rating_avg?: number | null; rating_count?: number; business_name?: string | null };

type SortOrder = 'newest' | 'price_asc' | 'price_desc' | 'rating';

const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
];

const RATING_OPTIONS = [
  { value: '', label: 'Any rating' },
  { value: '3', label: '3.0 & up' },
  { value: '4', label: '4.0 & up' },
  { value: '4.5', label: '4.5 & up' },
];

const formatTime = (value?: string | null): string => (value ? String(value).slice(0, 5) : '');

function MoverAvatar({ photo, name }: { photo?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const src = resolveDjangoMediaUrl(photo);
  if (src && !failed) {
    return <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover object-top transition-transform group-hover:scale-105" />;
  }
  return (
    <div className="flex h-full items-center justify-center">
      <Truck className="h-10 w-10 text-gray-400" aria-hidden="true" />
    </div>
  );
}

const vehicleLabel = (type?: string | null): string => {
  if (!type) return 'Vehicle';
  return VEHICLE_TYPES.find((vehicle) => vehicle.value === type)?.label || type;
};

export default function MoversPage() {
  const { navigate, setAuthModalOpen, setAuthMode } = useNav();
  const { profile, loading: authLoading } = useAuth();
  const isGuest = !authLoading && !profile;
  const { event: marketplaceEvent } = useMarketplaceEvents();
  const [liveRefreshKey, setLiveRefreshKey] = useState(0);
  const [movers, setMovers] = useState<MoverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterVehicle, setFilterVehicle] = useState('');
  const [minRate, setMinRate] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [minRating, setMinRating] = useState('');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debouncedRates, setDebouncedRates] = useState({ min: '', max: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [commissionRate, setCommissionRate] = useState<number | null>(null);

  useEffect(() => {
    if (
      (marketplaceEvent?.type === 'ready' && marketplaceEvent.reconnected) ||
      (marketplaceEvent?.type === 'resource.updated' && marketplaceEvent.resource === 'movers')
    ) setLiveRefreshKey((key) => key + 1);
  }, [marketplaceEvent]);

  // Typing in the search / price boxes should not fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setDebouncedRates({ min: minRate.trim(), max: maxRate.trim() });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, minRate, maxRate]);

  useEffect(() => {
    let cancelled = false;

    const fetchMovers = async () => {
      setLoading(true);
      setError(null);

      try {
        // Filtering, rating aggregation and sorting all happen on the server.
        const params = new URLSearchParams();
        params.set('is_available', 'true');
        params.set('ordering', sort);
        if (filterCity) params.set('operating_city', filterCity);
        if (filterVehicle) params.set('vehicle_type', filterVehicle);
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (debouncedRates.min) params.set('min_rate', debouncedRates.min);
        if (debouncedRates.max) params.set('max_rate', debouncedRates.max);
        if (minRating) params.set('min_rating', minRating);

        const [moverData, platformSettings] = await Promise.all([
          djangoGet<MoverRow[]>(`/api/core/movers/?${params.toString()}`),
          protectedGet<{ mover_commission_rate?: number | string }>('/rest/v1/platform_settings').catch(() => null),
        ]);

        if (cancelled) return;

        setMovers(Array.isArray(moverData) ? moverData : []);

        const configuredCommission = Number(platformSettings?.mover_commission_rate);
        setCommissionRate(
          Number.isFinite(configuredCommission) && configuredCommission >= 0
            ? configuredCommission
            : null
        );
      } catch (requestError) {
        if (cancelled) return;

        console.error('Failed to load movers:', requestError);
        setMovers([]);
        setError(requestError instanceof Error ? requestError.message : 'Unable to load movers. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchMovers();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, debouncedRates, filterCity, filterVehicle, minRating, sort, liveRefreshKey]);

  const activeFilterCount = [filterCity, filterVehicle, minRate, maxRate, minRating].filter(Boolean).length;

  const clearFilters = () => {
    setFilterCity('');
    setFilterVehicle('');
    setMinRate('');
    setMaxRate('');
    setMinRating('');
  };

  return (
    <div className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Find Movers</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Verified professional movers across Kenya.
          {commissionRate !== null && (
            <> {Number.isInteger(commissionRate * 100) ? commissionRate * 100 : (commissionRate * 100).toFixed(2)}% platform commission applies to all bookings.</>
          )}
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, business or city..."
            className="input-field pl-10"
            aria-label="Search movers"
          />
        </div>

        <div className="sm:w-56">
          <Select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOrder)}
            className="input-field text-sm"
            aria-label="Sort movers"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </div>

        <button
          type="button"
          onClick={() => setShowFilters((current) => !current)}
          className={cn(
            'btn-secondary relative',
            (showFilters || activeFilterCount > 0) && 'border-brand-500 text-brand-600 dark:text-brand-400'
          )}
          aria-expanded={showFilters}
          aria-controls="mover-filters"
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {isGuest && <SignInPrompt message="Sign in or create a free account to view a mover's full profile, get a quote and book." />}

      {showFilters && (
        <div id="mover-filters" className="card animate-slide-down mb-6 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="mover-city-filter" className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">City</label>
              <Select
                id="mover-city-filter"
                value={filterCity}
                onChange={(event) => setFilterCity(event.target.value)}
                className="input-field text-sm"
              >
                <option value="">All Cities</option>
                {KENYAN_CITIES.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </Select>
            </div>

            <div>
              <label htmlFor="mover-vehicle-filter" className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Vehicle Type</label>
              <Select
                id="mover-vehicle-filter"
                value={filterVehicle}
                onChange={(event) => setFilterVehicle(event.target.value)}
                className="input-field text-sm"
              >
                <option value="">All Vehicles</option>
                {VEHICLE_TYPES.map((vehicle) => (
                  <option key={vehicle.value} value={vehicle.value}>{vehicle.label}</option>
                ))}
              </Select>
            </div>

            <div>
              <label htmlFor="mover-rating-filter" className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Minimum Rating</label>
              <Select
                id="mover-rating-filter"
                value={minRating}
                onChange={(event) => setMinRating(event.target.value)}
                className="input-field text-sm"
              >
                {RATING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Base Rate (KES)</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={minRate}
                  onChange={(event) => setMinRate(event.target.value)}
                  placeholder="Min"
                  aria-label="Minimum base rate"
                  className="input-field text-sm"
                />
                <span className="text-gray-400">–</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={maxRate}
                  onChange={(event) => setMaxRate(event.target.value)}
                  placeholder="Max"
                  aria-label="Maximum base rate"
                  className="input-field text-sm"
                />
              </div>
            </div>
          </div>

          {activeFilterCount > 0 && (
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

      {error && !loading && (
        <div className="mb-6 rounded-lg border border-error-200 bg-error-50 px-2 py-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-400">
          <div className="flex items-start justify-between gap-4">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setLiveRefreshKey((key) => key + 1)}
              className="shrink-0 font-medium underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!loading && !error && movers.length > 0 && (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          {movers.length} {movers.length === 1 ? 'mover' : 'movers'} available
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : movers.length === 0 ? (
        <div className="py-20 text-center">
          <Truck className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            No movers found. Try adjusting your filters.
          </p>
          {(search || activeFilterCount > 0) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                clearFilters();
              }}
              className="btn-secondary mt-5"
            >
              Clear Search & Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {movers.map((mover) => {
            const baseRate = Number(mover.base_rate_kes);
            const ratePerKm = Number(mover.rate_per_km_kes);
            const hasBaseRate = Number.isFinite(baseRate) && baseRate > 0;
            const hasRatePerKm = Number.isFinite(ratePerKm) && ratePerKm > 0;
            const ratingAvg = typeof mover.rating_avg === 'number' ? mover.rating_avg : null;
            const ratingCount = mover.rating_count ?? 0;
            const displayName = (mover.business_name || '').trim() || mover.driver_full_name || 'Mover';
            const showDriver = Boolean((mover.business_name || '').trim() && mover.driver_full_name);
            const hours = mover.start_time && mover.end_time ? `${formatTime(mover.start_time)} – ${formatTime(mover.end_time)}` : '';
            const available = mover.is_available !== false;

            return (
              <button
                key={mover.id}
                type="button"
                onClick={() => { if (!profile) { setAuthMode('signin'); setAuthModalOpen(true); return; } navigate('mover-detail', mover.id); }}
                className="card group flex flex-col overflow-hidden text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-brand-950"
              >
                {/* Photo area: same proportions as the listing cards */}
                <div className="relative h-40 overflow-hidden bg-gray-200 dark:bg-brand-800">
                  <MoverAvatar photo={mover.profile_photo_url} name={displayName} />
                  <span
                    className={cn(
                      'absolute left-2 top-2 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold text-white',
                      available ? 'bg-success-600' : 'bg-gray-500'
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
                    {available ? 'Available' : 'Unavailable'}
                  </span>
                  <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                    <Star className={cn('h-3 w-3', ratingAvg !== null ? 'fill-white' : '')} />
                    {ratingAvg !== null ? `${ratingAvg.toFixed(1)} (${ratingCount})` : 'New'}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-3">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
                    <span className="truncate">{displayName}</span>
                    <ShieldCheck className="h-4 w-4 shrink-0 text-btnblue-500" aria-label="Verified mover" />
                  </h3>
                  {showDriver && (
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">Driver: {mover.driver_full_name}</p>
                  )}

                  <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {mover.operating_city}
                      {mover.operating_county ? `, ${mover.operating_county}` : ''}
                    </span>
                  </p>

                  <p className="mt-1.5 text-base font-bold text-brand-600 dark:text-brand-400">
                    {hasBaseRate ? (
                      <>
                        <span className="mr-1 text-xs font-normal text-gray-400">From</span>
                        {formatKES(baseRate)}
                      </>
                    ) : (
                      <span className="text-sm font-medium text-gray-400">Rate on request</span>
                    )}
                    {hasRatePerKm && (
                      <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400">+ {formatKES(ratePerKm)}/km</span>
                    )}
                  </p>

                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Truck className="h-3 w-3" />
                      {vehicleLabel(mover.vehicle_type)}
                    </span>
                    {hours && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {hours}
                      </span>
                    )}
                  </div>

                  <span className="btn-primary mt-3 w-full">
                    View & Book
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
