import { FormEvent, useEffect, useState } from 'react';
import { Loader2, PlusCircle, RefreshCw } from 'lucide-react';
import { protectedGet, protectedPost } from '@/lib/djangoApi';

type Owner = { id: string; full_name: string; email: string; role: string; phone?: string };

export default function AdminListingPostPanel() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [title, setTitle] = useState('');
  const [city, setCity] = useState('');
  const [county, setCounty] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [listingType, setListingType] = useState<'rent' | 'sale'>('rent');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOwners = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await protectedGet<Owner[]>('/api/listings/admin/post-on-behalf/');
      setOwners(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load eligible listing owners.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadOwners(); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ownerId) { setError('Select the landlord or real estate owner first.'); return; }
    setWorking(true); setError(null); setMessage(null);
    try {
      const result = await protectedPost<{ listing_id: string; approval_status: string }>('/api/listings/admin/post-on-behalf/', {
        owner_id: ownerId,
        title,
        city,
        county,
        price_kes: price ? Number(price) : null,
        description,
        listing_type: listingType,
      });
      setMessage(`Listing ${result.listing_id} was created and placed into the administrator approval queue.`);
      setTitle(''); setCity(''); setCounty(''); setPrice(''); setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Listing creation failed.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="card mt-6 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><PlusCircle className="h-5 w-5 text-brand-600" /><h3 className="text-lg font-bold text-gray-900 dark:text-white">Post listing on behalf</h3></div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Create a listing for an approved landlord or real-estate account without consuming their listing entitlement. The listing still requires administrator approval before publication.</p>
        </div>
        <button type="button" onClick={() => void loadOwners()} disabled={loading} className="btn-secondary inline-flex items-center gap-2"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />Refresh owners</button>
      </div>
      {error && <div className="mt-4 rounded-xl bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-300">{error}</div>}
      {message && <div className="mt-4 rounded-xl bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-900/20 dark:text-success-300">{message}</div>}
      <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 md:col-span-2">Owner<select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="input mt-1 w-full" disabled={loading || working}><option value="">Select approved owner</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.full_name} · {owner.role} · {owner.email}</option>)}</select></label>
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Title<input value={title} onChange={(e) => setTitle(e.target.value)} className="input mt-1 w-full" required disabled={working} /></label>
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Listing type<select value={listingType} onChange={(e) => setListingType(e.target.value as 'rent' | 'sale')} className="input mt-1 w-full" disabled={working}><option value="rent">Rent</option><option value="sale">Sale</option></select></label>
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">City<input value={city} onChange={(e) => setCity(e.target.value)} className="input mt-1 w-full" required disabled={working} /></label>
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">County<input value={county} onChange={(e) => setCounty(e.target.value)} className="input mt-1 w-full" required disabled={working} /></label>
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Price (KES)<input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" step="0.01" className="input mt-1 w-full" disabled={working} /></label>
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 md:col-span-2">Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input mt-1 min-h-28 w-full" disabled={working} /></label>
        <div className="md:col-span-2"><button type="submit" disabled={working || loading || !ownerId} className="btn-primary inline-flex items-center gap-2">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}Create listing</button></div>
      </form>
    </section>
  );
}
