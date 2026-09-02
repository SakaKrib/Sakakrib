import { useState, useEffect } from 'react';
import {
  Truck, MapPin, Phone, Star, ShieldCheck, ArrowLeft, Loader2,
  Calendar, Navigation, DollarSign, CheckCircle2, Percent, CreditCard
} from 'lucide-react';
import { useNav } from '@/context/NavContext';
import { useAuth } from '@/context/AuthContext';
import { protectedGet } from '@/lib/protectedApi';
import { formatKES, validatePhone, COMMISSION_RATE, cn } from '@/lib/utils';
import type { Mover, Review } from '@/lib/supabase';

export default function MoverDetailPage() {
  const { selectedMoverId, navigate } = useNav();
  const { profile } = useAuth();
  const [mover, setMover] = useState<Mover | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // Booking form
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [movingDate, setMovingDate] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('mpesa');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedMoverId) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const moverData = await protectedGet<Mover[]>(
          `/rest/v1/movers?id=eq.${encodeURIComponent(selectedMoverId)}`
        );
        const loadedMover = Array.isArray(moverData) ? moverData[0] : undefined;
        if (loadedMover) {
          setMover(loadedMover);
          const reviewData = await protectedGet<Review[]>(
            `/rest/v1/reviews?mover_id=eq.${encodeURIComponent(selectedMoverId)}&review_type=eq.mover&order=created_at.desc`
          );
          if (Array.isArray(reviewData)) setReviews(reviewData);
        } else {
          setMover(null);
          setReviews([]);
        }
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

  const bookingAmount = Number(amount) || 0;
  const commission = bookingAmount * COMMISSION_RATE;
  const total = bookingAmount + commission;

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!profile) { setError('Please sign in to book a mover.'); return; }
    if (!pickup.trim() || !dropoff.trim() || !movingDate || bookingAmount <= 0) {
      setError('Please fill in all booking details.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: bookingError } = await supabase.from('bookings').insert({
        renter_id: profile.id,
        mover_id: mover!.id,
        pickup_address: pickup,
        dropoff_address: dropoff,
        moving_date: movingDate,
        booking_amount: bookingAmount,
        commission_amount: commission,
        total_amount: total,
        status: 'pending',
        payment_status: 'paid',
        payment_method: paymentMethod,
      });
      if (bookingError) throw bookingError;
      setBookingSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed.');
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
    return (
      <div className="mx-auto max-w-2xl px-2 py-12">
        <div className="card p-8 text-center animate-scale-in">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
            <CheckCircle2 className="h-10 w-10 text-success-600 dark:text-success-400" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Booking Confirmed!</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Your moving request has been submitted. The mover will confirm shortly.
          </p>
          <div className="mt-6 rounded-xl bg-gray-50 p-4 text-left dark:bg-brand-800/30">
            <div className="flex justify-between text-sm py-1">
              <span className="text-gray-500 dark:text-gray-400">Moving Date</span>
              <span className="font-semibold text-gray-900 dark:text-white">{movingDate}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-gray-500 dark:text-gray-400">Service Amount</span>
              <span className="font-semibold text-gray-900 dark:text-white">{formatKES(bookingAmount)}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-gray-500 dark:text-gray-400">Platform Commission (10%)</span>
              <span className="font-semibold text-brand-600 dark:text-brand-400">{formatKES(commission)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 dark:border-brand-700">
              <span className="font-bold text-gray-900 dark:text-white">Total Paid</span>
              <span className="font-bold text-brand-600 dark:text-brand-400">{formatKES(total)}</span>
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
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Pickup Address</label>
            <div className="relative">
              <Navigation className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="text" value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="Current address" className="input-field pl-10" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Drop-off Address</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="text" value={dropoff} onChange={(e) => setDropoff(e.target.value)} placeholder="Destination address" className="input-field pl-10" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Moving Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input type="date" value={movingDate} onChange={(e) => setMovingDate(e.target.value)} className="input-field pl-10" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Agreed Amount (KES)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 5000" className="input-field" min={0} />
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'mpesa', label: 'M-Pesa' },
                { value: 'airtel', label: 'Airtel Money' },
                { value: 'card', label: 'Card / PayPal' },
              ].map((p) => (
                <button key={p.value} type="button" onClick={() => setPaymentMethod(p.value)} className={cn('rounded-lg border px-3 py-2 text-sm font-medium transition-colors', paymentMethod === p.value ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' : 'border-gray-200 text-gray-600 dark:border-brand-700 dark:text-gray-300')}>
                  <CreditCard className="mx-auto mb-1 h-4 w-4" />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {bookingAmount > 0 && (
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
              <div className="flex justify-between text-sm py-1">
                <span className="text-gray-500 dark:text-gray-400">Service Amount</span>
                <span className="font-semibold text-gray-900 dark:text-white">{formatKES(bookingAmount)}</span>
              </div>
              <div className="flex justify-between text-sm py-1">
                <span className="text-gray-500 dark:text-gray-400">Platform Commission</span>
                <span className="font-semibold text-brand-600 dark:text-brand-400">{formatKES(commission)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 dark:border-brand-700">
                <span className="font-bold text-gray-900 dark:text-white">Total</span>
                <span className="font-bold text-brand-600 dark:text-brand-400">{formatKES(total)}</span>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-error-600">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Submit Booking Request'}
          </button>
        </form>
      )}

      {/* Reviews */}
      {reviews.length > 0 && (
        <div className="mt-6 card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Reviews</h2>
          <div className="mt-4 space-y-4">
            {reviews.map((review) => (
              <div key={review.id} className="border-b border-gray-100 pb-4 last:border-0 dark:border-brand-800">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-warning-500 text-warning-500" />
                    <span className="font-semibold text-gray-900 dark:text-white">{review.rating}/5</span>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(review.created_at).toLocaleDateString()}</span>
                </div>
                {review.comment && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{review.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
