import { useState, useEffect } from 'react';
import { Search, MapPin, Home, SlidersHorizontal, X, Loader2 } from 'lucide-react';
import { useNav } from '@/context/NavContext';
import { protectedGet } from '@/lib/djangoApi';
import { KENYAN_CITIES, formatKES, cn } from '@/lib/utils';
import type { Listing, ListingMedia } from '@/lib/supabase';

interface ListingListResponse {
  count: number;
  limit: number;
  offset: number;
  results: (Listing & { media?: ListingMedia[] })[];
}

export default function ListingsPage() {
  const { navigate } = useNav();
  const [listings, setListings] = useState<(Listing & { media?: ListingMedia[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'rent' | 'sale'>('all');
  const [filterMinPrice, setFilterMinPrice] = useState('');
  const [filterMaxPrice, setFilterMaxPrice] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchListings = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set('limit', '100');
        if (filterCity) params.set('city', filterCity);
        if (filterType !== 'all') params.set('listing_type', filterType);
        if (filterMinPrice) params.set('min_price', filterMinPrice);
        if (filterMaxPrice) params.set('max_price', filterMaxPrice);
        if (search.trim()) params.set('q', search.trim());

        const response = await protectedGet<ListingListResponse>(
          `/api/listings/?${params.toString()}`,
        );

        if (!cancelled) {
          setListings(Array.isArray(response?.results) ? response.results : []);
        }
      } catch (err) {
        console.error('Failed to load listings:', err);
        if (!cancelled) {
          setListings([]);
          setError(err instanceof Error ? err.message : 'Unable to load listings.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchListings();
    return () => {
      cancelled = true;
    };
  }, [search, filterCity, filterType, filterMinPrice, filterMaxPrice]);

  const clearFilters = () => {
    setFilterCity('');
    setFilterType('all');
    setFilterMinPrice('');
    setFilterMaxPrice('');
    setSearch('');
  };

  const hasFilters = filterCity || filterType !== 'all' || filterMinPrice || filterMaxPrice || search;

  return (
    <div className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Browse Homes</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Find your next home from verified listings across Kenya.
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, city, or description..."
            className="input-field pl-10"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn('btn-secondary', showFilters && 'border-brand-500 text-brand-600 dark:text-brand-400')}
        >
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </button>
      </div>

      {showFilters && (
        <div className="mb-6 card animate-slide-down p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">City</label>
              <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="input-field text-sm">
                <option value="">All Cities</option>
                {KENYAN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Type</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value as 'all' | 'rent' | 'sale')} className="input-field text-sm">
                <option value="all">All Types</option>
                <option value="rent">For Rent</option>
                <option value="sale">For Sale</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Min Price (KES)</label>
              <input type="number" value={filterMinPrice} onChange={(e) => setFilterMinPrice(e.target.value)} placeholder="0" className="input-field text-sm" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Max Price (KES)</label>
              <input type="number" value={filterMaxPrice} onChange={(e) => setFilterMaxPrice(e.target.value)} placeholder="No limit" className="input-field text-sm" />
            </div>
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="mt-3 flex items-center gap-1 text-xs font-medium text-error-600 hover:text-error-700">
              <X className="h-3.5 w-3.5" /> Clear all filters
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-900/50 dark:bg-error-900/20 dark:text-error-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : listings.length === 0 ? (
        <div className="py-20 text-center">
          <Home className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">No listings found. Try adjusting your filters.</p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{listings.length} home{listings.length !== 1 ? 's' : ''} found</p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listings.map((listing) => {
              const firstPhoto = listing.media?.find((item) => item.media_type === 'photo');
              return (
                <button
                  key={listing.id}
                  onClick={() => navigate('listing-detail', listing.id)}
                  className="card group overflow-hidden text-left transition-all hover:shadow-lg"
                >
                  <div className="relative h-44 overflow-hidden bg-gray-200 dark:bg-brand-800">
                    {firstPhoto?.url ? (
                      <img src={firstPhoto.url} alt={listing.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Home className="h-10 w-10 text-gray-400" />
                      </div>
                    )}
                    <div className="absolute right-2 top-2 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">
                      {listing.listing_type === 'rent' ? 'For Rent' : 'For Sale'}
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="truncate text-base font-semibold text-gray-900 dark:text-white">{listing.title}</h3>
                    <p className="mt-1 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                      <MapPin className="h-3.5 w-3.5" /> {listing.city}, {listing.county}
                    </p>
                    <p className="mt-2 text-lg font-bold text-brand-600 dark:text-brand-400">
                      {formatKES(listing.price_kes)}
                      {listing.listing_type === 'rent' && <span className="text-sm font-normal text-gray-400">/mo</span>}
                    </p>
                    <div className="mt-2 flex gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span>{listing.beds} bed</span>
                      <span>{listing.baths} bath</span>
                      <span className="truncate">{listing.size}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
