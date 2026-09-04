import { AlertCircle, ArrowDown, ArrowUp, CalendarDays, Clock3, Loader2, MapPin, RefreshCw, User, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNav } from '@/context/NavContext';
import { moverApi, type MoverBookingDetail as Detail } from '@/lib/Movers';
import { cn, formatKES } from '@/lib/utils';
import MoverJourneyControls from './MoverJourneyControls';
import MoverDeliveryDisputePanel from './MoverDeliveryDisputePanel';

const normalize = (value: string | null | undefined) => value?.toLowerCase().replace(/-/g, '_').trim() ?? '';
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const dateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const label = (value: string | null | undefined) => ({ pending: 'Awaiting your response', confirmed: 'Confirmed', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' }[normalize(value)] ?? value ?? 'Unknown');
const style = (value: string | null | undefined) => ['confirmed', 'completed'].includes(normalize(value)) ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400' : normalize(value) === 'cancelled' ? 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400' : normalize(value) === 'pending' ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' : 'bg-brand-50 text-brand-700 dark:bg-brand-800/50 dark:text-brand-300';

export default function MoverBookingDetail() {
  const { selectedMoverBookingId, navigate } = useNav();
  const bookingId = selectedMoverBookingId;
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<'confirm' | 'not_sure' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async (silent = false) => {
    if (!bookingId) { setLoading(false); setError('No moving booking was selected.'); return; }
    silent ? setRefreshing(true) : setLoading(true);
    setError(null);
    try { setData(await moverApi.getBookingDetail(bookingId)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to load this moving booking.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [bookingId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!data?.response_deadline || !data.can_respond) return; const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, [data?.response_deadline, data?.can_respond]);

  const remaining = useMemo(() => { if (!data?.response_deadline) return null; const seconds = Math.max(0, Math.floor((new Date(data.response_deadline).getTime() - now) / 1000)); return seconds; }, [data?.response_deadline, now]);
  const expired = normalize(data?.booking.status) === 'pending' && remaining !== null && remaining <= 0;
  const canRespond = normalize(data?.booking.status) === 'pending' && data?.can_respond === true && !expired;

  const respond = async () => {
    if (!bookingId || !action || actionLoading) return;
    if ((action === 'cancel' || action === 'not_sure') && !reason.trim()) { setActionError(action === 'cancel' ? 'Please provide a reason for declining this request.' : 'Please explain what you need to clarify.'); return; }
    setActionLoading(true); setActionError(null);
    try { await moverApi.respondToBooking(bookingId, action, reason); setAction(null); setReason(''); await load(true); }
    catch (err) { setActionError(err instanceof Error ? err.message : 'Unable to update this booking.'); }
    finally { setActionLoading(false); }
  };

  if (loading) return <div className="mx-auto flex min-h-[500px] max-w-7xl items-center justify-center"><RefreshCw className="h-8 w-8 animate-spin text-brand-500" /></div>;
  if (error || !data) return <div className="mx-auto max-w-7xl px-4 py-8"><div className="rounded-2xl border border-error-200 bg-error-50 p-6 dark:border-error-800 dark:bg-error-900/20"><div className="flex gap-3"><XCircle className="h-5 w-5 text-error-600" /><div><h1 className="font-semibold text-error-800 dark:text-error-300">Unable to load booking</h1><p className="mt-1 text-sm text-error-700 dark:text-error-400">{error ?? 'Booking not found.'}</p><button type="button" onClick={() => void load()} className="btn-secondary mt-4">Try again</button></div></div></div></div>;

  const { booking, renter, mover, schedule } = data;
  return <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8"><header className="mb-6"><button type="button" onClick={() => navigate('dashboard')} className="mb-3 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to mover dashboard</button><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">Moving booking</h1><span className={cn('rounded-full px-3 py-1 text-xs font-semibold', style(booking.status))}>{label(booking.status)}</span></div><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Review and manage the complete mover booking lifecycle.</p></div><button type="button" onClick={() => void load(true)} disabled={refreshing} className="btn-secondary inline-flex items-center gap-2 text-sm"><RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />Refresh</button></div></header>

  {canRespond && <section className="mb-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-5 dark:border-yellow-800 dark:bg-yellow-900/20"><div className="flex items-center gap-3"><Clock3 className="h-5 w-5 text-yellow-700 dark:text-yellow-400" /><div><p className="font-semibold text-yellow-900 dark:text-yellow-300">Response window open</p><p className="text-sm text-yellow-800 dark:text-yellow-400">{Math.floor((remaining ?? 0) / 60)}m {((remaining ?? 0) % 60).toString().padStart(2, '0')}s remaining</p></div></div></section>}
  {expired && <section className="mb-6 rounded-2xl border border-error-200 bg-error-50 p-5 dark:border-error-800 dark:bg-error-900/20"><div className="flex items-center gap-3"><AlertCircle className="h-5 w-5 text-error-600" /><p className="text-sm font-medium text-error-800 dark:text-error-300">The response window has expired.</p></div></section>}

  <div className="space-y-6"><section className="card p-6 sm:p-7"><div className="mb-6 flex items-center gap-2"><MapPin className="h-5 w-5 text-brand-600" /><h2 className="text-lg font-bold text-gray-900 dark:text-white">Moving route</h2></div><div className="grid gap-5 md:grid-cols-2"><div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30"><div className="flex items-start gap-3"><ArrowUp className="mt-1 h-4 w-4 text-brand-600" /><div><p className="text-xs uppercase tracking-wide text-gray-500">Pickup</p><p className="mt-1 font-semibold text-gray-900 dark:text-white">{booking.pickup_address}</p></div></div></div><div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30"><div className="flex items-start gap-3"><ArrowDown className="mt-1 h-4 w-4 text-success-600" /><div><p className="text-xs uppercase tracking-wide text-gray-500">Drop-off</p><p className="mt-1 font-semibold text-gray-900 dark:text-white">{booking.dropoff_address}</p></div></div></div></div><div className="mt-5 grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30"><p className="text-xs text-gray-500">Moving date</p><p className="mt-1 font-semibold dark:text-white">{date(booking.moving_date)}</p></div><div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30"><p className="text-xs text-gray-500">Distance</p><p className="mt-1 font-semibold dark:text-white">{booking.distance_km != null ? `${booking.distance_km.toFixed(1)} km` : '—'}</p></div><div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30"><p className="text-xs text-gray-500">Total</p><p className="mt-1 font-semibold dark:text-white">{booking.total_amount != null ? formatKES(booking.total_amount) : '—'}</p></div><div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30"><p className="text-xs text-gray-500">Payment</p><p className="mt-1 font-semibold dark:text-white">{booking.payment_status ?? '—'}</p></div></div></section>

  <section className="card p-6 sm:p-7"><div className="flex items-start gap-4">{renter?.profile_photo_url ? <img src={renter.profile_photo_url} alt={renter.full_name ?? 'Renter'} className="h-14 w-14 rounded-2xl object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-800/50"><User className="h-6 w-6 text-brand-600" /></div>}<div><p className="text-xs uppercase tracking-wide text-brand-600">Renter</p><h2 className="mt-1 font-bold text-gray-900 dark:text-white">{renter?.full_name ?? 'Renter'}</h2><p className="mt-1 text-sm text-gray-500">{[renter?.city, renter?.county].filter(Boolean).join(', ') || 'Location unavailable'}</p></div></div>{data.contact_released && renter?.phone && <p className="mt-4 rounded-xl bg-success-50 p-4 text-sm font-semibold text-success-700 dark:bg-success-900/20 dark:text-success-400">Renter contact released: {renter.phone}</p>}</section>

  {schedule && <section className="card p-6 sm:p-7"><div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-brand-600" /><h2 className="text-lg font-bold text-gray-900 dark:text-white">Schedule</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-gray-500">Event</p><p className="mt-1 font-semibold dark:text-white">{schedule.title}</p></div><div><p className="text-xs text-gray-500">Starts</p><p className="mt-1 font-semibold dark:text-white">{dateTime(schedule.starts_at)}</p></div><div><p className="text-xs text-gray-500">Ends</p><p className="mt-1 font-semibold dark:text-white">{dateTime(schedule.ends_at)}</p></div></div></section>}

  {canRespond && <section className="card p-6 sm:p-7"><h2 className="text-lg font-bold text-gray-900 dark:text-white">Respond to request</h2><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => setAction('confirm')} className="btn-primary">Confirm booking</button><button type="button" onClick={() => setAction('not_sure')} className="btn-secondary">Not sure</button><button type="button" onClick={() => setAction('cancel')} className="btn-secondary">Decline</button></div>{action && <div className="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30"><p className="text-sm font-medium text-gray-900 dark:text-white">{action === 'confirm' ? 'Confirm this booking?' : action === 'not_sure' ? 'What needs clarification?' : 'Why are you declining this request?'}</p>{action !== 'confirm' && <textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} className="input mt-3 w-full" maxLength={5000} placeholder="Provide a reason..." />}<div className="mt-3 flex gap-2"><button type="button" onClick={() => void respond()} disabled={actionLoading} className="btn-primary inline-flex items-center gap-2">{actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}Continue</button><button type="button" onClick={() => { setAction(null); setReason(''); setActionError(null); }} className="btn-secondary">Back</button></div>{actionError && <p className="mt-3 text-sm text-error-600">{actionError}</p>}</div>}</section>}

  <MoverJourneyControls booking={booking} onChanged={() => load(true)} onTracking={() => navigate('mover-tracking', booking.id)} />
  <MoverDeliveryDisputePanel booking={booking} onChanged={() => load(true)} />
  </div></div>;
}
