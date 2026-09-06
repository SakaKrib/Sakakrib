import { useEffect, useState } from 'react';
import { CalendarDays, Check, Clock3, CreditCard, Loader2, MapPin, MessageCircle, Navigation, X, XCircle } from 'lucide-react';
import { cn, formatKES } from '@/lib/utils';
import { protectedGet, protectedPost } from '@/lib/djangoApi';
import MovingBookingEditForm from './MovingBookingEditForm';

type ChatMessage = { id: string; sender_id: string; content: string; message_type: string | null; event_data: Record<string, unknown> | null; created_at: string };
type Booking = { id: string; pickup_address: string; dropoff_address: string; moving_date: string | null; booking_amount: number | null; total_amount: number | null; status: string | null; payment_status: string | null; payment_method?: string | null; request_expires_at: string | null; confirmed_at: string | null; scheduled_start_at: string | null; scheduled_end_at: string | null };
interface Props { message?: ChatMessage | null; booking?: Booking | null; isMover: boolean; responding: boolean; onRespond: (decision: 'confirm' | 'not_sure' | 'cancel') => void; onCancel: () => void; onSchedule: () => void; }
const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
const displayDate = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00+03:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const displayDateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

export default function ChatBookingCard({ message, booking, isMover, responding, onRespond, onCancel }: Props) {
  const [liveBooking, setLiveBooking] = useState<Booking | null>(booking ?? null);
  const [locationConfirming, setLocationConfirming] = useState(false);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentStarting, setPaymentStarting] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  useEffect(() => setLiveBooking(booking ?? null), [booking]);
  useEffect(() => {
    if (!booking?.id) return;
    let cancelled = false;
    const refresh = async () => {
      try { const result = await protectedGet<Booking>(`/api/core/bookings/${booking.id}/`); if (!cancelled && result) setLiveBooking(result); }
      catch { /* keep last authoritative state */ }
    };
    const timer = window.setInterval(() => void refresh(), 4000); void refresh();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [booking?.id]);

  const currentBooking = liveBooking ?? booking;
  const event = message?.event_data ?? {};
  const decision = normalize(event.decision);
  const status = normalize(currentBooking?.status ?? (event.status as string) ?? (decision === 'confirm' ? 'confirmed' : decision === 'cancel' ? 'cancelled' : 'pending'));
  const pickup = currentBooking?.pickup_address || String(event.pickup_address ?? 'Pickup location');
  const dropoff = currentBooking?.dropoff_address || String(event.dropoff_address ?? 'Drop-off location');
  const movingDate = currentBooking?.moving_date || (typeof event.moving_date === 'string' ? event.moving_date : null);
  const total = currentBooking?.total_amount ?? currentBooking?.booking_amount ?? Number(event.renter_total_kes ?? event.total_amount ?? 0);
  const paymentMethod = currentBooking?.payment_method || (typeof event.preferred_payment_method === 'string' ? event.preferred_payment_method : typeof event.payment_method === 'string' ? event.payment_method : null);
  const pickupLat = event.pickup_latitude; const pickupLng = event.pickup_longitude;
  const dropoffLat = event.dropoff_latitude; const dropoffLng = event.dropoff_longitude;
  const hasPickupCoordinates = typeof pickupLat === 'number' && typeof pickupLng === 'number';
  const hasDropoffCoordinates = typeof dropoffLat === 'number' && typeof dropoffLng === 'number';
  const isRequest = message?.message_type === 'booking_request';
  const isResponse = message?.message_type === 'booking_response';
  const actionRequired = normalize(event.action_required);
  const canMoverRespond = isMover && isRequest && status === 'pending';
  const isRenterPending = !isMover && status === 'pending';
  const isConfirmed = status === 'confirmed' || decision === 'confirm';
  const isDeclined = status === 'cancelled' || decision === 'cancel' || decision === 'not_sure';
  const needsLocationConfirmation = !isMover && isResponse && isConfirmed && actionRequired === 'location_confirmation' && !locationConfirmed;

  const confirmLocation = async () => {
    if (!currentBooking?.id || locationConfirming) return;
    setLocationConfirming(true); setPaymentMessage(null);
    try { await protectedPost(`/api/core/bookings/${currentBooking.id}/respond/`, { decision: 'confirm_location' }); setLocationConfirmed(true); }
    catch (error) { setPaymentMessage(error instanceof Error ? error.message : 'Unable to confirm the pickup location.'); }
    finally { setLocationConfirming(false); }
  };

  const startPayment = async (provider: 'mpesa' | 'paypal') => {
    if (!currentBooking?.id || paymentStarting) return;
    setPaymentStarting(true); setPaymentMessage(null);
    try {
      if (provider === 'mpesa') {
        const result = await protectedPost<{ success: boolean; status: string; customer_message?: string | null }>(`/api/core/bookings/${currentBooking.id}/payment/mpesa/start/`, {});
        setPaymentMessage(result.customer_message || 'Payment request started. Check your phone and follow the payment prompt.');
      } else {
        const result = await protectedPost<{ success: boolean; approval_url?: string | null }>(`/api/core/bookings/${currentBooking.id}/payment/paypal/start/`, {});
        if (result.approval_url) window.location.assign(result.approval_url); else setPaymentMessage('PayPal payment could not be started. Please try again.');
      }
    } catch (error) { setPaymentMessage(error instanceof Error ? error.message : 'Unable to start payment.'); }
    finally { setPaymentStarting(false); }
  };

  return <article className="w-full max-w-xl overflow-hidden rounded-2xl border border-brand-200 bg-surface-light text-gray-900 shadow-sm dark:border-brand-800 dark:bg-surface-dark dark:text-gray-100">
    <div className="border-b border-brand-100 bg-brand-50/60 px-4 py-3 dark:border-brand-800 dark:bg-brand-900/50"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300"><MessageCircle className="h-4 w-4" /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">Moving request</p><p className="text-sm font-semibold text-brand-950 dark:text-gray-100">{isResponse ? 'Booking update' : 'Request details'}</p></div></div><span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase', isConfirmed ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300' : isDeclined ? 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300' : 'bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300')}>{status || 'pending'}</span></div></div>
    <div className="space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 dark:border-brand-800 dark:bg-brand-900/30"><div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><div><p className="text-[11px] font-semibold uppercase text-brand-500 dark:text-brand-400">Pickup</p><p className="mt-1 text-sm font-medium text-brand-950 dark:text-gray-100">{pickup}</p></div></div></div><div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 dark:border-brand-800 dark:bg-brand-900/30"><div className="flex items-start gap-2"><Navigation className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><div><p className="text-[11px] font-semibold uppercase text-brand-500 dark:text-brand-400">Destination</p><p className="mt-1 text-sm font-medium text-brand-950 dark:text-gray-100">{dropoff}</p></div></div></div></div>
      {(hasPickupCoordinates || hasDropoffCoordinates) && <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-brand-800 dark:bg-brand-900/30"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-600" /><p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">Location attached to request</p></div><div className="mt-2 grid gap-2 text-xs text-brand-700 dark:text-gray-300 sm:grid-cols-2"><p>Pickup GPS: {hasPickupCoordinates ? `${Number(pickupLat).toFixed(5)}, ${Number(pickupLng).toFixed(5)}` : 'Not supplied'}</p><p>Destination GPS: {hasDropoffCoordinates ? `${Number(dropoffLat).toFixed(5)}, ${Number(dropoffLng).toFixed(5)}` : 'Not supplied'}</p></div></div>}
      <div className="grid grid-cols-2 gap-3 border-t border-brand-100 pt-3 text-sm dark:border-brand-800 sm:grid-cols-3"><div><p className="text-xs text-brand-500 dark:text-brand-400">Move date</p><p className="mt-1 font-medium text-brand-950 dark:text-gray-100">{displayDate(movingDate)}</p></div><div><p className="text-xs text-brand-500 dark:text-brand-400">Total</p><p className="mt-1 font-semibold text-brand-700 dark:text-brand-300">{formatKES(Number(total || 0))}</p></div><div><p className="text-xs text-brand-500 dark:text-brand-400">Payment</p><p className="mt-1 font-medium uppercase text-brand-950 dark:text-gray-100">{paymentMethod || 'Not selected'}</p></div></div>
      {currentBooking?.scheduled_start_at && <div className="flex items-center gap-2 rounded-xl border border-success-200 bg-success-50 p-3 text-sm text-success-800 dark:border-success-800 dark:bg-success-900/20 dark:text-success-300"><CalendarDays className="h-4 w-4" /><span>Scheduled: {displayDateTime(currentBooking.scheduled_start_at)}{currentBooking.scheduled_end_at ? ` – ${displayDateTime(currentBooking.scheduled_end_at)}` : ''}</span></div>}
      {currentBooking?.request_expires_at && status === 'pending' && <div className="flex items-center gap-2 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-800 dark:bg-warning-900/20 dark:text-warning-300"><Clock3 className="h-4 w-4" />Response window ends {displayDateTime(currentBooking.request_expires_at)}.</div>}
      {canMoverRespond && <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-800 dark:bg-brand-900/40"><p className="text-xs font-semibold text-brand-800 dark:text-gray-200">Choose an action for this request</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><button type="button" disabled={responding} onClick={() => onRespond('confirm')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"><Check className="h-4 w-4" />Confirm</button><button type="button" disabled={responding} onClick={() => onRespond('not_sure')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-brand-700 dark:bg-brand-950 dark:text-gray-200"><Clock3 className="h-4 w-4" />Not sure</button><button type="button" disabled={responding} onClick={() => onRespond('cancel')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-error-200 bg-white px-3 py-2.5 text-sm font-semibold text-error-700 hover:bg-error-50 disabled:opacity-50 dark:border-error-800 dark:bg-brand-950 dark:text-error-300"><XCircle className="h-4 w-4" />Decline</button></div></div>}
      {isRenterPending && <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 dark:border-warning-800 dark:bg-warning-900/20"><p className="text-sm font-semibold text-warning-900 dark:text-warning-200">Waiting for mover response</p><p className="mt-1 text-xs text-warning-800/80 dark:text-warning-300/80">You can continue waiting or cancel and search for another mover.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={responding} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-warning-900 dark:bg-brand-950 dark:text-warning-200">Continue waiting</button><button type="button" disabled={responding} onClick={onCancel} className="inline-flex items-center gap-2 rounded-lg border border-warning-300 bg-white px-3 py-2 text-xs font-semibold text-warning-900 hover:bg-warning-100 disabled:opacity-50 dark:border-warning-700 dark:bg-brand-950 dark:text-warning-200"><X className="h-3.5 w-3.5" />Cancel &amp; search</button></div></div>}
      {needsLocationConfirmation && !showEdit && <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-800 dark:bg-brand-900/40"><p className="text-sm font-semibold text-brand-950 dark:text-gray-100">Please confirm your pickup location</p><p className="mt-1 text-xs text-brand-700 dark:text-gray-300">{pickup}</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" disabled={locationConfirming} onClick={() => void confirmLocation()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{locationConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Yes, confirm</button><button type="button" disabled={locationConfirming} onClick={() => setShowEdit(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-brand-700 dark:bg-brand-950 dark:text-gray-200"><MapPin className="h-4 w-4" />Edit booking</button></div></div>}
      {isConfirmed && !isMover && !showEdit && !needsLocationConfirmation && <button type="button" onClick={() => setShowEdit(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300"><CalendarDays className="h-4 w-4" />Edit booking</button>}
      {showEdit && currentBooking && <MovingBookingEditForm booking={currentBooking} onSaved={(updated) => setLiveBooking((previous) => previous ? { ...previous, ...updated, id: previous.id } : null)} onClose={() => setShowEdit(false)} />}
      {(!needsLocationConfirmation && !showEdit && !isMover && isConfirmed && currentBooking?.payment_status !== 'paid') && <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-800 dark:bg-brand-900/40"><p className="text-sm font-semibold text-brand-950 dark:text-gray-100">Booking confirmed</p><p className="mt-1 text-xs text-brand-700 dark:text-gray-300">Your mover accepted the request. Continue to payment when you are ready.</p><button type="button" onClick={() => setShowPayment(true)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"><CreditCard className="h-4 w-4" />Pay Now</button></div>}
      {paymentMessage && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-900/50 dark:text-gray-300">{paymentMessage}</p>}
      {isResponse && message?.content && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-900/50 dark:text-gray-300">{message.content}</p>}
    </div>
    {showPayment && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-2xl bg-surface-light p-6 text-gray-900 shadow-2xl dark:bg-surface-dark dark:text-gray-100"><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold text-brand-950 dark:text-gray-100">Pay Now</h3><p className="mt-1 text-sm text-brand-600 dark:text-gray-400">Complete payment for this confirmed moving booking.</p></div><button type="button" onClick={() => setShowPayment(false)} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-brand-900" aria-label="Close"><X className="h-5 w-5" /></button></div><div className="mt-5 rounded-xl bg-brand-50 p-4 dark:bg-brand-900/40"><p className="text-xs text-brand-600 dark:text-brand-400">Amount</p><p className="mt-1 text-2xl font-bold text-brand-700 dark:text-brand-300">{formatKES(Number(total || 0))}</p><p className="mt-2 text-xs text-brand-600 dark:text-brand-400">{displayDate(movingDate)}{currentBooking?.scheduled_start_at ? ` · ${displayDateTime(currentBooking.scheduled_start_at)}` : ''}</p></div><div className="mt-4 grid gap-3"><button type="button" disabled={paymentStarting} onClick={() => void startPayment('mpesa')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{paymentStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}Pay with M-Pesa</button><button type="button" disabled={paymentStarting} onClick={() => void startPayment('paypal')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-brand-700 dark:bg-brand-900 dark:text-gray-200">Pay with PayPal</button></div>{paymentMessage && <p className="mt-4 rounded-xl bg-brand-50 p-3 text-sm text-brand-700 dark:bg-brand-900 dark:text-gray-300">{paymentMessage}</p>}</div></div>}
  </article>;
}
