import { useState, useEffect } from 'react';
import { Truck, MapPin, Search, Loader2, Star, ShieldCheck, Filter, X } from 'lucide-react';
import { useNav } from '@/context/NavContext';
import { supabase } from '@/lib/supabase';
import { KENYAN_CITIES, VEHICLE_TYPES, formatKES, cn } from '@/lib/utils';
import type { Mover, Review } from '@/lib/supabase';

export default function MoversPage() {
  const { navigate } = useNav();
  const [movers, setMovers] = useState<Mover[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterVehicle, setFilterVehicle] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [ratingsMap, setRatingsMap] = useState<Record<string, { avg: number; count: number }>>({});

  useEffect(() => {
    const fetchMovers = async () => {
      setLoading(true);
      let query = supabase
        .from('movers')
        .select('*')
        .eq('is_available', true)
        .order('created_at', { ascending: false });

      if (filterCity) query = query.eq('operating_city', filterCity);
      if (filterVehicle) query = query.eq('vehicle_type', filterVehicle);
      if (search) query = query.or(`driver_full_name.ilike.%${search}%,operating_city.ilike.%${search}%`);

      const { data } = await query;
      if (data) {
        setMovers(data as Mover[]);
        // Fetch ratings
        if (data.length > 0) {
          const moverIds = data.map((m) => m.id);
          const { data: reviews } = await supabase
            .from('reviews')
            .select('mover_id, rating')
            .in('mover_id', moverIds)
            .eq('review_type', 'mover');
          if (reviews) {
            const map: Record<string, { avg: number; count: number }> = {};
            reviews.forEach((r) => {
              if (!map[r.mover_id]) map[r.mover_id] = { avg: 0, count: 0 };
              map[r.mover_id].avg += r.rating;
              map[r.mover_id].count += 1;
            });
            Object.keys(map).forEach((id) => {
              map[id].avg = map[id].avg / map[id].count;
            });
            setRatingsMap(map);
          }
        }
      }
      setLoading(false);
    };
    fetchMovers();
  }, [search, filterCity, filterVehicle]);

  const vehicleLabel = (type: string) => VEHICLE_TYPES.find((v) => v.value === type)?.label || type;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Find Movers</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Verified professional movers across Kenya. 10% platform commission applies to all bookings.
        </p>
      </div>

      {/* Search & Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or city..."
            className="input-field pl-10"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn('btn-secondary', showFilters && 'border-brand-500 text-brand-600 dark:text-brand-400')}
        >
          <Filter className="h-4 w-4" /> Filters
        </button>
      </div>

      {showFilters && (
        <div className="mb-6 card animate-slide-down p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">City</label>
              <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="input-field text-sm">
                <option value="">All Cities</option>
                {KENYAN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Vehicle Type</label>
              <select value={filterVehicle} onChange={(e) => setFilterVehicle(e.target.value)} className="input-field text-sm">
                <option value="">All Vehicles</option>
                {VEHICLE_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
          </div>
          {(filterCity || filterVehicle) && (
            <button
              onClick={() => { setFilterCity(''); setFilterVehicle(''); }}
              className="mt-3 flex items-center gap-1 text-xs font-medium text-error-600"
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : movers.length === 0 ? (
        <div className="py-20 text-center">
          <Truck className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">No movers found. Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {movers.map((mover) => {
            const rating = ratingsMap[mover.id];
            return (
              <button
                key={mover.id}
                onClick={() => navigate('mover-detail', mover.id)}
                className="card group overflow-hidden text-left transition-all hover:shadow-lg"
              >
                <div className="flex items-start gap-4 p-5">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 text-white shadow-md">
                    <Truck className="h-8 w-8" />
                  </div>
                  <div className="flex-1">
                    <h3 className="truncate text-base font-semibold text-gray-900 dark:text-white">
                      {mover.driver_full_name}
                    </h3>
                    <p className="mt-1 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                      <MapPin className="h-3.5 w-3.5" /> {mover.operating_city}, {mover.operating_county}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="badge bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400">
                        {vehicleLabel(mover.vehicle_type)}
                      </span>
                      <span className="badge bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300">
                        {mover.number_plate}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="border-t border-gray-200 px-5 py-3 dark:border-brand-800">
                  <div className="flex items-center justify-between">
                    {mover.base_rate_kes > 0 ? (
                      <span className="text-sm font-semibold text-brand-600 dark:text-brand-400">
                        From {formatKES(mover.base_rate_kes)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">Rate on request</span>
                    )}
                    {rating && (
                      <span className="flex items-center gap-1 text-sm">
                        <Star className="h-4 w-4 fill-warning-500 text-warning-500" />
                        <span className="font-semibold text-gray-900 dark:text-white">{rating.avg.toFixed(1)}</span>
                        <span className="text-gray-400">({rating.count})</span>
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
}
