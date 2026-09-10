import { useState } from 'react';
import { Bath, BedDouble, Calendar, ChevronLeft, ChevronRight, Maximize, Home } from 'lucide-react';
import { formatKES, cn } from '@/lib/utils';
import type { ListingMedia } from '@/types/domain';

export type PublicPropertyUnit = {
  id: string;
  listing_id: string;
  unit_number: string;
  unit_type: string;
  rent: number | string;
  deposit_amount: number | string;
  size: string | null;
  beds: number;
  baths: number;
  description: string | null;
  position: number;
  status: 'available' | 'occupied' | string;
  media: ListingMedia[];
};

type Props = {
  units: PublicPropertyUnit[];
  bookingEnabled: boolean;
  onBookUnit?: (unit: PublicPropertyUnit) => void;
};

function UnitCard({ unit, bookingEnabled, onBookUnit }: { unit: PublicPropertyUnit; bookingEnabled: boolean; onBookUnit?: (unit: PublicPropertyUnit) => void }) {
  const [image, setImage] = useState(0);
  const occupied = unit.status === 'occupied';
  const photos = unit.media ?? [];
  const activePhoto = photos[image];

  return (
    <article className={cn('overflow-hidden rounded-xl border bg-white dark:bg-brand-900', occupied ? 'border-gray-200 opacity-60 dark:border-brand-800' : 'border-gray-200 dark:border-brand-700')}>
      <div className="relative h-44 bg-gray-100 dark:bg-brand-800">
        {activePhoto ? (
          <img src={activePhoto.url} alt={activePhoto.label || `Unit ${unit.unit_number}`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center"><Home className="h-10 w-10 text-gray-400" /></div>
        )}
        {photos.length > 1 && (
          <>
            <button type="button" onClick={() => setImage((image - 1 + photos.length) % photos.length)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-1.5 text-gray-700 shadow">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setImage((image + 1) % photos.length)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-1.5 text-gray-700 shadow">
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-gray-900/65 px-2 py-1 text-[11px] text-white">{image + 1}/{photos.length}</span>
          </>
        )}
        <span className={cn('absolute left-2 top-2 rounded-full px-2.5 py-1 text-xs font-semibold', occupied ? 'bg-gray-700 text-white' : 'bg-success-600 text-white')}>
          {occupied ? 'Occupied' : 'Available'}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Unit {unit.unit_number}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{unit.unit_type}</p>
          </div>
          <p className="text-right font-bold text-brand-600 dark:text-brand-400">{formatKES(Number(unit.rent || 0))}<span className="block text-[11px] font-normal text-gray-400">per month</span></p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" /> {unit.beds}</span>
          <span className="flex items-center gap-1"><Bath className="h-3.5 w-3.5" /> {unit.baths}</span>
          <span className="flex items-center gap-1"><Maximize className="h-3.5 w-3.5" /> {unit.size || '—'}</span>
        </div>

        {unit.description && <p className="mt-3 line-clamp-3 text-sm text-gray-600 dark:text-gray-400">{unit.description}</p>}

        {!occupied && bookingEnabled && onBookUnit && (
          <button type="button" onClick={() => onBookUnit(unit)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            <Calendar className="h-4 w-4" /> Book this unit
          </button>
        )}
      </div>
    </article>
  );
}

export default function PropertyUnitsSection({ units, bookingEnabled, onBookUnit }: Props) {
  const available = units.filter((unit) => unit.status !== 'occupied');
  const occupied = units.filter((unit) => unit.status === 'occupied');

  if (units.length === 0) return null;

  return (
    <section className="card p-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Property Units</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Explore the individual units in this property. Occupied units remain visible for reference; available units can be investigated and booked.</p>
      </div>

      {available.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Available Units</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {available.map((unit) => <UnitCard key={unit.id} unit={unit} bookingEnabled={bookingEnabled} onBookUnit={onBookUnit} />)}
          </div>
        </div>
      )}

      {occupied.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Occupied Units</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {occupied.map((unit) => <UnitCard key={unit.id} unit={unit} bookingEnabled={false} />)}
          </div>
        </div>
      )}
    </section>
  );
}
