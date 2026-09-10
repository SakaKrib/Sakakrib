import { useState, useEffect } from 'react';
import {
  MapPin, BedDouble, Bath, Maximize, Phone, Mail, Link2,
  ChevronLeft, ChevronRight, ShieldCheck, Star, Home, Loader2, ArrowLeft,
  DollarSign, Calendar, Navigation, CreditCard, X
} from 'lucide-react';
import { useNav } from '@/context/NavContext';
import { useAuth } from '@/context/AuthContext';
import { protectedGet } from '@/lib/djangoApi';
import { formatKES, timeAgo, cn } from '@/lib/utils';
import ListingMap from '@/components/ListingMap';
import PropertyUnitsSection, { type PublicPropertyUnit } from '@/components/PropertyUnitsSection';
import type { Listing, ListingMedia, Review, Profile } from '@/types/domain';

type ListingPaymentMethod = {
  id: string;
  provider: string;
  display_name: string;
  payment_method: string | null;
  paybill_number: string | null;
  paybill_account: string | null;
  till_number: string | null;
  paypal_email: string | null;
  is_default: boolean;
};

type ListingDetailResponse = Listing & {
  landlord: Profile | null;
  units?: PublicPropertyUnit[];
  payment_methods?: ListingPaymentMethod[];
};

type ReviewListResponse = { items: Review[] };

export default function ListingDetailPage() {
  const { selectedListingId, navigate } = useNav();
  const { profile } = useAuth();
  const [listing, setListing] = useState<ListingDetailResponse | null>(null);
  const [media, setMedia] = useState<ListingMedia[]>([]);
  const [landlord, setLandlord] = useState<Profile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [showContact, setShowContact] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showPaymentInfo, setShowPaymentInfo] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<PublicPropertyUnit | null>(null);

  useEffect(() => {
    if (!selectedListingId) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const listingData = await protectedGet<ListingDetailResponse>(
          `/api/listings/${encodeURIComponent(String(selectedListingId))}/`,
        );
        setListing(listingData);
        setMedia(listingData.media ?? []);
        setLandlord(listingData.landlord ?? null);
        const reviewData = await protectedGet<ReviewListResponse>(
          `/api/core/reviews/?listing_id=${encodeURIComponent(String(selectedListingId))}`,
        );
        setReviews(reviewData.items ?? []);
      } catch {
        setListing(null); setMedia([]); setLandlord(null); setReviews([]);
      } finally { setLoading(false); }
    };
    fetchData();
  }, [selectedListingId]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-600" /></div>;
  if (!listing) return (
    <div className="py-20 text-center">
      <Home className="mx-auto h-12 w-12 text-gray-300" />
      <p className="mt-4 text-gray-500 dark:text-gray-400">Listing not found.</p>
      <button onClick={() => navigate('listings')} className="btn-primary mt-4">Browse Listings</button>
    </div>
  );

  const handleShowContact = () => {
    if (!profile) { navigate('home'); return; }
    setShowContact(true);
  };
  const photos = media.filter((m) => m.media_type === 'photo' && !m.unit_id);
  const video = media.find((m) => m.media_type === 'video' && !m.unit_id);
  const avgRating = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  const isPropertyManagement = Boolean(listing.is_property_management);
  const bookingAvailable = isPropertyManagement && Boolean(listing.booking_enabled);
  const paymentAvailable = isPropertyManagement && Boolean(listing.payment_enabled);
  const units = isPropertyManagement ? (listing.units ?? []) : [];
  const paymentMethods = paymentAvailable ? (listing.payment_methods ?? []) : [];
  const hasCoordinates = Number.isFinite(Number(listing.latitude)) && Number.isFinite(Number(listing.longitude));

  const handleBookUnit = (unit: PublicPropertyUnit) => {
    setSelectedUnit(unit);
  };

  return (
    <div className="mx-auto max-w-5xl px-2 py-8 sm:px-6">
      <button onClick={() => navigate('listings')} className="mb-4 flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-brand-600 dark:text-gray-400">
        <ArrowLeft className="h-4 w-4" /> Back to Listings
      </button>

      {photos.length > 0 ? (
        <div className="mb-6">
          <div className="relative h-64 overflow-hidden rounded-xl bg-gray-200 sm:h-96 dark:bg-brand-800">
            <img src={photos[activeImage]?.url} alt={photos[activeImage]?.label ?? listing.title} className="h-full w-full object-cover" />
            {photos.length > 1 && <>
              <button onClick={() => setActiveImage((activeImage - 1 + photos.length) % photos.length)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-gray-700"><ChevronLeft className="h-5 w-5" /></button>
              <button onClick={() => setActiveImage((activeImage + 1) % photos.length)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-gray-700"><ChevronRight className="h-5 w-5" /></button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-gray-900/60 px-3 py-1 text-xs font-medium text-white">{activeImage + 1} / {photos.length}</div>
            </>}
          </div>
          {photos.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto pb-2">{photos.map((photo, i) => <button key={photo.id} onClick={() => setActiveImage(i)} className={cn('h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2', i === activeImage ? 'border-brand-500' : 'border-transparent')}><img src={photo.url} alt={photo.label ?? ''} className="h-full w-full object-cover" /></button>)}</div>}
        </div>
      ) : <div className="mb-6 flex h-64 items-center justify-center rounded-xl bg-gray-200 dark:bg-brand-800"><Home className="h-12 w-12 text-gray-400" /></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4">
              <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">{listing.title}</h1><p className="mt-1 flex items-center gap-1 text-gray-500 dark:text-gray-400"><MapPin className="h-4 w-4" /> {listing.city}, {listing.county}</p></div>
              <div className="text-right"><p className="text-2xl font-bold text-brand-600 dark:text-brand-400">{formatKES(Number(listing.price_kes ?? 0))}</p>{listing.listing_type === 'rent' && <p className="text-sm text-gray-400">per month</p>}</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200">{listing.listing_type === 'rent' ? 'For Rent' : 'For Sale'}</span>
              {landlord?.verification_status === 'verified' && <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400"><ShieldCheck className="h-3 w-3" /> Verified Landlord</span>}
              <span className="badge bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300">{timeAgo(listing.created_at ?? '')}</span>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-4 border-t border-gray-200 pt-6 dark:border-brand-800">
              <div className="text-center"><BedDouble className="mx-auto h-6 w-6 text-gray-400" /><p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{listing.beds === 0 ? 'Studio' : listing.beds}</p><p className="text-xs text-gray-400">Bedrooms</p></div>
              <div className="text-center"><Bath className="mx-auto h-6 w-6 text-gray-400" /><p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{listing.baths}</p><p className="text-xs text-gray-400">Bathrooms</p></div>
              <div className="text-center"><Maximize className="mx-auto h-6 w-6 text-gray-400" /><p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{listing.size}</p><p className="text-xs text-gray-400">Size</p></div>
            </div>
          </div>

          {isPropertyManagement && <PropertyUnitsSection units={units} bookingEnabled={bookingAvailable} onBookUnit={handleBookUnit} />}

          {selectedUnit && bookingAvailable && <div className="card border-brand-200 p-6 dark:border-brand-700"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Selected Unit</p><h2 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">Unit {selectedUnit.unit_number}</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{formatKES(Number(selectedUnit.rent))} per month · {selectedUnit.unit_type}</p></div><button type="button" onClick={() => setSelectedUnit(null)} className="text-gray-400 hover:text-gray-700"><X className="h-5 w-5" /></button></div><p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Your request for this vacant unit has been submitted to the property manager. You will be notified when it is accepted or declined.</p></div>}

          {hasCoordinates && <div className="card p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><MapPin className="h-5 w-5 text-brand-600" /> Location</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">View the property and follow it from your current location.</p></div><button type="button" onClick={() => setShowMap((value) => !value)} className="btn-secondary flex items-center gap-2"><Navigation className="h-4 w-4" /> {showMap ? 'Hide Map' : 'Show on Map'}</button></div>{showMap && <div className="mt-4"><ListingMap latitude={Number(listing.latitude)} longitude={Number(listing.longitude)} title={listing.title} /></div>}</div>}

          <div className="card p-6"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Description</h2><p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600 dark:text-gray-400">{listing.description}</p></div>
          {listing.deposit_required && <div className="card p-6"><h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><DollarSign className="h-5 w-5 text-brand-600" /> Deposit Details</h2><div className="mt-3 space-y-2"><div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">Deposit Amount</span><span className="font-semibold text-gray-900 dark:text-white">{formatKES(Number(listing.deposit_amount ?? 0))}</span></div><div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">Payment Structure</span><span className="font-semibold capitalize text-gray-900 dark:text-white">{listing.deposit_structure}</span></div></div></div>}
          {video && <div className="card p-6"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Walkthrough Video</h2><video src={video.url} controls className="mt-3 w-full rounded-lg" /></div>}
          <div className="card p-6"><h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><Star className="h-5 w-5 text-brand-600" /> Reviews{reviews.length > 0 && <span className="text-sm font-normal text-gray-400">({avgRating.toFixed(1)} avg, {reviews.length} review{reviews.length !== 1 ? 's' : ''})</span>}</h2>{reviews.length === 0 ? <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No reviews yet. Be the first to review this listing.</p> : <div className="mt-4 space-y-4">{reviews.map((review) => <div key={review.id} className="border-l-2 border-brand-200 pl-4 dark:border-brand-700"><div className="flex items-center gap-2"><div className="flex">{[1,2,3,4,5].map((s) => <Star key={s} className={cn('h-4 w-4', s <= review.rating ? 'fill-warning-500 text-warning-500' : 'text-gray-300 dark:text-brand-700')} />)}</div><span className="text-xs text-gray-400">{timeAgo(review.created_at ?? '')}</span></div><p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{review.comment}</p></div>)}</div>}</div>
        </div>

        <div className="space-y-6">
          {isPropertyManagement && (bookingAvailable || paymentAvailable) && <div className="card p-6"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Property Actions</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Choose a vacant unit to request, or view the payment information configured by the property owner.</p><div className="mt-4 grid gap-3">{bookingAvailable && <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">Rental requests are made on individual vacant units below.</p>}{paymentAvailable && <button type="button" onClick={() => setShowPaymentInfo(true)} className="flex items-center justify-center gap-2 rounded-lg border border-brand-200 bg-white px-4 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-300"><CreditCard className="h-4 w-4" /> Payment Methods</button>}</div></div>}

          <div className="card p-6"><h3 className="text-base font-semibold text-gray-900 dark:text-white">Contact Landlord</h3>{landlord && <div className="mt-3 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">{((landlord.full_name ?? 'U').charAt(0)).toUpperCase()}</div><div><p className="text-sm font-semibold text-gray-900 dark:text-white">{landlord.full_name || 'Landlord'}</p>{landlord.verification_status === 'verified' && <p className="flex items-center gap-1 text-xs text-success-600 dark:text-success-400"><ShieldCheck className="h-3 w-3" /> Verified</p>}</div></div>}{!showContact ? <button type="button" onClick={handleShowContact} className="btn-primary mt-4 w-full">{profile ? 'Show Contact Details' : 'Sign in to Contact'}</button> : <div className="mt-4 space-y-3">{listing.contact_phone && <a href={`tel:${listing.contact_phone}`} className="flex items-center gap-3 rounded-lg bg-gray-50 px-2 py-3 text-sm dark:bg-brand-800/50"><Phone className="h-4 w-4 text-brand-600" /> {listing.contact_phone}</a>}{listing.contact_email && <a href={`mailto:${listing.contact_email}`} className="flex items-center gap-3 rounded-lg bg-gray-50 px-2 py-3 text-sm dark:bg-brand-800/50"><Mail className="h-4 w-4 text-brand-600" /> {listing.contact_email}</a>}{Array.isArray(listing.social_links) && listing.social_links.length > 0 && <div className="space-y-2">{(listing.social_links as any[]).map((link, i) => { const socialLink = typeof link === 'string' ? { platform: 'Link', url: link } : link; return <a key={i} href={socialLink.url ?? '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg bg-gray-50 px-2 py-3 text-sm dark:bg-brand-800/50"><Link2 className="h-4 w-4 text-brand-600" /> {socialLink.platform}</a>; })}</div>}</div>}</div>

          <div className="card p-6"><h3 className="text-base font-semibold text-gray-900 dark:text-white">Need a Mover?</h3><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Browse verified movers to help you relocate to this property.</p><button onClick={() => navigate('movers')} className="btn-secondary mt-3 w-full">Find Movers</button></div>
        </div>
      </div>

      {showPaymentInfo && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-brand-900"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Payment Information</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Payment methods configured by the property owner.</p></div><button type="button" onClick={() => setShowPaymentInfo(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-white"><X className="h-5 w-5" /></button></div>{paymentMethods.length === 0 ? <p className="mt-6 rounded-lg bg-gray-50 p-4 text-sm text-gray-500 dark:bg-brand-800/60 dark:text-gray-400">No active payment method is currently configured for this property.</p> : <div className="mt-5 space-y-3">{paymentMethods.map((method) => <div key={method.id} className="rounded-lg border border-gray-200 p-4 dark:border-brand-700"><div className="flex items-center justify-between gap-3"><p className="font-semibold text-gray-900 dark:text-white">{method.display_name || method.provider}</p>{method.is_default && <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200">Default</span>}</div>{method.payment_method && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Method: {method.payment_method}</p>}{method.paybill_number && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Paybill: <span className="font-semibold">{method.paybill_number}</span>{method.paybill_account ? ` · Account: ${method.paybill_account}` : ''}</p>}{method.till_number && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Till number: <span className="font-semibold">{method.till_number}</span></p>}{method.paypal_email && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">PayPal: <span className="font-semibold">{method.paypal_email}</span></p>}</div>)}</div>}<p className="mt-5 text-xs text-gray-500 dark:text-gray-400">SakaKrib does not initiate or record a payment from this screen. Use the payment details provided by the property owner.</p></div></div>}
    </div>
  );
}