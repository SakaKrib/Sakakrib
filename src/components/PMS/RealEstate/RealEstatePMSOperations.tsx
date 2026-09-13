import { useCallback, useEffect, useMemo, useState } from 'react';
import { Home, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';

import {
  createRealEstatePMSUnit,
  deleteRealEstatePMSUnit,
  getRealEstatePMSUnits,
  updateRealEstatePMSUnit,
  type RealEstatePMSUnit,
} from '@/lib/RealEstateTs/RealEstatePMSOperationsService';

interface Props {
  listings: Array<{ id: string; title: string }>;
  maxUnitsPerListing: number | null | undefined;
  isAdmin: boolean;
}

export default function RealEstatePMSOperations({ listings, maxUnitsPerListing, isAdmin }: Props) {
  const [units, setUnits] = useState<RealEstatePMSUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listingId, setListingId] = useState(listings[0]?.id ?? '');
  const [unitNumber, setUnitNumber] = useState('');
  const [rent, setRent] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getRealEstatePMSUnits();
      setUnits(result.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load units.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!listingId && listings[0]?.id) setListingId(listings[0].id); }, [listingId, listings]);

  const grouped = useMemo(() => listings.map((listing) => ({
    ...listing,
    units: units.filter((unit) => unit.listing_id === listing.id),
  })), [listings, units]);

  const totalRent = units.reduce((sum, unit) => sum + Number(unit.rent || 0), 0);

  const addUnit = async () => {
    if (!listingId || !unitNumber.trim() || !rent) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createRealEstatePMSUnit({ listing_id: listingId, unit_number: unitNumber.trim(), rent: Number(rent) });
      if (result.data) setUnits((current) => [...current, result.data as RealEstatePMSUnit]);
      setUnitNumber('');
      setRent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add unit.');
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailability = async (unit: RealEstatePMSUnit) => {
    setSaving(true);
    setError(null);
    try {
      const next = unit.availability === 'available' ? 'occupied' : 'available';
      const result = await updateRealEstatePMSUnit(unit.unit_id, { availability: next });
      if (result.data) setUnits((current) => current.map((item) => item.unit_id === unit.unit_id ? result.data as RealEstatePMSUnit : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update unit.');
    } finally {
      setSaving(false);
    }
  };

  const removeUnit = async (unit: RealEstatePMSUnit) => {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    try {
      await deleteRealEstatePMSUnit(unit.unit_id);
      setUnits((current) => current.filter((item) => item.unit_id !== unit.unit_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete unit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><Home className="h-5 w-5 text-brand-600" /><h2 className="text-lg font-bold text-gray-900 dark:text-white">Units</h2></div><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Units remain owned by the subscribing real-estate account and share the plan's per-listing capacity.</p></div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold dark:border-brand-700"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        </div>
        {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/60"><p className="text-xs text-gray-500 dark:text-gray-400">Total units</p><p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{units.length}</p></div><div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/60"><p className="text-xs text-gray-500 dark:text-gray-400">Occupied</p><p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{units.filter((unit) => unit.availability !== 'available').length}</p></div><div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/60"><p className="text-xs text-gray-500 dark:text-gray-400">Listed monthly rent</p><p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">KES {totalRent.toLocaleString('en-KE')}</p></div></div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-900">
        <div className="flex items-center gap-2"><Plus className="h-5 w-5 text-brand-600" /><h2 className="text-lg font-bold text-gray-900 dark:text-white">Add unit</h2></div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_auto]">
          <select value={listingId} onChange={(event) => setListingId(event.target.value)} className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950"><option value="">Select listing</option>{listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title}</option>)}</select>
          <input value={unitNumber} onChange={(event) => setUnitNumber(event.target.value)} placeholder="Unit number" className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950" />
          <input value={rent} onChange={(event) => setRent(event.target.value)} type="number" min="1" placeholder="Monthly rent" className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950" />
          <button type="button" onClick={() => void addUnit()} disabled={saving || !listingId || !unitNumber.trim() || !rent} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add</button>
        </div>
        {maxUnitsPerListing != null && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Plan capacity: {maxUnitsPerListing} units per listing.</p>}
      </section>

      <div className="space-y-4">
        {loading ? <div className="flex justify-center py-10 text-sm text-gray-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading units...</div> : grouped.map((listing) => (
          <section key={listing.id} className="rounded-2xl border bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-900">
            <div className="flex items-center justify-between gap-3"><h3 className="font-bold text-gray-900 dark:text-white">{listing.title}</h3><span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{listing.units.length}{maxUnitsPerListing != null ? ` / ${maxUnitsPerListing}` : ''} units</span></div>
            {listing.units.length === 0 ? <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No units recorded for this listing.</p> : <div className="mt-3 divide-y dark:divide-brand-800">{listing.units.map((unit) => <div key={unit.unit_id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-gray-900 dark:text-white">Unit {unit.unit_number}</p><p className="text-xs text-gray-500 dark:text-gray-400">KES {Number(unit.rent).toLocaleString('en-KE')} · {unit.renter_name ?? 'Vacant'}</p></div><div className="flex items-center gap-2"><button type="button" disabled={saving} onClick={() => void toggleAvailability(unit)} className="rounded-full border px-3 py-1 text-xs font-semibold dark:border-brand-700">{unit.availability}</button>{isAdmin && <button type="button" disabled={saving} onClick={() => void removeUnit(unit)} className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label={`Delete unit ${unit.unit_number}`}><Trash2 className="h-4 w-4" /></button>}</div></div>)}</div>}
          </section>
        ))}
      </div>
    </div>
  );
}
