import { useEffect, useState } from 'react';
import { Truck, MapPin, Phone, Star, ShieldCheck, ArrowLeft, Loader2, Calendar, Navigation, DollarSign, CheckCircle2, CreditCard } from 'lucide-react';
import { useNav } from '@/context/NavContext';
import { useAuth } from '@/context/AuthContext';
import { renterApi } from '@/lib/Renter/renterApi';
import { formatKES, cn } from '@/lib/utils';

interface Mover {
  id: string; driver_full_name: string; vehicle_type: string; number_plate: string; operating_city: string;
  operating_county: string; phone: string; profile_photo_url?: string | null; base_rate_kes: number;
  rate_per_km_kes: number; is_available: boolean; approval_status: string;
}
interface Review { id: string; rating: number; comment: string; created_at?: string; }

export default function MoverDetailPage() {
  const { selectedMoverId, navigate } = useNav();
  const { profile } = useAuth();
  const [mover, setMover] = useState<Mover | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [movingDate, setMovingDate] = useState('');
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [pickupLat, setPickupLat] = useState('');
  const [pickupLng, setPickupLng] = useState('');
  const [dropoffLat, setDropoffLat] = useState('');
  const [dropoffLng, setDropoffLng] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'paypal'>('mpesa');
  const [distanceKm, setDistanceKm] = useState('');
  const [quote, setQuote] = useState<{ renterTotalKes: number; commissionKes: number; baseRateKes: number; ratePerKmKes: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedMoverId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [moverData, reviewData] = await Promise.all([
          renterApi.getMover(selectedMoverId),
          fetchReviews(selectedMoverId),
        ]);
        if (!mounted) return;
        setMover(moverData as Mover);
        setReviews(reviewData);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Unable to load mover.');
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [selectedMoverId]);

  const fetchReviews = async (moverId: string): Promise<Review[]> => {
    const response = await fetch(`/api/core/reviews/?mover_id=${encodeURIComponent(moverId)}`, { credentials: 'include' });
    if (!response.ok) return [];
    const body = await response.json().catch(() => ({}));
    return Array.isArray(body.items) ? body.items : [];
  };

  const refreshQuote = async () => {
    setError(null);
    const distance = Number(distanceKm);
    if (!Number.isFinite(distance) || distance < 0) { setError('Enter a valid route distance in kilometres.'); return; }
    try {
      const next = await renterApi.getMoverQuote(mover!.id, distance);
      setQuote({ renterTotalKes: next.renterTotalKes, commissionKes: next.commissionKes, baseRateKes: next.baseRateKes, ratePerKmKes: next.ratePerKmKes });
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to calculate the server quote.'); }
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (!profile) { setError('Please sign in to book a mover.'); return; }
    if (!pickup.trim() || !dropoff.trim() || !movingDate) { setError('Pickup, destination and moving date are required.'); return; }
    const coordinates = [pickupLat, pickupLng, dropoffLat, dropoffLng].map(Number);
    if (coordinates.some((value) => !Number.isFinite(value))) { setError('Valid pickup and destination coordinates are required.'); return; }
    const distance = Number(distanceKm);
    if (!Number.isFinite(distance) || distance < 0) { setError('Enter a valid route distance in kilometres.'); return; }
    setSubmitting(true);
    try {
      const result = await renterApi.requestMoverBooking({
        moverId: mover!.id, pickupAddress: pickup.trim(), dropoffAddress: dropoff.trim(),
        pickupLatitude: coordinates[0], pickupLongitude: coordinates[1], dropoffLatitude: coordinates[2], dropoffLongitude: coordinates[3],
        distanceKm: distance, movingDate, paymentMethod,
      });
      setBookingId(result.booking_id); setBookingSuccess(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Booking request failed.'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-600" /></div>;
  if (!mover) return <div className="py-20 text-center"><Truck className="mx-auto h-12 w-12 text-gray-300" /><p className="mt-4 text-gray-500">Mover not found.</p><button onClick={() => navigate('movers')} className="btn-primary mt-4">Browse Movers</button></div>;

  const avgRating = reviews.length ? reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviews.length : 0;

  if (bookingSuccess) return (
    <div className="mx-auto max-w-2xl px-2 py-12"><div className="card p-8 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30"><CheckCircle2 className="h-10 w-10 text-success-600" /></div>
      <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Moving Request Sent</h2>
      <p className="mt-2 text-gray-500 dark:text-gray-400">The mover has received your request. Payment remains pending until the server payment flow confirms it.</p>
      {bookingId && <p className="mt-3 text-xs text-gray-400">Booking: {bookingId}</p>}
      <div className="mt-6 flex gap-3 justify-center"><button onClick={() => navigate('dashboard')} className="btn-primary">View My Bookings</button><button onClick={() => navigate('movers')} className="btn-secondary">Browse More Movers</button></div>
    </div></div>
  );

  return <div className="mx-auto max-w-4xl px-2 py-8 sm:px-6">
    <button onClick={() => navigate('movers')} className="mb-4 flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-brand-600"><ArrowLeft className="h-4 w-4" /> Back to Movers</button>
    <div className="card p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-white shadow-lg"><Truck className="h-10 w-10" /></div>
      <div className="flex-1"><h1 className="text-2xl font-bold text-gray-900 dark:text-white">{mover.driver_full_name}</h1><p className="mt-1 flex items-center gap-1 text-gray-500"><MapPin className="h-4 w-4" /> {mover.operating_city}, {mover.operating_county}</p><div className="mt-2 flex flex-wrap gap-2"><span className="badge">{mover.vehicle_type}</span><span className="badge">{mover.number_plate}</span>{mover.approval_status === 'approved' && <span className="badge bg-success-50 text-success-700"><ShieldCheck className="h-3 w-3" /> Verified</span>}{mover.is_available && <span className="badge">Available</span>}</div></div>
      {avgRating > 0 && <div className="flex items-center gap-1"><Star className="h-5 w-5 fill-warning-500 text-warning-500" /><span className="text-lg font-bold">{avgRating.toFixed(1)}</span><span className="text-sm text-gray-400">({reviews.length})</span></div>}
    </div><div className="mt-6 grid gap-4 border-t border-gray-200 pt-6 sm:grid-cols-2"><div className="flex items-center gap-3"><DollarSign className="h-5 w-5 text-gray-400" /><div><p className="text-xs text-gray-400">Base Rate</p><p className="text-sm font-semibold">From {formatKES(Number(mover.base_rate_kes))}</p></div></div><div className="flex items-center gap-3"><Phone className="h-5 w-5 text-gray-400" /><div><p className="text-xs text-gray-400">Phone</p><p className="text-sm font-semibold">{mover.phone}</p></div></div></div></div>

    {!showBooking ? <button onClick={() => profile ? setShowBooking(true) : navigate('home')} className="btn-primary mt-4 w-full">{profile ? 'Request This Mover' : 'Sign in to Request'}</button> : <form onSubmit={handleBooking} className="card mt-4 space-y-4 p-6">
      <h3 className="text-lg font-semibold">Request This Mover</h3>
      <p className="text-sm text-gray-500">The Django backend calculates and stores the authoritative booking price. This form does not accept a client-supplied booking amount.</p>
      <div><label className="mb-1.5 block text-sm font-medium">Pickup Address</label><div className="relative"><Navigation className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input required value={pickup} onChange={e => setPickup(e.target.value)} className="input-field pl-10" placeholder="Current address" /></div></div>
      <div><label className="mb-1.5 block text-sm font-medium">Destination Address</label><div className="relative"><MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input required value={dropoff} onChange={e => setDropoff(e.target.value)} className="input-field pl-10" placeholder="Destination address" /></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-sm font-medium">Moving Date</label><div className="relative"><Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input required type="date" value={movingDate} onChange={e => setMovingDate(e.target.value)} className="input-field pl-10" /></div></div><div><label className="mb-1.5 block text-sm font-medium">Route Distance (km)</label><input required type="number" min="0" step="0.01" value={distanceKm} onChange={e => setDistanceKm(e.target.value)} onBlur={() => { if (distanceKm) void refreshQuote(); }} className="input-field" /></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-sm font-medium">Pickup Latitude</label><input required type="number" step="any" value={pickupLat} onChange={e => setPickupLat(e.target.value)} className="input-field" /></div><div><label className="mb-1.5 block text-sm font-medium">Pickup Longitude</label><input required type="number" step="any" value={pickupLng} onChange={e => setPickupLng(e.target.value)} className="input-field" /></div><div><label className="mb-1.5 block text-sm font-medium">Destination Latitude</label><input required type="number" step="any" value={dropoffLat} onChange={e => setDropoffLat(e.target.value)} className="input-field" /></div><div><label className="mb-1.5 block text-sm font-medium">Destination Longitude</label><input required type="number" step="any" value={dropoffLng} onChange={e => setDropoffLng(e.target.value)} className="input-field" /></div></div>
      <div><label className="mb-1.5 block text-sm font-medium">Payment Method</label><div className="grid grid-cols-2 gap-2">{(['mpesa', 'paypal'] as const).map(method => <button key={method} type="button" onClick={() => setPaymentMethod(method)} className={cn('rounded-lg border-2 py-2.5 text-sm font-semibold', paymentMethod === method ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500')}>{method === 'mpesa' ? 'M-Pesa' : 'PayPal'}</button>)}</div></div>
      {quote && <div className="rounded-xl bg-gray-50 p-4"><div className="flex justify-between py-1 text-sm"><span>Server quote</span><strong>{formatKES(quote.renterTotalKes)}</strong></div><div className="flex justify-between py-1 text-sm"><span>Server platform fee</span><strong>{formatKES(quote.commissionKes)}</strong></div></div>}
      {error && <div className="rounded-lg bg-error-50 px-3 py-3 text-sm text-error-700">{error}</div>}
      <button type="submit" disabled={submitting} className="btn-primary w-full">{submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending Request...</> : <><CreditCard className="h-4 w-4" /> Send Moving Request</>}</button>
    </form>}

    {reviews.length > 0 && <div className="card mt-6 p-6"><h3 className="flex items-center gap-2 text-lg font-semibold"><Star className="h-5 w-5 text-brand-600" /> Reviews ({avgRating.toFixed(1)})</h3><div className="mt-4 space-y-4">{reviews.map(review => <div key={review.id} className="border-l-2 border-brand-200 pl-4"><div className="flex">{[1,2,3,4,5].map(s => <Star key={s} className={cn('h-4 w-4', s <= review.rating ? 'fill-warning-500 text-warning-500' : 'text-gray-300')} />)}</div><p className="mt-1 text-sm text-gray-600">{review.comment}</p></div>)}</div></div>}
  </div>;
}
