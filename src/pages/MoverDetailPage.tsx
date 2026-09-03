import { useState, useEffect } from 'react';
import {
  Truck, MapPin, Phone, Star, ShieldCheck, ArrowLeft, Loader2,
  Calendar, DollarSign, CheckCircle2, Percent, CreditCard
} from 'lucide-react';
import { useNav } from '@/context/NavContext';
import { useAuth } from '@/context/AuthContext';
import { protectedGet, protectedPost } from '@/lib/djangoApi';
import GPSLocationInput, { type GPSLocationValue } from '@/components/Helpers/GPSLocationInput';
import { formatKES, COMMISSION_RATE, cn } from '@/lib/utils';
import type { Mover, Review } from '@/types/domain';

type MoverQuote = {
  mover_id: string;
  distance_km: number;
  base_rate_kes: number | string;
  rate_per_km_kes: number | string;
  renter_total_kes: number | string;
  platform_fee_kes: number | string;
  platform_commission_rate: number | string;
  mover_net_kes: number | string;
};

export default function MoverDetailPage() {
  const { selectedMoverId, navigate } = useNav();
  const { profile } = useAuth();
  const [mover, setMover] = useState<Mover | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [submittedQuote, setSubmittedQuote] = useState<MoverQuote | null>(null);

  // Booking form
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [pickupLocation, setPickupLocation] = useState<GPSLocationValue>({
    locationSearch: '', latitude: null, longitude: null,
  });
  const [dropoffLocation, setDropoffLocation] = useState<GPSLocationValue>({
    locationSearch: '', latitude: null, longitude: null,
  });
  const [movingDate, setMovingDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('mpesa');
  const [quote, setQuote] = useState<MoverQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedMoverId) return;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const moverData = await protectedGet<Mover>(
          `/api/core/movers/${encodeURIComponent(selectedMoverId)}/`
        );
        setMover(moverData);

        const reviewData = await protectedGet<{ items: Review[] }>(
          `/api/core/reviews/?mover_id=${encodeURIComponent(selectedMoverId)}`
        );
        setReviews(Array.isArray(reviewData?.items) ? reviewData.items : []);
      } catch (requestError) {
        console.error('Failed to load mover details:', requestError);
        setMover(null);
        setReviews([]);
        setError(requestError instanceof Error ? requestError.message : 'Unable to load mover details.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedMoverId]);

  useEffect(() => {
    if (!mover || pickupLocation.latitude === null || pickupLocation.longitude === null ||
        dropoffLocation.latitude === null || dropoffLocation.longitude === null) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    const getQuote = async () => {
      setQuoting(true);
      try {
        const latitude1 = pickupLocation.latitude! * Math.PI / 180;
        const longitude1 = pickupLocation.longitude! * Math.PI / 180;
        const latitude2 = dropoffLocation.latitude! * Math.PI / 180;
        const longitude2 = dropoffLocation.longitude! * Math.PI / 180;
        const dLatitude = latitude2 - latitude1;
        const dLongitude = longitude2 - longitude1;
        const haversine = Math.min(1, Math.max(0,
          Math.sin(dLatitude / 2) ** 2 +
          Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(dLongitude / 2) ** 2
        ));
        const distanceKm = Number((6371.0088 * 2 * Math.asin(Math.sqrt(haversine))).toFixed(2));

        const result = await protectedPost<MoverQuote>('/api/core/movers/quote/', {
          mover_id: mover.id,
          distance_km: distanceKm,
        });
        if (!cancelled) setQuote(result);
      } catch (quoteError) {
        if (!cancelled) {
          setQuote(null);
          setError(quoteError instanceof Error ? quoteError.message : 'Unable to calculate the mover quote.');
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    };

    getQuote();
    return () => { cancelled = true; };
  }, [mover, pickupLocation.latitude, pickupLocation.longitude, dropoffLocation.latitude, dropoffLocation.longitude]);

  useEffect(() => {
    setPickup(pickupLocation.locationSearch);
  }, [pickupLocation.locationSearch]);

  useEffect(() => {
    setDropoff(dropoffLocation.locationSearch);
  }, [dropoffLocation.locationSearch]);

  const bookingAmount = Number(quote?.renter_total_kes ?? 0);
  const commission = Number(quote?.platform_fee_kes ?? 0);
  const total = bookingAmount;

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!profile) { setError('Please sign in to book a mover.'); return; }
    if (!pickup.trim() || !dropoff.trim() || !movingDate) {
      setError('Please fill in all booking details.');
      return;
    }
    if (!quote || pickupLocation.latitude === null || pickupLocation.longitude === null ||
        dropoffLocation.latitude === null || dropoffLocation.longitude === null) {
      setError('Please select both pickup and drop-off locations so the route can be calculated.');
      return;
    }
    if (paymentMethod !== 'mpesa' && paymentMethod !== 'paypal') {
      setError('Please select M-Pesa or PayPal.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await protectedPost<{
        booking_id: string;
        status: string;
        quote: MoverQuote;
      }>('/api/core/bookings/request/', {
        mover_id: mover.id,
        pickup_address: pickup.trim(),
        dropoff_address: dropoff.trim(),
        moving_date: movingDate,
        pickup_latitude: pickupLocation.latitude,
        pickup_longitude: pickupLocation.longitude,
        dropoff_latitude: dropoffLocation.latitude,
        dropoff_longitude: dropoffLocation.longitude,
        preferred_payment_method: paymentMethod,
      });

      setSubmittedQuote(result.quote);
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
        <button onClick={() => navigate('movers')} className="btn-primary mt-4">Browse Movers</button>
      </div>
    );
  }

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  if (bookingSuccess) {
    const submittedTotal = Number(submittedQuote?.renter_total_kes ?? total);
    const submittedFee = Number(submittedQuote?.platform_fee_kes ?? commission);

    return (
      <div className="mx-auto max-w-2xl px-2 py-12">
        <div className="card p-8 text-center animate-scale-in">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
            <CheckCircle2 className="h-10 w-10 text-success-600 dark:text-success-400" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Moving Request Submitted</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Your moving request has been submitted. The mover will confirm shortly. Payment has not been taken yet.
          </p>
          <div className="mt-6 rounded-xl bg-gray-50 p-4 text-left dark:bg-brand-800/30">
            <div className="flex justify-between text-sm py-1">
              <span className="text-gray-500 dark:text-gray-400">Moving Date</span>
              <span className="font-semibold text-gray-900 dark:text-white">{movingDate}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-gray-500 dark:text-gray-400">Calculated Distance</span>
              <span className="font-semibold text-gray-900 dark:text-white">{submittedQuote?.distance_km ?? quote?.distance_km ?? 0} km</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-gray-500 dark:text-gray-400">Quoted Moving Cost</span>
              <span className="font-semibold text-gray-900 dark:text-white">{formatKES(submittedTotal - submittedFee)}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-gray-500 dark:text-gray-400">Platform Commission</span>
              <span className="font-semibold text-brand-600 dark:text-brand-400">{formatKES(submittedFee)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 dark:border-brand-700">
              <span className="font-bold text-gray-900 dark:text-white">Total Due After Confirmation</span>
              <span className="font-bold text-brand-600 dark:text-brand-400">{formatKES(submittedTotal)}</span>
            </div>
          </div>
          <div className="mt-6 flex gap-3 justify-center">
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
              <span className="badge bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300">
                {mover.number_plate}
              </span>
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
          {mover.base_rate_kes > 0 && (
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-400">Base Rate</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">From {formatKES(mover.base_rate_kes)}</p>
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

      {/* Commission Info */}
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-2 py-3 dark:border-brand-700 dark:bg-brand-800/30">
        <Percent className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />
        <p className="text-sm text-brand-700 dark:text-brand-300">
          A <span className="font-semibold">{COMMISSION_RATE * 100}% platform commission</span> is automatically added to your booking total.
        </p>
      </div>

      {/* Booking Form */}
      {!showBooking ? (
        <button onClick={() => profile ? setShowBooking(true) : navigate('home')} className="btn-primary mt-4 w-full">
          {profile ? 'Book This Mover' : 'Sign in to Book'}
        </button>
      ) : (
        <form onSubmit={handleBooking} className="card mt-4 space-y-4 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Book This Mover</h3>

          <GPSLocationInput
            value={pickupLocation}
            onChange={setPickupLocation}
            label="Pickup Address"
            placeholder="Search for your pickup location..."
            required
          />

          <GPSLocationInput
            value={dropoffLocation}
            onChange={setDropoffLocation}
            label="Drop-off Address"
            placeholder="Search for your destination..."
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Moving Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input type="date" value={movingDate} onChange={(e) => setMovingDate(e.target.value)} className="input-field pl-10" />
              </div>
            </div>
            <div className="flex items-end">
              <div className="w-full rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-brand-800/30">
                <p className="text-xs text-gray-400">Route Distance</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {quoting ? 'Calculating...' : quote ? `${quote.distance_km} km` : 'Select both locations'}
                </p>
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Preferred Payment Method</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'mpesa', label: 'M-Pesa' },
                { value: 'paypal', label: 'PayPal' },
              ].map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPaymentMethod(p.value)}
                  className={cn(
                    'rounded-lg border-2 py-2.5 text-sm font-semibold transition-colors',
                    paymentMethod === p.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                      : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cost Summary */}
          {quote && (
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
              <div className="flex justify-between py-1 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Quoted Moving Cost</span>
                <span className="font-semibold text-gray-900 dark:text-white">{formatKES(Number(quote.renter_total_kes) - Number(quote.platform_fee_kes))}</span>
              </div>
              <div className="flex justify-between py-1 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Platform Commission</span>
                <span className="font-semibold text-brand-600 dark:text-brand-400">{formatKES(Number(quote.platform_fee_kes))}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 dark:border-brand-700">
                <span className="font-bold text-gray-900 dark:text-white">Total Due After Confirmation</span>
                <span className="font-bold text-brand-600 dark:text-brand-400">{formatKES(Number(quote.renter_total_kes))}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-error-50 px-2 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div>
          )}

          <button type="submit" disabled={submitting || quoting || !quote} className="btn-primary w-full">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting Request...</> : <><CreditCard className="h-4 w-4" /> Submit Moving Request</>}
          </button>
        </form>
      )}

      {/* Reviews */}
      {reviews.length > 0 && (
        <div className="card mt-6 p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <Star className="h-5 w-5 text-brand-600" /> Reviews ({avgRating.toFixed(1)})
          </h3>
          <div className="mt-4 space-y-4">
            {reviews.map((review) => (
              <div key={review.id} className="border-l-2 border-brand-200 pl-4 dark:border-brand-700">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className={cn('h-4 w-4', s <= review.rating ? 'fill-warning-500 text-warning-500' : 'text-gray-300 dark:text-brand-700')} />
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
