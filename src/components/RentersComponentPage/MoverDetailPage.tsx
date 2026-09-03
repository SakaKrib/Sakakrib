import { useState, useEffect } from 'react';
import {
  Truck, MapPin, Phone, Star, ShieldCheck, ArrowLeft, Loader2,
  Calendar, Navigation, DollarSign, CheckCircle2, Percent
} from 'lucide-react';
import { useNav } from '@/context/NavContext';
import { useAuth } from '@/context/AuthContext';
import { protectedGet, protectedPost } from '@/lib/djangoApi';
import { formatKES, cn } from '@/lib/utils';

interface Mover {
  id: string;
  driver_full_name: string;
  vehicle_type: string;
  number_plate: string;
  operating_city: string;
  operating_county: string;
  phone: string;
  profile_photo_url?: string | null;
  base_rate_kes: number | string;
  rate_per_km_kes?: number | string;
  is_available: boolean;
  approval_status?: string;
}

interface Review {
  id: string;
  rating: number;
  comment: string;
  created_at?: string;
}

interface BookingRequestResult {
  booking_id: string;
  status: string;
  request_expires_at?: string;
  distance_km?: number;
  quote?: {
    renter_total_kes?: number | string;
    platform_fee_kes?: number | string;
    mover_net_kes?: number | string;
  };
}

export default function MoverDetailPage() {
  const { selectedMoverId, navigate } = useNav();
  const { profile } = useAuth();
  const [mover, setMover] = useState<Mover | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingResult, setBookingResult] = useState<BookingRequestResult | null>(null);

  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [movingDate, setMovingDate] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'paypal'>('mpesa');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedMoverId) return;

    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [moverData, reviewData] = await Promise.all([
          protectedGet<Mover>(`/api/movers/${selectedMoverId}/`),
          protectedGet<{ items: Review[] }>(`/api/reviews/?mover_id=${encodeURIComponent(selectedMoverId)}&reviewee_id=&listing_id=`),
        ]);

        if (cancelled) return;
        setMover(moverData ?? null);
        setReviews(reviewData?.items ?? []);
      } catch (err) {
        if (!cancelled) {
          setMover(null);
          setReviews([]);
          setError(err instanceof Error ? err.message : 'Unable to load mover details.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [selectedMoverId]);

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!profile) {
      setError('Please sign in to request a mover.');
      return;
    }
    if (!mover) {
      setError('Mover information is unavailable.');
      return;
    }
    const distance = Number(distanceKm);
    if (!pickup.trim() || !dropoff.trim() || !movingDate || !Number.isFinite(distance) || distance <= 0) {
      setError('Please provide pickup, drop-off, moving date, and a valid distance in kilometres.');
      return;
    }

    setSubmitting(true);
    try {
      // Django is authoritative for the booking amount, commission and payment status.
      // The old Supabase flow trusted client-supplied totals and incorrectly marked
      // payment_status as "paid" before any payment had actually been processed.
      const result = await protectedPost<BookingRequestResult>('/api/bookings/request/', {
        mover_id: mover.id,
        pickup_address: pickup.trim(),
        dropoff_address: dropoff.trim(),
        distance_km: distance,
        moving_date: movingDate,
        preferred_payment_method: paymentMethod,
      });

      setBookingResult(result);
      setBookingSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!mover) {
    return (
      <div className="py-20 text-center">
        <Truck className="mx-auto h-12 w-12 text-gray-300" />
        <p className="mt-4 text-gray-500 dark:text-gray-400">Mover not found.</p>
        {error && <p className="mx-auto mt-2 max-w-md text-sm text-error-600">{error}</p>}
        <button onClick={() => navigate('movers')} className="btn-primary mt-4">Browse Movers</button>
      </div>
    );
  }

  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
    : 0;

  if (bookingSuccess) {
    const quoteTotal = Number(bookingResult?.quote?.renter_total_kes || 0);
    const platformFee = Number(bookingResult?.quote?.platform_fee_kes || 0);
    return (
      <div className="mx-auto max-w-2xl px-2 py-12">
        <div className="card p-8 text-center animate-scale-in">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
            <CheckCircle2 className="h-10 w-10 text-success-600 dark:text-success-400" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Moving Request Submitted</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Your request has been sent to the mover. The mover has 30 minutes to respond.
          </p>
          <div className="mt-6 rounded-xl bg-gray-50 p-4 text-left dark:bg-brand-800/30">
            <div className="flex justify-between py-1 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Moving Date</span>
              <span className="font-semibold text-gray-900 dark:text-white">{movingDate}</span>
            </div>
            <div className="flex justify-between py-1 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Distance</span>
              <span className="font-semibold text-gray-900 dark:text-white">{bookingResult?.distance_km ?? distanceKm} km</span>
            </div>
            <div className="flex justify-between py-1 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Estimated Total</span>
              <span className="font-semibold text-gray-900 dark:text-white">{formatKES(quoteTotal)}</span>
            </div>
            <div className="flex justify-between py-1 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Platform Fee</span>
              <span className="font-semibold text-brand-600 dark:text-brand-400">{formatKES(platformFee)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 dark:border-brand-700">
              <span className="font-bold text-gray-900 dark:text-white">Payment Status</span>
              <span className="font-bold text-warning-600 dark:text-warning-400">Awaiting mover confirmation</span>
            </div>
          </div>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => navigate('dashboard')} className="btn-primary">View My Bookings</button>
            <button onClick={() => navigate('movers')} className="btn-secondary">Browse More Movers</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-2 py-8 sm:px-6">
      <button onClick={() => navigate('movers')} className="mb-4 flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-brand-600 dark:text-gray-400">
        <ArrowLeft className="h-4 w-4" /> Back to Movers
      </button>

      <div className="card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-white shadow-lg">
            <Truck className="h-10 w-10" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{mover.driver_full_name}</h1>
            <p className="mt-1 flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <MapPin className="h-4 w-4" /> {mover.operating_city}, {mover.operating_county}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="badge bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400">
                {mover.vehicle_type === 'pickup' ? 'Pickup Truck' : mover.vehicle_type === 'lorry' ? 'Lorry / Canter' : 'Trailer'}
              </span>
              <span className="badge bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300">{mover.number_plate}</span>
              <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                <ShieldCheck className="h-3 w-3" /> Verified
              </span>
              {mover.is_available && (
                <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200">Available</span>
              )}
            </div>
          </div>
          {avgRating > 0 && (
            <div className="flex items-center gap-1">
              <Star className="h-5 w-5 fill-warning-500 text-warning-500" />
              <span className="text-lg font-bold text-gray-900 dark:text-white">{avgRating.toFixed(1)}</span>
              <span className="text-sm text-gray-400">({reviews.length})</span>
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-4 border-t border-gray-200 pt-6 dark:border-brand-800 sm:grid-cols-2">
          {Number(mover.base_rate_kes) > 0 && (
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-400">Base Rate</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">From {formatKES(Number(mover.base_rate_kes))}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Phone className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">Phone</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{mover.phone}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-2 py-3 dark:border-brand-700 dark:bg-brand-800/30">
        <Percent className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />
        <p className="text-sm text-brand-700 dark:text-brand-300">
          The platform fee is calculated securely by Django and included in the booking quote.
        </p>
      </div>

      {!showBooking ? (
        <button onClick={() => profile ? setShowBooking(true) : navigate('home')} className="btn-primary mt-4 w-full">
          {profile ? 'Request This Mover' : 'Sign in to Book'}
        </button>
      ) : (
        <form onSubmit={handleBooking} className="card mt-4 space-y-4 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Request This Mover</h3>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Pickup Address</label>
            <div className="relative">
              <Navigation className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input required type="text" value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="Current address" className="input-field pl-10" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Drop-off Address</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input required type="text" value={dropoff} onChange={(e) => setDropoff(e.target.value)} placeholder="Destination address" className="input-field pl-10" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Moving Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input required type="date" value={movingDate} onChange={(e) => setMovingDate(e.target.value)} className="input-field pl-10" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Estimated Distance (km)</label>
              <input required type="number" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} placeholder="e.g. 15" className="input-field" min={0.1} step="0.1" />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Preferred Payment Method</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'mpesa' as const, label: 'M-Pesa' },
                { value: 'paypal' as const, label: 'PayPal' },
              ].map((method) => (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => setPaymentMethod(method.value)}
                  className={cn(
                    'rounded-lg border-2 py-2.5 text-sm font-semibold transition-colors',
                    paymentMethod === method.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                      : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400'
                  )}
                >
                  {method.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-error-50 px-2 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting Request...</> : 'Submit Moving Request'}
          </button>
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            Payment is not marked as paid until the payment provider confirms it. The mover must first accept the request.
          </p>
        </form>
      )}

      {reviews.length > 0 && (
        <div className="card mt-6 p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <Star className="h-5 w-5 text-brand-600" /> Reviews ({avgRating.toFixed(1)})
          </h3>
          <div className="mt-4 space-y-4">
            {reviews.map((review) => (
              <div key={review.id} className="border-l-2 border-brand-200 pl-4 dark:border-brand-700">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className={cn('h-4 w-4', star <= review.rating ? 'fill-warning-500 text-warning-500' : 'text-gray-300 dark:text-brand-700')} />
                  ))}
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{review.comment}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
