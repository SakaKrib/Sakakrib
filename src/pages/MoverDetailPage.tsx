import { useState, useEffect } from 'react';
import {
  Truck, MapPin, Phone, Star, ShieldCheck, ArrowLeft, Loader2,
  Calendar, DollarSign, CheckCircle2, Percent, CreditCard
} from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
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

function parseMovingDate(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatMovingDate(date: Date | null) {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function MoverDetailPage() {
  const { selectedMoverId, navigate } = useNav();
  const { profile } = useAuth();
  const [mover, setMover] = useState<Mover | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [submittedQuote, setSubmittedQuote] = useState<MoverQuote | null>(null);

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

  const handleMovingDateChange = (date: Date | null) => {
    setMovingDate(formatMovingDate(date));
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!profile) { setError('Please sign in to book a mover.'); return; }
    if (!mover) { setError('Mover details are still loading. Please try again.'); return; }
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

  if (loading) return <div className="flex min-h-[500px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>;
  if (error && !mover) return <div className="mx-auto max-w-3xl px-4 py-12"><div className="card p-6 text-center"><p className="text-sm text-error-600">{error}</p><button type="button" onClick={() => navigate('movers')} className="btn-primary mt-4">Back to movers</button></div></div>;
  if (!mover) return <div className="mx-auto max-w-3xl px-4 py-12"><div className="card p-6 text-center"><p className="text-sm text-gray-600">Mover not found.</p><button type="button" onClick={() => navigate('movers')} className="btn-primary mt-4">Back to movers</button></div></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <button type="button" onClick={() => navigate('movers')} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400"><ArrowLeft className="h-4 w-4" />Back to movers</button>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="card p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-900/40"><Truck className="h-7 w-7 text-brand-600" /></div>
            <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">{mover.business_name || mover.driver_full_name || 'Mover'}</h1><p className="mt-1 text-sm text-gray-500">{mover.operating_city || mover.operating_county || 'Kenya'}</p></div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-900"><p className="text-xs text-gray-500">Rating</p><p className="mt-1 flex items-center gap-1 font-semibold"><Star className="h-4 w-4 fill-current" />{Number(mover.rating ?? 0).toFixed(1)}</p></div>
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-900"><p className="text-xs text-gray-500">Status</p><p className="mt-1 flex items-center gap-1 font-semibold"><ShieldCheck className="h-4 w-4" />{mover.approval_status || 'approved'}</p></div>
          </div>
          <div className="mt-6 space-y-3 text-sm text-gray-600 dark:text-gray-300"><p className="flex items-center gap-2"><Phone className="h-4 w-4" />{mover.phone || 'Phone available after booking'}</p><p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{mover.operating_city || mover.operating_county || 'Kenya'}</p></div>
          {reviews.length > 0 && <div className="mt-6 border-t border-gray-100 pt-5 dark:border-brand-800"><h2 className="font-semibold text-gray-900 dark:text-white">Recent reviews</h2><div className="mt-3 space-y-3">{reviews.slice(0, 3).map((review) => <div key={review.id} className="rounded-xl bg-gray-50 p-3 text-sm dark:bg-brand-900"><p className="font-medium">{review.comment || 'Great service.'}</p></div>)}</div></div>}
        </section>

        <section className="card p-6">
          <div className="mb-5"><h2 className="text-xl font-bold text-gray-900 dark:text-white">Schedule a move</h2><p className="mt-1 text-sm text-gray-500">Enter your pickup and drop-off locations, then choose a pickup date.</p></div>
          {bookingSuccess ? (
            <div className="rounded-xl bg-success-50 p-5 text-success-800 dark:bg-success-900/20 dark:text-success-300"><CheckCircle2 className="h-6 w-6" /><h3 className="mt-2 font-semibold">Booking request submitted</h3><p className="mt-1 text-sm">Your mover request has been sent successfully.</p>{submittedQuote && <div className="mt-4 space-y-1 text-sm"><p>Move total: <strong>{formatKES(Number(submittedQuote.renter_total_kes))}</strong></p><p>Platform fee: <strong>{formatKES(Number(submittedQuote.platform_fee_kes))}</strong></p><p>Mover net: <strong>{formatKES(Number(submittedQuote.mover_net_kes))}</strong></p></div>}</div>
          ) : (
            <form onSubmit={handleBooking} className="space-y-5">
              <GPSLocationInput label="Pickup location" value={pickupLocation} onChange={setPickupLocation} placeholder="Search pickup location" />
              <GPSLocationInput label="Drop-off location" value={dropoffLocation} onChange={setDropoffLocation} placeholder="Search drop-off location" />
              <div><label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Pickup date</label><DatePicker selected={parseMovingDate(movingDate)} onChange={handleMovingDateChange} minDate={new Date()} dateFormat="dd/MM/yyyy" placeholderText="Select pickup date" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-900 dark:text-white" /></div>
              <div className="rounded-xl bg-brand-50 p-4 dark:bg-brand-900/40"><div className="flex items-center justify-between"><span className="text-sm text-gray-600 dark:text-gray-300">Move total</span><span className="text-lg font-bold text-brand-700 dark:text-brand-300">{quoting ? 'Calculating…' : formatKES(total)}</span></div><div className="mt-2 flex items-center justify-between text-xs text-gray-500"><span>Platform fee</span><span>{formatKES(commission)}</span></div></div>
              {error && <p className="text-sm text-error-600">{error}</p>}
              <div className="grid gap-3 sm:grid-cols-2"><label className={cn('cursor-pointer rounded-xl border p-4', paymentMethod === 'mpesa' ? 'border-gray-500 bg-brand-50 text-gray-800' : 'border-gray-200')}><input type="radio" className="sr-only" name="payment" value="mpesa" checked={paymentMethod === 'mpesa'} onChange={() => setPaymentMethod('mpesa')} /><span className="flex items-center gap-2 font-medium"><CreditCard className="h-4 w-4" />M-Pesa</span></label><label className={cn('cursor-pointer rounded-xl border p-4', paymentMethod === 'paypal' ? 'border-gray-500 bg-brand-50 text-gray-800' : 'border-gray-200')}><input type="radio" className="sr-only" name="payment" value="paypal" checked={paymentMethod === 'paypal'} onChange={() => setPaymentMethod('paypal')} /><span className="flex items-center gap-2 font-medium"><DollarSign className="h-4 w-4" />PayPal</span></label></div>
              <button type="submit" disabled={submitting || quoting} className="btn-primary w-full">{submitting ? 'Submitting…' : 'Request mover'}</button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
