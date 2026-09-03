import { useState, useEffect } from 'react';
import {
  MapPin, BedDouble, Bath, Maximize, Phone, Mail, Link2,
  ChevronLeft, ChevronRight, ShieldCheck, Star, Home, Loader2, ArrowLeft,
  DollarSign, Calendar
} from 'lucide-react';
import { useNav } from '@/context/NavContext';
import { useAuth } from '@/context/AuthContext';
import { protectedGet } from '@/lib/djangoApi';
import { formatKES, timeAgo, cn } from '@/lib/utils';
import type { Listing, ListingMedia, Review, Profile } from '@/types/domain';

type ListingDetailResponse = Listing & {
  landlord: Profile | null;
};

type ReviewListResponse = {
  items: Review[];
};

export default function ListingDetailPage() {
  const { selectedListingId, navigate } = useNav();
  const { profile } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [media, setMedia] = useState<ListingMedia[]>([]);
  const [landlord, setLandlord] = useState<Profile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [showContact, setShowContact] = useState(false);

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
        setListing(null);
        setMedia([]);
        setLandlord(null);
        setReviews([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedListingId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="py-20 text-center">
        <Home className="mx-auto h-12 w-12 text-gray-300" />
        <p className="mt-4 text-gray-500 dark:text-gray-400">Listing not found.</p>
        <button onClick={() => navigate('listings')} className="btn-primary mt-4">Browse Listings</button>
      </div>
    );
  }

  const handleShowContact = () => {
  if (!profile) {
    navigate('home');
    return;
  }

  setShowContact(true);
};

  const photos = media.filter((m) => m.media_type === 'photo');
  const video = media.find((m) => m.media_type === 'video');
  const avgRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  return (
    <div className="mx-auto max-w-5xl px-2 py-8 sm:px-6">
      <button onClick={() => navigate('listings')} className="mb-4 flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-brand-600 dark:text-gray-400">
        <ArrowLeft className="h-4 w-4" /> Back to Listings
      </button>

      {/* Image Gallery */}
      {photos.length > 0 ? (
        <div className="mb-6">
          <div className="relative h-64 overflow-hidden rounded-xl bg-gray-200 sm:h-96 dark:bg-brand-800">
            <img src={photos[activeImage]?.url} alt={photos[activeImage]?.label ?? ''} className="h-full w-full object-cover" />
            {photos.length > 1 && (
              <>
                <button
                  onClick={() => setActiveImage((activeImage - 1 + photos.length) % photos.length)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-gray-700 backdrop-blur-sm transition-colors hover:bg-white"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setActiveImage((activeImage + 1) % photos.length)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-gray-700 backdrop-blur-sm transition-colors hover:bg-white"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-gray-900/60 px-3 py-1 text-xs font-medium text-white">
                  {activeImage + 1} / {photos.length}
                </div>
              </>
            )}
          </div>
          {photos.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              {photos.map((photo, i) => (
                <button
                  key={photo.id}
                  onClick={() => setActiveImage(i)}
                  className={cn(
                    'h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition-colors',
                    i === activeImage ? 'border-brand-500' : 'border-transparent'
                  )}
                >
                  <img src={photo.url} alt={photo.label ?? ''} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mb-6 flex h-64 items-center justify-center rounded-xl bg-gray-200 dark:bg-brand-800">
          <Home className="h-12 w-12 text-gray-400" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{listing.title}</h1>
                <p className="mt-1 flex items-center gap-1 text-gray-500 dark:text-gray-400">
                  <MapPin className="h-4 w-4" /> {listing.city}, {listing.county}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">
                  {formatKES(Number(listing.price_kes ?? 0))}
                </p>
                {listing.listing_type === 'rent' && (
                  <p className="text-sm text-gray-400">per month</p>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                {listing.listing_type === 'rent' ? 'For Rent' : 'For Sale'}
              </span>
              {landlord?.verification_status === 'verified' && (
                <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                  <ShieldCheck className="h-3 w-3" /> Verified Landlord
                </span>
              )}
              <span className="badge bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300">
                {timeAgo(listing.created_at ?? '')}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4 border-t border-gray-200 pt-6 dark:border-brand-800">
              <div className="text-center">
                <BedDouble className="mx-auto h-6 w-6 text-gray-400" />
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{listing.beds === 0 ? 'Studio' : listing.beds}</p>
                <p className="text-xs text-gray-400">Bedrooms</p>
              </div>
              <div className="text-center">
                <Bath className="mx-auto h-6 w-6 text-gray-400" />
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{listing.baths}</p>
                <p className="text-xs text-gray-400">Bathrooms</p>
              </div>
              <div className="text-center">
                <Maximize className="mx-auto h-6 w-6 text-gray-400" />
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{listing.size}</p>
                <p className="text-xs text-gray-400">Size</p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Description</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              {listing.description}
            </p>
          </div>

          {/* Deposit Info */}
          {listing.deposit_required && (
            <div className="card p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                <DollarSign className="h-5 w-5 text-brand-600" /> Deposit Details
              </h2>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Deposit Amount</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{formatKES(Number(listing.deposit_amount ?? 0))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Payment Structure</span>
                  <span className="font-semibold text-gray-900 dark:text-white capitalize">{listing.deposit_structure}</span>
                </div>
              </div>
            </div>
          )}

          {/* Video */}
          {video && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Walkthrough Video</h2>
              <video src={video.url} controls className="mt-3 w-full rounded-lg" />
            </div>
          )}

          {/* Reviews */}
          <div className="card p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
              <Star className="h-5 w-5 text-brand-600" /> Reviews
              {reviews.length > 0 && (
                <span className="text-sm font-normal text-gray-400">
                  ({avgRating.toFixed(1)} avg, {reviews.length} review{reviews.length !== 1 ? 's' : ''})
                </span>
              )}
            </h2>
            {reviews.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No reviews yet. Be the first to review this listing.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {reviews.map((review) => (
                  <div key={review.id} className="border-l-2 border-brand-200 pl-4 dark:border-brand-700">
                    <div className="flex items-center gap-2">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={cn('h-4 w-4', s <= review.rating ? 'fill-warning-500 text-warning-500' : 'text-gray-300 dark:text-brand-700')}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-gray-400">{timeAgo(review.created_at ?? '')}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{review.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Contact Card */}
          <div className="card p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Contact Landlord</h3>
            {landlord && (
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                  {((landlord.full_name ?? 'U').charAt(0)).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{landlord.full_name || 'Landlord'}</p>
                  {landlord.verification_status === 'verified' && (
                    <p className="flex items-center gap-1 text-xs text-success-600 dark:text-success-400">
                      <ShieldCheck className="h-3 w-3" /> Verified
                    </p>
                  )}
                </div>
              </div>
            )}

            {!showContact ? (
              <button
                type="button"
                onClick={handleShowContact}
                className="btn-primary mt-4 w-full"
              >
                {profile ? 'Show Contact Details' : 'Sign in to Contact'}
              </button>
            ) : (
              <div className="mt-4 space-y-3">
                {listing.contact_phone && (
                  <a href={`tel:${listing.contact_phone ?? ''}`} className="flex items-center gap-3 rounded-lg bg-gray-50 px-2 py-3 text-sm dark:bg-brand-800/50">
                    <Phone className="h-4 w-4 text-brand-600" /> {listing.contact_phone}
                  </a>
                )}
                {listing.contact_email && (
                  <a href={`mailto:${listing.contact_email ?? ''}`} className="flex items-center gap-3 rounded-lg bg-gray-50 px-2 py-3 text-sm dark:bg-brand-800/50">
                    <Mail className="h-4 w-4 text-brand-600" /> {listing.contact_email}
                  </a>
                )}
                {Array.isArray(listing.social_links) && listing.social_links.length > 0 && (
                  <div className="space-y-2">
                    {(listing.social_links as any[]).map((link, i) => {
                      const socialLink = typeof link === 'string' ? { platform: 'Link', url: link } : link;
                      return (
                        <a
                            key={i}
                              href={socialLink.url ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 rounded-lg bg-gray-50 px-2 py-3 text-sm dark:bg-brand-800/50"
                        >
                          <Link2 className="h-4 w-4 text-brand-600" /> {socialLink.platform}
                        </a>
                      );
                    })}
                  </div>
                )}
                <div className="rounded-lg bg-warning-50 px-2 py-3 dark:bg-warning-900/20">
                  <p className="text-xs font-medium text-warning-700 dark:text-warning-400">
                    SECURITY NOTICE: Make all payments through Saka Krib. Off-platform payments are not tracked.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Book a Mover */}
          <div className="card p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Need a Mover?</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Browse verified movers to help you relocate to this property.
            </p>
            <button onClick={() => navigate('movers')} className="btn-secondary mt-3 w-full">
              Find Movers
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
