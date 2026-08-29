import { ArrowRight, Building2, CalendarDays, Home, KeyRound, MapPin } from 'lucide-react';
import { formatKES } from '@/lib/utils';
import type { RenterAssociation, RenterProperty, RenterUnit } from '@/lib/Renter/renterApi';

export interface RenterHome { property: RenterProperty | null; unit: RenterUnit | null; association: RenterAssociation | null; }
interface RenterHomeCardProps { home: RenterHome | null; onViewProperty?: (propertyId: string) => void; }

function formatDate(value?: string | null) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }); }
function statusLabel(status?: string | null) { if (!status) return 'Active'; return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function statusClasses(status?: string | null) { const s = status?.toUpperCase(); if (['ACTIVE','APPROVED','CURRENT'].includes(s ?? '')) return 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400'; if (['PENDING','INVITED'].includes(s ?? '')) return 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'; return 'bg-gray-100 text-gray-700 dark:bg-brand-800 dark:text-gray-300'; }

export default function RenterHomeCard({ home, onViewProperty }: RenterHomeCardProps) {
  if (!home) return <section className="card overflow-hidden"><div className="p-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-800/50"><Home className="h-7 w-7 text-brand-600 dark:text-brand-400" /></div><h2 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">No Current Home</h2><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">You do not currently have an active rental unit associated with your account.</p></div></section>;

  const { property, unit, association } = home;
  const propertyTitle = property?.title || 'Current Rental Property';
  const location = [property?.city, property?.county].filter(Boolean).join(', ') || 'Location unavailable';
  const rent = association?.rent_amount ?? unit?.rent ?? null;

  return <section className="card overflow-hidden"><div className="grid lg:grid-cols-[1.4fr_1fr]">
    <div className="p-6 sm:p-7">
      <div className="flex items-start gap-4">{property?.cover_image_url ? <img src={property.cover_image_url} alt={propertyTitle} className="h-14 w-14 shrink-0 rounded-xl object-cover" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-800/50"><Building2 className="h-7 w-7 text-brand-600 dark:text-brand-400" /></div>}<div className="min-w-0 flex-1"><p className="text-xs font-medium uppercase tracking-wide text-brand-600 dark:text-brand-400">Current Home</p><h2 className="mt-1 truncate text-lg font-bold text-gray-900 dark:text-white">{propertyTitle}</h2><p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate">{location}</span></p></div></div>
      {property?.address && <div className="mt-5 rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30"><p className="text-xs text-gray-500 dark:text-gray-400">Address</p><p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{property.address}</p></div>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30"><div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-brand-600 dark:text-brand-400" /><p className="text-xs text-gray-500 dark:text-gray-400">Unit</p></div><p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{unit?.unit_number || 'Unit unavailable'}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{unit?.unit_type || ''}</p></div><div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30"><p className="text-xs text-gray-500 dark:text-gray-400">Monthly Rent</p><p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{formatKES(rent)}</p></div></div>
      {property?.id && onViewProperty && <button type="button" onClick={() => onViewProperty(property.id)} className="btn-secondary mt-5 inline-flex items-center gap-2 text-sm">View Property<ArrowRight className="h-4 w-4" /></button>}
    </div>
    <div className="border-t border-gray-200 bg-gray-50 p-6 dark:border-brand-800 dark:bg-brand-800/20 sm:p-7 lg:border-l lg:border-t-0"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-brand-600 dark:text-brand-400" /><h3 className="font-semibold text-gray-900 dark:text-white">Lease Information</h3></div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(association?.status)}`}>{statusLabel(association?.status)}</span></div><div className="mt-6 space-y-5"><div><p className="text-xs text-gray-500 dark:text-gray-400">Lease Start</p><p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{formatDate(association?.lease_start)}</p></div><div><p className="text-xs text-gray-500 dark:text-gray-400">Lease End</p><p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{formatDate(association?.lease_end)}</p></div><div><p className="text-xs text-gray-500 dark:text-gray-400">Agreed Monthly Rent</p><p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{formatKES(rent)}</p></div><div><p className="text-xs text-gray-500 dark:text-gray-400">Rent paid through</p><p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{formatDate(unit?.rent_paid_through_month)}</p></div></div></div>
  </div></section>;
}
