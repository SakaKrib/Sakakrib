import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Home, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { EMPTY_SALE_VALUES, ListingTypeToggle, SaleFields, type InstallmentFrequency, type UnitListingType, type UnitSaleValues } from '@/components/ui/UnitPricingFields';

import {
  createRealEstatePMSUnit,
  deleteRealEstatePMSUnit,
  getRealEstatePMSUnits,
  updateRealEstatePMSUnit,
  type RealEstatePMSUnit,
} from '@/lib/RealEstateTs/RealEstatePMSOperationsService';
import {
  cancelRealEstatePMSLease,
  createRealEstatePMSLease,
  createRealEstatePMSLeaseInvoice,
  getRealEstatePMSLeases,
  type RealEstatePMSLease,
} from '@/lib/RealEstateTs/RealEstatePMSLeaseService';

import { unwrap } from '@/lib/unwrap';
import Select from '@/components/ui/Select';
import CountInput from '@/components/ui/CountInput';
interface Props {
  listings: Array<{ id: string; title: string }>;
  maxUnitsPerListing: number | null | undefined;
  isAdmin: boolean;
}

const today = new Date().toISOString().slice(0, 10);

export default function RealEstatePMSOperations({ listings, maxUnitsPerListing, isAdmin }: Props) {
  const [units, setUnits] = useState<RealEstatePMSUnit[]>([]);
  const [leases, setLeases] = useState<RealEstatePMSLease[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listingId, setListingId] = useState(listings[0]?.id ?? '');
  const [unitNumber, setUnitNumber] = useState('');
  const [rent, setRent] = useState('');
  const [unitBeds, setUnitBeds] = useState(1);
  const [unitBaths, setUnitBaths] = useState(1);
  const [unitDeposit, setUnitDeposit] = useState('');
  const [unitType, setUnitType] = useState('');
  const [unitListingType, setUnitListingType] = useState<UnitListingType>('rent');
  const [unitSale, setUnitSale] = useState<UnitSaleValues>(EMPTY_SALE_VALUES);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [leaseUnitId, setLeaseUnitId] = useState('');
  const [leaseStart, setLeaseStart] = useState(today);
  const [leaseEnd, setLeaseEnd] = useState('');
  const [leaseRent, setLeaseRent] = useState('');
  const [leaseDeposit, setLeaseDeposit] = useState('');
  const [leaseDueDay, setLeaseDueDay] = useState('1');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [unitResult, leaseResult] = await Promise.all([getRealEstatePMSUnits(), getRealEstatePMSLeases()]);
      const nextUnits = unwrap<RealEstatePMSUnit[]>(unitResult) ?? [];
      setUnits(nextUnits);
      setLeases(unwrap<RealEstatePMSLease[]>(leaseResult) ?? []);
      setLeaseUnitId((current) => current || nextUnits.find((unit) => unit.renter_assoc_id)?.unit_id || nextUnits[0]?.unit_id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load unit and lease records.');
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

  const leaseUnit = units.find((unit) => unit.unit_id === leaseUnitId);
  const totalRent = units.reduce((sum, unit) => sum + Number(unit.rent || 0), 0);

  const resetUnitForm = () => {
    setEditingUnitId(null); setUnitNumber(''); setRent(''); setUnitDeposit(''); setUnitType(''); setUnitBeds(1); setUnitBaths(1);
    setUnitListingType('rent'); setUnitSale(EMPTY_SALE_VALUES);
  };

  const startEdit = (unit: RealEstatePMSUnit) => {
    const u = unit as RealEstatePMSUnit & Record<string, any>;
    setEditingUnitId(unit.unit_id); setListingId(unit.listing_id); setUnitNumber(unit.unit_number); setUnitType(unit.unit_type || '');
    setRent(unit.rent ? String(unit.rent) : ''); setUnitDeposit(unit.deposit_amount ? String(unit.deposit_amount) : ''); setUnitBeds(unit.beds ?? 1); setUnitBaths(unit.baths ?? 1);
    setUnitListingType(u.listing_type === 'sale' ? 'sale' : 'rent');
    setUnitSale({ salePrice: u.sale_price ? String(u.sale_price) : '', installmentDeposit: u.installment_deposit ? String(u.installment_deposit) : '', installmentAmount: u.installment_amount ? String(u.installment_amount) : '', installmentFrequency: (u.installment_frequency || 'monthly') as InstallmentFrequency, installmentPeriods: u.installment_periods ? String(u.installment_periods) : '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const unitPriceReady = unitListingType === 'sale'
    ? Number(unitSale.salePrice) > 0 || (Number(unitSale.installmentAmount) > 0 && Number(unitSale.installmentPeriods) > 0)
    : Number(rent) > 0;
  const listingUnitCount = units.filter((unit) => unit.listing_id === listingId).length;
  const atUnitLimit = !editingUnitId && maxUnitsPerListing != null && listingUnitCount >= maxUnitsPerListing;

  const addUnit = async () => {
    if (!listingId || !unitNumber.trim() || !unitPriceReady || atUnitLimit) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { listing_id: listingId, unit_number: unitNumber.trim(), beds: unitBeds, baths: unitBaths, deposit_amount: Number(unitDeposit || 0), unit_type: unitType.trim() || 'unit', listing_type: unitListingType };
      if (unitListingType === 'rent') payload.rent = Number(rent);
      else Object.assign(payload, { sale_price: unitSale.salePrice ? Number(unitSale.salePrice) : null, installment_deposit: unitSale.installmentDeposit ? Number(unitSale.installmentDeposit) : null, installment_amount: unitSale.installmentAmount ? Number(unitSale.installmentAmount) : null, installment_frequency: unitSale.installmentAmount ? unitSale.installmentFrequency : null, installment_periods: unitSale.installmentPeriods ? Number(unitSale.installmentPeriods) : null });
      if (editingUnitId) {
        const result = await updateRealEstatePMSUnit(editingUnitId, payload);
        const saved = unwrap<any>(result); if (saved) setUnits((current) => current.map((item) => item.unit_id === editingUnitId ? saved as RealEstatePMSUnit : item));
      } else {
        const result = await createRealEstatePMSUnit(payload);
        const saved = unwrap<any>(result); if (saved) setUnits((current) => [...current, saved as RealEstatePMSUnit]);
      }
      resetUnitForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save unit.');
    } finally {
      setSaving(false);
    }
  };

  const createLease = async () => {
    if (!leaseUnit?.renter_assoc_id || !leaseStart || !leaseRent) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createRealEstatePMSLease({
        unit_id: leaseUnit.unit_id,
        renter_assoc_id: leaseUnit.renter_assoc_id,
        lease_start: leaseStart,
        ...(leaseEnd ? { lease_end: leaseEnd } : {}),
        monthly_rent_kes: Number(leaseRent),
        deposit_amount_kes: Number(leaseDeposit || 0),
        rent_due_day: Number(leaseDueDay || 1),
      });
      const saved = unwrap<any>(result); if (saved) setLeases((current) => [saved as RealEstatePMSLease, ...current]);
      setLeaseEnd('');
      setLeaseRent('');
      setLeaseDeposit('');
      setLeaseDueDay('1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create lease.');
    } finally {
      setSaving(false);
    }
  };

  const issueInvoice = async (lease: RealEstatePMSLease) => {
    setSaving(true);
    setError(null);
    try {
      await createRealEstatePMSLeaseInvoice(lease.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate rent invoice.');
    } finally {
      setSaving(false);
    }
  };

  const endLease = async (lease: RealEstatePMSLease) => {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    try {
      const result = await cancelRealEstatePMSLease(lease.id);
      const saved = unwrap<any>(result); if (saved) setLeases((current) => current.map((item) => item.id === lease.id ? saved as RealEstatePMSLease : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to end lease.');
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
      const saved = unwrap<any>(result); if (saved) setUnits((current) => current.map((item) => item.unit_id === unit.unit_id ? saved as RealEstatePMSUnit : item));
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
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><Home className="h-5 w-5 text-brand-600" /><h2 className="text-lg font-bold text-gray-900 dark:text-white">Units</h2></div><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Units remain owned by the subscribing real-estate account and share the plan's per-listing capacity.</p></div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold dark:border-brand-700"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        </div>
        {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/60"><p className="text-xs text-gray-500 dark:text-gray-400">Total units</p><p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{units.length}</p></div><div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/60"><p className="text-xs text-gray-500 dark:text-gray-400">Occupied</p><p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{units.filter((unit) => unit.availability !== 'available').length}</p></div><div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/60"><p className="text-xs text-gray-500 dark:text-gray-400">Listed monthly rent</p><p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">KES {totalRent.toLocaleString('en-KE')}</p></div></div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
        <div className="flex items-center gap-2"><Plus className="h-5 w-5 text-brand-600" /><h2 className="text-lg font-bold text-gray-900 dark:text-white">{editingUnitId ? 'Edit unit' : 'Add unit'}</h2>{editingUnitId && <button type="button" onClick={resetUnitForm} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-gray-500"><X className="h-3.5 w-3.5" />Cancel edit</button>}</div>
        <div className="mt-4"><ListingTypeToggle value={unitListingType} onChange={setUnitListingType} /></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-1"><Select value={listingId} onChange={(event) => setListingId(event.target.value)} className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950"><option value="">Select listing</option>{listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title}</option>)}</Select></div>
          <input value={unitNumber} onChange={(event) => setUnitNumber(event.target.value)} placeholder="Unit number (e.g. A01)" className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950" />
          <input value={unitType} onChange={(event) => setUnitType(event.target.value)} placeholder="Type (e.g. Apartment)" className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950" />
          {unitListingType === 'rent' && <>
          <input value={rent} onChange={(event) => setRent(event.target.value)} type="number" inputMode="numeric" min="1" placeholder="Monthly rent (KES)" className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950" />
          <input value={unitDeposit} onChange={(event) => setUnitDeposit(event.target.value)} type="number" inputMode="numeric" min="0" placeholder="Deposit (KES)" className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950" />
          </>}
          <div />
          <div><p className="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">Bedrooms</p><CountInput value={unitBeds} onChange={setUnitBeds} min={0} max={20} presets={[0, 1, 2, 3, 4, 5]} labels={{ 0: 'Studio' }} unit="bedrooms" aria-label="Bedrooms" /></div>
          <div><p className="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">Bathrooms</p><CountInput value={unitBaths} onChange={setUnitBaths} min={0} max={20} presets={[1, 2, 3, 4, 5]} unit="bathrooms" aria-label="Bathrooms" /></div>
          {unitListingType === 'sale' && <div className="sm:col-span-2 lg:col-span-3"><SaleFields values={unitSale} onChange={(patch) => setUnitSale((prev) => ({ ...prev, ...patch }))} /></div>}
          <button type="button" onClick={() => void addUnit()} disabled={saving || !listingId || !unitNumber.trim() || !unitPriceReady || atUnitLimit} className="sm:col-span-2 lg:col-span-1 self-end inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editingUnitId ? 'Save changes' : 'Add'}</button>
        </div>
        {atUnitLimit && <p className="mt-2 text-xs font-semibold text-warning-700 dark:text-warning-300">This listing has reached the plan limit of {maxUnitsPerListing} units. Remove a unit or upgrade to add more.</p>}
        {maxUnitsPerListing != null && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Plan capacity: {maxUnitsPerListing} units per listing.</p>}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
        <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-brand-600" /><div><h2 className="text-lg font-bold text-gray-900 dark:text-white">Leases & rent</h2><p className="text-sm text-gray-500 dark:text-gray-400">A lease is the source of tenancy terms; monthly rent invoices are generated from the active lease.</p></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Select value={leaseUnitId} onChange={(event) => { const next = units.find((unit) => unit.unit_id === event.target.value); setLeaseUnitId(event.target.value); setLeaseRent(next?.rent ? String(next.rent) : ''); setLeaseDeposit(next?.deposit_amount ? String(next.deposit_amount) : ''); setLeaseDueDay(next?.rent_due_day ? String(next.rent_due_day) : '1'); }} className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950"><option value="">Select occupied unit</option>{units.filter((unit) => unit.renter_assoc_id).map((unit) => <option key={unit.unit_id} value={unit.unit_id}>{unit.listing_title} · Unit {unit.unit_number} · {unit.renter_name ?? 'Renter'}</option>)}</Select>
          <input value={leaseStart} onChange={(event) => setLeaseStart(event.target.value)} type="date" className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950" />
          <input value={leaseEnd} onChange={(event) => setLeaseEnd(event.target.value)} type="date" placeholder="End date (optional)" className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950" />
          <input value={leaseRent} onChange={(event) => setLeaseRent(event.target.value)} type="number" min="1" placeholder="Monthly rent (KES)" className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950" />
          <input value={leaseDeposit} onChange={(event) => setLeaseDeposit(event.target.value)} type="number" min="0" placeholder="Deposit (KES)" className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950" />
          <div><p className="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">Rent due day of month</p><CountInput value={Number(leaseDueDay) || 1} onChange={(n) => setLeaseDueDay(String(n))} min={1} max={31} presets={[1, 5, 10, 15, 28]} unit="day" aria-label="Rent due day" /></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void createLease()} disabled={saving || !leaseUnit?.renter_assoc_id || !leaseStart || !leaseRent} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Create lease</button>{leaseUnit && !leaseUnit.renter_assoc_id && <span className="text-xs text-orange-600">Select a unit with an active renter association first.</span>}</div>

        <div className="mt-5 divide-y rounded-xl border dark:divide-brand-800 dark:border-brand-700">
          {leases.length === 0 ? <p className="p-5 text-sm text-gray-500 dark:text-gray-400">No leases recorded yet.</p> : leases.map((lease) => <div key={lease.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-gray-900 dark:text-white">{lease.lease_number}</p><span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700 dark:bg-brand-800 dark:text-gray-300">{lease.status}</span></div><p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{lease.renter_name ?? 'Renter'} · KES {Number(lease.monthly_rent_kes).toLocaleString('en-KE')} / month</p><p className="text-xs text-gray-500 dark:text-gray-500">{lease.lease_start} — {lease.lease_end ?? 'Open-ended'} · due day {lease.rent_due_day}</p></div><div className="flex items-center gap-2"><button type="button" disabled={saving || lease.status !== 'ACTIVE'} onClick={() => void issueInvoice(lease)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold dark:border-brand-700 disabled:opacity-50"><FileText className="h-3.5 w-3.5" />Invoice</button>{isAdmin && lease.status === 'ACTIVE' && <button type="button" disabled={saving} onClick={() => void endLease(lease)} className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label={`End lease ${lease.lease_number}`}><Trash2 className="h-4 w-4" /></button>}</div></div>)}
        </div>
      </section>

      <div className="space-y-4">
        {loading ? <div className="flex justify-center py-10 text-sm text-gray-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading units...</div> : grouped.map((listing) => (
          <section key={listing.id} className="rounded-2xl border bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-900">
            <div className="flex items-center justify-between gap-3"><h3 className="font-bold text-gray-900 dark:text-white">{listing.title}</h3><span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{listing.units.length}{maxUnitsPerListing != null ? ` / ${maxUnitsPerListing}` : ''} units</span></div>
            {listing.units.length === 0 ? <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No units recorded for this listing.</p> : <div className="mt-3 divide-y dark:divide-brand-800">{listing.units.map((unit) => <div key={unit.unit_id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-gray-900 dark:text-white">Unit {unit.unit_number}</p><p className="text-xs text-gray-500 dark:text-gray-400">{(unit as any).listing_type === 'sale' ? ((unit as any).sale_price ? `For sale · KES ${Number((unit as any).sale_price).toLocaleString('en-KE')}` : `For sale · KES ${Number((unit as any).installment_amount || 0).toLocaleString('en-KE')} installments`) : `KES ${Number(unit.rent).toLocaleString('en-KE')} / month`} · {unit.renter_name ?? 'Vacant'}</p></div><div className="flex items-center gap-2"><button type="button" disabled={saving} onClick={() => void toggleAvailability(unit)} className="rounded-full border px-3 py-1 text-xs font-semibold dark:border-brand-700">{unit.availability}</button><button type="button" disabled={saving} onClick={() => startEdit(unit)} className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20" aria-label={`Edit unit ${unit.unit_number}`}><Pencil className="h-4 w-4" /></button>{isAdmin && <button type="button" disabled={saving} onClick={() => void removeUnit(unit)} className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label={`Delete unit ${unit.unit_number}`}><Trash2 className="h-4 w-4" /></button>}</div></div>)}</div>}
          </section>
        ))}
      </div>
    </div>
  );
}
