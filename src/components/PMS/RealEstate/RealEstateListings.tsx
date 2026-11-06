import { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Clock3,
  Eye,
  Loader2,
  MapPin,
  Plus,
  WalletCards,
  XCircle,
  Search,
  ArrowLeft,
} from 'lucide-react';

import {
  loadRealEstateDashboardData,
} from '@/lib/RealEstateTs/Realestateservice';
import type { RealEstateListingSummary } from '@/lib/RealEstateTs/Realestatepmsaccess';
import SecureImage from '@/components/SecureImage';

interface RealEstateListingsProps {
  listings?: RealEstateListingSummary[];
  onOpenListing?: (listingId: string) => void;
  onCreateListing?: () => void;
  /** Open directly in the full searchable grid (used by the PMS Listings tab). */
  startExpanded?: boolean;
  heading?: string;
}

function formatKES(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return 'Price on request';
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(amount);
}

function approvalState(listing: RealEstateListingSummary) {
  const status = (listing.approval_status ?? '').toLowerCase();
  if (listing.is_approved || status === 'approved') {
    return { label: 'Approved', icon: CheckCircle2, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' };
  }
  if (status === 'rejected' || status === 'declined') {
    return { label: 'Rejected', icon: XCircle, className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' };
  }
  return { label: 'Pending approval', icon: Clock3, className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' };
}

function listingTypeLabel(value: string | null | undefined) {
  if (value?.toLowerCase() === 'rent') return 'For Rent';
  if (value?.toLowerCase() === 'sale') return 'For Sale';
  return value || 'Property';
}

function ListingCard({
  listing,
  onOpenListing,
}: {
  listing: RealEstateListingSummary;
  onOpenListing?: (listingId: string) => void;
}) {
  const approval = approvalState(listing);
  const ApprovalIcon = approval.icon;

  return (
    <article className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-brand-700 dark:bg-brand-900">
      <button
        type="button"
        onClick={() => onOpenListing?.(listing.id)}
        disabled={!onOpenListing}
        className="relative block w-full text-left disabled:cursor-default"
        aria-label={`Open ${listing.title}`}
      >
        <div className="aspect-[16/10] overflow-hidden bg-gray-100 dark:bg-brand-800">
          {listing.cover_photo_url ? (
            <SecureImage src={listing.cover_photo_url} alt={listing.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" fallback={<div className="flex h-full w-full items-center justify-center"><Building2 className="h-12 w-12 text-gray-300 dark:text-brand-600" /></div>} />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Building2 className="h-12 w-12 text-gray-300 dark:text-brand-600" />
            </div>
          )}
          <div className="absolute left-3 top-3">
            <span className="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              {listingTypeLabel(listing.listing_type)}
            </span>
          </div>
          <div className="absolute right-3 top-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              <WalletCards className="h-3.5 w-3.5" />
              {listing.pms_managed ? 'PMS managed' : listing.is_paid ? 'Paid' : 'Payment required'}
            </span>
          </div>
        </div>
      </button>

      <div className="p-4">
        <h3 className="truncate text-base font-bold text-gray-900 dark:text-white">{listing.title}</h3>
        <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {listing.city || '—'}{listing.county ? `, ${listing.county}` : ''}
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="font-bold text-gray-900 dark:text-white">{formatKES(listing.price_kes)}</p>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${approval.className}`}>
            <ApprovalIcon className="h-3.5 w-3.5" />
            {approval.label}
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-brand-800">
          <span className={`text-xs font-medium ${listing.is_published ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {listing.is_published ? 'Published' : 'Unpublished'}
          </span>
          {onOpenListing && (
            <button
              type="button"
              onClick={() => onOpenListing(listing.id)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
            >
              <Eye className="h-4 w-4" />
              View listing
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function RealEstateListings({
  listings: suppliedListings,
  onOpenListing,
  onCreateListing,
  startExpanded = false,
  heading,
}: RealEstateListingsProps) {
  const [loadedListings, setLoadedListings] = useState<RealEstateListingSummary[]>([]);
  const [loading, setLoading] = useState(suppliedListings === undefined);
  const [error, setError] = useState<string | null>(null);
  const [showAllListings, setShowAllListings] = useState(startExpanded);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (suppliedListings !== undefined) {
      setLoadedListings(suppliedListings);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void loadRealEstateDashboardData('').then(
      (data) => {
        if (!cancelled) setLoadedListings(data.listings);
      },
      (err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load listings.');
        }
      },
    ).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [suppliedListings]);

  const listings = suppliedListings ?? loadedListings;
  const filteredListings = listings.filter((listing) => {
    const term = search.trim().toLowerCase();
    const searchable = [listing.title, listing.city, listing.county, listing.description].filter(Boolean).join(' ').toLowerCase();
    const approval = (listing.approval_status ?? '').toLowerCase();
    const status = listing.is_approved || approval === 'approved' ? 'approved' : approval === 'rejected' || approval === 'declined' ? 'rejected' : 'pending';
    return (!term || searchable.includes(term)) && (statusFilter === 'all' || status === statusFilter);
  });

  if (loading) {
    return (
      <section className="flex min-h-[220px] items-center justify-center rounded-2xl border bg-white dark:border-brand-700 dark:bg-brand-900">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading listings...
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
        Unable to load your listings: {error}
      </section>
    );
  }

  if (showAllListings) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>{!startExpanded && <button type="button" onClick={() => setShowAllListings(false)} className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300"><ArrowLeft className="h-4 w-4" />Back to PMS</button>}<h2 className="text-xl font-bold text-gray-900 dark:text-white">{heading ?? 'All PMS Listings'}</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{filteredListings.length} of {listings.length} properties</p></div>
          {onCreateListing && <button type="button" onClick={onCreateListing} className="btn-primary inline-flex items-center gap-2"><Plus className="h-4 w-4" />Add listing</button>}
        </div>
        <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title or location" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-brand-500 dark:border-brand-700 dark:bg-brand-950 dark:text-white" /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-brand-500 dark:border-brand-700 dark:bg-brand-950 dark:text-white"><option value="all">All statuses</option><option value="approved">Approved</option><option value="pending">Pending approval</option><option value="rejected">Rejected</option></select></div>
        {filteredListings.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filteredListings.map((listing) => <ListingCard key={listing.id} listing={listing} onOpenListing={onOpenListing} />)}</div> : <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-brand-700 dark:text-gray-400">No listings match your search or filter.</div>}
      </section>
    );
  }

  if (listings.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 dark:border-brand-700 dark:bg-brand-900/40">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900">
            <Building2 className="h-7 w-7 text-brand-600 dark:text-brand-300" />
          </div>
          <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">No listings yet</h3>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Your properties will appear here once you create your first listing.
          </p>
          {onCreateListing && (
            <button type="button" onClick={onCreateListing} className="btn-primary mt-5 inline-flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create listing
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Your listings</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {listings.length} {listings.length === 1 ? 'property' : 'properties'} in your account
          </p>
        </div>
        <div className="flex items-center gap-3">{listings.length > 0 && <button type="button" onClick={() => setShowAllListings(true)} className="text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300">View All</button>}
        {onCreateListing && (
          <button type="button" onClick={onCreateListing} className="btn-primary inline-flex shrink-0 items-center gap-2">
            <Plus className="h-4 w-4" />
            Add listing
          </button>
        )}</div>
      </div>
      <div className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-3">
        {listings.map((listing) => (
          <div key={listing.id} className="w-[300px] shrink-0 snap-start"><ListingCard listing={listing} onOpenListing={onOpenListing} /></div>
        ))}
      </div>
    </section>
  );
}