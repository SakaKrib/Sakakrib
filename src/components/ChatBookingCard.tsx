import { useEffect, useState } from 'react';
import { CalendarDays, Check, Clock3, CreditCard, Loader2, MapPin, MessageCircle, Navigation, Play, X, XCircle } from 'lucide-react';
import { cn, formatKES } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { protectedGet, protectedPost } from '@/lib/djangoApi';
import MovingBookingEditForm from './MovingBookingEditForm';

type ChatMessage = { id: string; sender_id: string; content: string; message_type: string | null; event_data: Record<string, unknown> | null; created_at: string };
type Booking = { id: string; pickup_address: string; dropoff_address: string; moving_date: string | null; booking_amount: number | null; total_amount: number | null; status: string | null; payment_status: string | null; payment_method?: string | null; request_expires_at: string | null; confirmed_at: string | null; scheduled_start_at: string | null; scheduled_end_at: string | null; started_at?: string | null; tracking_number?: string | null };
interface Props { message?: ChatMessage | null; booking?: Booking | null; isMover: boolean; responding: boolean; onRespond: (decision: 'confirm' | 'not_sure' | 'cancel') => void; onCancel: () => void; onSchedule: () => void; }
const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
const displayDate = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00+03:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const displayDateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
const timeAgo = (value: string | null | undefined) => {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
};

function getPaymentErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const cleaned = raw.replace(/^\s*\[\s*[\'"]?/, '').replace(/[\'"]?\s*\]\s*$/, '').trim();
  if (/profile phone number required|m-?pesa phone number is required/i.test(cleaned)) return 'Please enter the M-Pesa phone number you want to use for this payment.';
  if (/valid kenyan m-?pesa phone number/i.test(cleaned)) return 'Please enter a valid Kenyan M-Pesa number, for example 0712 345 678.';
  return cleaned || 'We could not start the M-Pesa payment. Please check the number and try again.';
}

function getInboxWebSocketUrl() {
  const configured = (import.meta.env.VITE_DJANGO_API_URL as string | undefined)?.replace(/\/+$/, '').replace(/\/api$/, '');
  const url = new URL(`${configured || window.location.origin}/ws/chat/inbox/`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export default function ChatBookingCard({ message, booking, isMover, responding, onRespond, onCancel }: Props) {
  const { profile } = useAuth();
  const [liveBooking, setLiveBooking] = useState<Booking | null>(booking ?? null);
  const [locationConfirming, setLocationConfirming] = useState(false);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [paymentStarting, setPaymentStarting] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [journeyStarting, setJourneyStarting] = useState(false);
  const [journeyMessage, setJourneyMessage] = useState<string | null>(null);

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

  useEffect(() => {
    if (!booking?.id) return;
    let cancelled = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;
    let reconnectAttempt = 0;
    const connect = () => {
      if (cancelled) return;
      socket?.close();
      socket = new WebSocket(getInboxWebSocketUrl());
      socket.onopen = () => { reconnectAttempt = 0; };
      socket.onmessage = event => {
        try {
          const payload = JSON.parse(event.data) as {
            type?: string;
            booking?: Partial<Booking> & { id?: string };
            notification?: { notification_type?: string; data?: Record<string, unknown> };
          };
          const eventBookingId = String(payload.booking?.id ?? payload.notification?.data?.booking_id ?? '');
          if (eventBookingId !== String(booking.id)) return;
          if (payload.type === 'booking' && payload.booking) {
            setLiveBooking(previous => previous ? { ...previous, ...payload.booking, id: previous.id } : booking);
            return;
          }
          if (payload.type === 'notification') {
            void protectedGet<Booking>(`/api/core/bookings/${booking.id}/`).then(result => { if (!cancelled && result) setLiveBooking(result); }).catch(() => undefined);
          }
        } catch { /* ignore malformed websocket events */ }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (cancelled) return;
        const delay = Math.min(1000 * 2 ** reconnectAttempt, 15000);
        reconnectAttempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      socket?.close();
      socket = null;
    };
  }, [booking?.id]);

  useEffect(() => {
    setMpesaPhone(profile?.phone?.trim() ?? '');
  }, [booking?.id, profile?.phone]);

  const currentBooking = liveBooking ?? booking;
  const event = message?.event_data ?? {};
  const decision = normalize(event.decision);
  const status = normalize(currentBooking?.status ?? (event.status as string) ?? (decision === 'confirm' ? 'confirmed' : decision === 'cancel' ? 'cancelled' : 'pending'));
  const paymentStatus = normalize(currentBooking?.payment_status ?? event.payment_status);
  const isPaid = paymentStatus === 'paid';
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
  const journeyStarted = Boolean(currentBooking?.started_at) || status === 'in_progress' || status === 'completed';
  const canStartJourney = isMover && isPaid && isConfirmed && status === 'confirmed' && Boolean(currentBooking?.scheduled_start_at) && !journeyStarted;
  const messageTimestamp = timeAgo(message?.created_at);

  const confirmLocation = async () => {
    if (!currentBooking?.id || locationConfirming) return;
    setLocationConfirming(true); setPaymentMessage(null);
    try { await protectedPost(`/api/core/bookings/${currentBooking.id}/respond/`, { decision: 'confirm_location' }); setLocationConfirmed(true); }
    catch (error) { setPaymentMessage(error instanceof Error ? error.message : 'Unable to confirm the pickup location.'); }
    finally { setLocationConfirming(false); }
  };

  const startPayment = async (provider: 'mpesa' | 'paypal') => {
    if (!currentBooking?.id || paymentStarting || isPaid) return;
    setPaymentMessage(null);
    if (provider === 'mpesa') {
      const phone = mpesaPhone.trim();
      if (!phone) { setPaymentMessage('Please enter the M-Pesa phone number you want to use for this payment.'); return; }
    }
    setPaymentStarting(true);
    try {
      if (provider === 'mpesa') {
        const result = await protectedPost<{ success: boolean; status: string; customer_message?: string | null }>(`/api/core/bookings/${currentBooking.id}/payment/mpesa/start/`, { phone_number: mpesaPhone.trim() });
        setPaymentMessage(result.customer_message || 'Payment request started. Check your phone and follow the payment prompt.');
      } else {
        const result = await protectedPost<{ success: boolean; approval_url?: string | null }>(`/api/core/bookings/${currentBooking.id}/payment/paypal/start/`, {});
        if (result.approval_url) window.location.assign(result.approval_url); else setPaymentMessage('PayPal payment could not be started. Please try again.');
      }
    } catch (error) {
      setPaymentMessage(provider === 'mpesa' ? getPaymentErrorMessage(error) : error instanceof Error ? error.message : 'Unable to start payment.');
    } finally { setPaymentStarting(false); }
  };

  const startJourney = async () => {
    if (!currentBooking?.id || journeyStarting || !canStartJourney) return;
    setJourneyStarting(true);
    setJourneyMessage(null);
    try {
      const result = await protectedPost<{ booking_id: string; journey_id: string; tracking_number: string; started_at: string; status: string }>(`/api/core/bookings/${currentBooking.id}/start/`, { source: 'CHROME' });
      setLiveBooking(previous => previous ? { ...previous, status: 'in_progress', started_at: result.started_at, tracking_number: result.tracking_number } : null);
      setJourneyMessage(`Journey started · ${result.tracking_number}`);
    } catch (error) {
      setJourneyMessage(error instanceof Error ? error.message : 'Unable to start the journey.');
    } finally { setJourneyStarting(false); }
  };

  const paymentError = paymentMessage && (/please enter|valid kenyan|could not start|unable to start|error|failed/i.test(paymentMessage));

  return <article className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-surface-light text-gray-900 shadow-sm dark:border-brand-800 dark:bg-surface-dark dark:text-gray-100">
    <div className="border-b border-gray-100 bg-surface-light px-4 py-3 dark:border-brand-800 dark:bg-surface-dark"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"><MessageCircle className="h-4 w-4" /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">Moving request</p><p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{isResponse ? 'Booking update' : 'Request details'}</p></div></div><span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase', isPaid ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300' : isConfirmed ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300' : isDeclined ? 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300' : 'bg-gray-100 text-gray-700 dark:bg-brand-900/40 dark:text-gray-300')}>{isPaid ? 'Paid' : status || 'pending'}</span></div></div>
    <div className="space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-brand-800 dark:bg-brand-950/30"><div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><div><p className="text-[11px] font-semibold uppercase text-gray-500 dark:text-brand-400">Pickup</p><p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{pickup}</p></div></div></div><div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-brand-800 dark:bg-brand-950/30"><div className="flex items-start gap-2"><Navigation className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><div><p className="text-[11px] font-semibold uppercase text-gray-500 dark:text-brand-400">Destination</p><p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{dropoff}</p></div></div></div></div>
      {(hasPickupCoordinates || hasDropoffCoordinates) && <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-brand-800 dark:bg-brand-950/30"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-600" /><p className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-brand-300">Location attached to request</p></div><div className="mt-2 grid gap-2 text-xs text-gray-600 dark:text-gray-300 sm:grid-cols-2"><p>Pickup GPS: {hasPickupCoordinates ? `${Number(pickupLat).toFixed(5)}, ${Number(pickupLng).toFixed(5)}` : 'Not supplied'}</p><p>Destination GPS: {hasDropoffCoordinates ? `${Number(dropoffLat).toFixed(5)}, ${Number(dropoffLng).toFixed(5)}` : 'Not supplied'}</p></div></div>}
      <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-sm dark:border-brand-800 sm:grid-cols-3"><div><p className="text-xs text-gray-500 dark:text-brand-400">Move date</p><p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{displayDate(movingDate)}</p></div><div><p className="text-xs text-gray-500 dark:text-brand-400">Total</p><p className="mt-1 font-semibold text-brand-700 dark:text-brand-300">{formatKES(Number(total || 0))}</p></div><div><p className="text-xs text-gray-500 dark:text-brand-400">Payment</p><p className="mt-1 font-medium uppercase text-gray-900 dark:text-gray-100">{isPaid ? 'Paid' : paymentMethod || 'Not selected'}</p></div></div>
      {isMover && isPaid && isConfirmed && !journeyStarted && <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-brand-800 dark:bg-brand-950/30"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"><Check className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold text-gray-900 dark:text-gray-100">Renter already paid</p><p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">Payment is confirmed and held securely. You can start the moving journey when the scheduled time is ready.</p>{canStartJourney && <button type="button" disabled={journeyStarting} onClick={() => void startJourney()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">{journeyStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Start the journey</button>}{!currentBooking?.scheduled_start_at && <p className="mt-2 text-[11px] text-gray-600 dark:text-gray-300">Schedule the moving time before starting the journey.</p>}{journeyMessage && <p className="mt-2 text-xs font-semibold text-brand-700 dark:text-brand-300">{journeyMessage}</p>}</div></div></div>}
      {isMover && journeyStarted && <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-900/20"><p className="text-sm font-bold text-brand-800 dark:text-brand-200">Journey started</p>{currentBooking?.tracking_number && <p className="mt-1 text-xs text-brand-700 dark:text-brand-300">Tracking number: {currentBooking.tracking_number}</p>}</div>}
      {currentBooking?.scheduled_start_at && <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-brand-800 dark:bg-brand-950/30 dark:text-gray-200"><CalendarDays className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" /><span>Scheduled: {displayDateTime(currentBooking.scheduled_start_at)}{currentBooking.scheduled_end_at ? ` – ${displayDateTime(currentBooking.scheduled_end_at)}` : ''}</span></div>}
      {currentBooking?.request_expires_at && status === 'pending' && <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-brand-800 dark:bg-brand-950/30 dark:text-gray-300"><Clock3 className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />Response window ends {displayDateTime(currentBooking.request_expires_at)}.</div>}
      {canMoverRespond && <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-brand-800 dark:bg-brand-950/30"><p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Choose an action for this request</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><button type="button" disabled={responding} onClick={() => onRespond('confirm')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"><Check className="h-4 w-4" />Confirm</button><button type="button" disabled={responding} onClick={() => onRespond('not_sure')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-brand-700 dark:bg-brand-950 dark:text-gray-200"><Clock3 className="h-4 w-4" />Not sure</button><button type="button" disabled={responding} onClick={() => onRespond('cancel')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-error-200 bg-white px-3 py-2.5 text-sm font-semibold text-error-700 hover:bg-error-50 disabled:opacity-50 dark:border-brand-800 dark:bg-brand-950 dark:text-error-300"><XCircle className="h-4 w-4" />Decline</button></div></div>}
      {isRenterPending && <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-brand-800 dark:bg-brand-950/30"><p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Waiting for mover response</p><p className="mt-1 text-xs text-gray-600 dark:text-gray-300">You can continue waiting or cancel and search for another mover.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" disabled={responding} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-brand-950"><Clock3 className="h-4 w-4" />Continue waiting</button><button type="button" disabled={responding} onClick={onCancel} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-brand-700 dark:bg-brand-950 dark:text-gray-200 dark:hover:bg-brand-900/40 dark:focus:ring-brand-600 dark:focus:ring-offset-brand-950"><X className="h-4 w-4" />Cancel &amp; search</button></div></div>}
      {needsLocationConfirmation && !showEdit && <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-brand-800 dark:bg-brand-950/30"><p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Please confirm your pickup location</p><p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{pickup}</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" disabled={locationConfirming} onClick={() => void confirmLocation()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{locationConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Yes, confirm</button><button type="button" disabled={locationConfirming} onClick={() => setShowEdit(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-brand-700 dark:bg-brand-950 dark:text-gray-200"><MapPin className="h-4 w-4" />Edit booking</button></div></div>}
      {isConfirmed && !isMover && !showEdit && !needsLocationConfirmation && <button type="button" onClick={() => setShowEdit(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-gray-50 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300"><CalendarDays className="h-4 w-4" />Edit booking</button>}
      {showEdit && currentBooking && <MovingBookingEditForm booking={currentBooking} onSaved={(updated) => setLiveBooking((previous) => previous ? { ...previous, ...updated, id: previous.id } : null)} onClose={() => setShowEdit(false)} />}
      {(!needsLocationConfirmation && !showEdit && !isMover && isConfirmed && !isPaid) && <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-brand-800 dark:bg-brand-950/30"><div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-brand-600 dark:text-brand-300" /><p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Payment required</p></div><p className="mt-1 text-xs text-gray-600 dark:text-gray-300">Complete payment to confirm your moving service.</p><div className="mt-3"><label htmlFor="chat-moving-mpesa-phone" className="block text-xs font-semibold text-gray-800 dark:text-gray-200">M-Pesa phone number</label><input id="chat-moving-mpesa-phone" type="tel" inputMode="tel" autoComplete="tel" value={mpesaPhone} onChange={(event) => { setMpesaPhone(event.target.value); setPaymentMessage(null); }} placeholder="e.g. 0712 345 678" aria-describedby="chat-moving-mpesa-phone-help" className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-brand-700 dark:bg-brand-950 dark:text-gray-100 dark:focus:border-brand-400 dark:focus:ring-brand-800" /><p id="chat-moving-mpesa-phone-help" className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Your profile number is prefilled when available. You can replace it with any valid Kenyan M-Pesa number.</p></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={paymentStarting} onClick={() => void startPayment('mpesa')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{paymentStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Pay with M-Pesa</button><button type="button" disabled={paymentStarting} onClick={() => void startPayment('paypal')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-brand-700 hover:bg-gray-50 disabled:opacity-50 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-300">Pay with PayPal</button></div>{paymentMessage && <div role="alert" aria-live="polite" className={cn('mt-2 rounded-lg px-3 py-2 text-xs font-semibold', paymentError ? 'border border-error-200 bg-error-50 text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-400' : 'border border-gray-200 bg-gray-50 text-gray-700 dark:border-brand-800 dark:bg-brand-950/30 dark:text-gray-300')}>{paymentMessage}</div>}</div>}
      {isConfirmed && !isMover && isPaid && <div className="rounded-xl border border-success-200 bg-success-50 p-4 dark:border-success-900/50 dark:bg-success-900/10"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300"><Check className="h-5 w-5" /></span><div><p className="text-sm font-bold text-success-800 dark:text-success-200">Payment received</p><p className="mt-1 text-xs leading-5 text-success-700 dark:text-success-300">Your moving payment is confirmed and held securely until delivery is confirmed.</p></div></div></div>}
      {messageTimestamp && <div className="flex items-center justify-end gap-1.5 border-t border-gray-100 pt-2 text-[10px] text-gray-500 dark:border-brand-800 dark:text-gray-400"><Clock3 className="h-3 w-3" /><span title={message?.created_at ? new Date(message.created_at).toLocaleString('en-KE') : undefined}>{messageTimestamp}</span></div>}
    </div>
  </article>;
}
