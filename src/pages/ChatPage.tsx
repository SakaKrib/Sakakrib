import {
  AlertCircle, ArrowLeft, CalendarDays, Check, CheckCircle2, Clock3,
  ImagePlus, Loader2, MessageCircle, Navigation, Paperclip, RefreshCw,
  Send, ShieldCheck, Truck, X, XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import MoverSchedulePicker, { type MoverBlockedInterval, type MoverScheduleValue } from '@/components/Renter/MoverSchedulePicker';
import { protectedGet, protectedPost } from '@/lib/protectedApi';
import { cn, formatKES } from '@/lib/utils';

interface ChatMover {
  id: string; user_id: string; driver_full_name: string | null; business_name: string | null;
  profile_photo_url: string | null; phone: string | null; vehicle_type: string | null;
  number_plate: string | null; operating_city: string | null; operating_county: string | null;
  base_rate_kes: number | null; rate_per_km_kes: number | null; approval_status: string | null;
  is_available: boolean | null; working_days: string[] | null; start_time: string | null; end_time: string | null;
}
interface ChatMessage {
  id: string; conversation_id: string; sender_id: string; receiver_id: string; content: string;
  message_type: string | null; event_data: Record<string, unknown> | null; created_at: string;
}
interface MovingBooking {
  id: string; renter_id: string; mover_id: string; pickup_address: string; dropoff_address: string;
  moving_date: string | null; booking_amount: number | null; commission_amount: number | null; total_amount: number | null;
  status: string | null; payment_status: string | null; requested_at: string | null; request_expires_at: string | null;
  confirmed_at: string | null; scheduled_start_at: string | null; scheduled_end_at: string | null;
}
interface ScheduleEvent {
  id: string; mover_id: string; booking_id: string; starts_at: string; ends_at: string; status: string; title: string | null;
}
interface ChatAttachment { path: string; name: string; mime_type: string; size: number; signed_url?: string; }

const MEDIA_FUNCTION = 'chat-media-upload';
const STREAM_FUNCTION = 'chat-stream';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function getConversationId(userA: string, userB: string) { return [userA, userB].sort().join('__'); }
function first<T>(value: T | T[] | null | undefined): T | null { return value == null ? null : Array.isArray(value) ? value[0] ?? null : value; }
function asRows<T>(value: T | T[] | null | undefined): T[] { return value == null ? [] : Array.isArray(value) ? value : [value]; }
function errorMessage(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }
function normalizeStatus(value: string | null | undefined) { return String(value ?? '').trim().toLowerCase().replace(/-/g, '_'); }
function formatDate(value: string | null | undefined) {
  if (!value) return '—'; const date = new Date(`${value}T00:00:00+03:00`); if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'; const date = new Date(value); if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
function formatTime(value: string | null | undefined) {
  if (!value) return '—'; const match = String(value).match(/^(\d{1,2}):(\d{2})/); if (!match) return value;
  return new Date(2000, 0, 1, Number(match[1]), Number(match[2])).toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' });
}
function toNairobiIso(date: string, time: string) { return `${date}T${time}:00+03:00`; }
function getBookingIdFromMessage(message: ChatMessage) { const value = message.event_data?.booking_id; return typeof value === 'string' ? value : null; }
function getAttachment(message: ChatMessage): ChatAttachment | null {
  const raw = message.event_data?.attachments; if (!Array.isArray(raw) || !raw.length) return null;
  const value = raw[0]; if (!value || typeof value !== 'object') return null; const item = value as Record<string, unknown>;
  if (typeof item.path !== 'string' || typeof item.name !== 'string' || typeof item.mime_type !== 'string') return null;
  return { path: item.path, name: item.name, mime_type: item.mime_type, size: typeof item.size === 'number' ? item.size : 0, signed_url: typeof item.signed_url === 'string' ? item.signed_url : undefined };
}

function ChatImage({ messageId, attachment }: { messageId: string; attachment: ChatAttachment }) {
  const [url, setUrl] = useState(attachment.signed_url ?? ''); const [loading, setLoading] = useState(!url); const [error, setError] = useState(false);
  useEffect(() => {
    if (url) return; let cancelled = false;
    const run = async () => {
      try {
        const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined; if (!baseUrl) throw new Error('VITE_SUPABASE_URL is not configured.');
        const form = new FormData(); form.append('action', 'sign'); form.append('message_id', messageId);
        const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/functions/v1/${MEDIA_FUNCTION}`, { method: 'POST', credentials: 'include', body: form });
        const body = (await response.json().catch(() => null)) as { signed_url?: string; error?: string } | null;
        if (!response.ok || !body?.signed_url) throw new Error(body?.error || 'Unable to load image.');
        if (!cancelled) setUrl(body.signed_url);
      } catch (err) { console.error('Failed to sign chat image:', err); if (!cancelled) setError(true); }
      finally { if (!cancelled) setLoading(false); }
    }; void run(); return () => { cancelled = true; };
  }, [messageId, url]);
  if (loading) return <div className="flex h-40 w-56 items-center justify-center rounded-xl bg-brand-800/40"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (error || !url) return <div className="rounded-xl bg-brand-800/40 px-4 py-3 text-xs text-gray-400">Image unavailable</div>;
  return <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl"><img src={url} alt={attachment.name} className="max-h-72 w-full max-w-xs object-cover" loading="lazy" /></a>;
}

export default function ChatPage() {
  const { selectedChatMoverId, navigate } = useNav(); const { profile } = useAuth();
  const [mover, setMover] = useState<ChatMover | null>(null); const [booking, setBooking] = useState<MovingBooking | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]); const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([]);
  const [newMessage, setNewMessage] = useState(''); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false); const [uploading, setUploading] = useState(false); const [responding, setResponding] = useState(false);
  const [proposing, setProposing] = useState(false); const [showScheduler, setShowScheduler] = useState(false);
  const [scheduleValue, setScheduleValue] = useState<MoverScheduleValue | null>(null); const [pageError, setPageError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null); const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null); const streamRef = useRef<EventSource | null>(null);

  const isMover = profile?.id === mover?.user_id; const bookingStatus = normalizeStatus(booking?.status);
  // Canonical conversation identity is always the sorted renter/mover user IDs. Booking IDs live in event_data.
  const conversationId = profile && mover ? getConversationId(profile.id, mover.user_id) : '';
  const receiverId = isMover ? booking?.renter_id ?? null : mover?.user_id ?? null;

  const blockedIntervals: MoverBlockedInterval[] = useMemo(() => scheduleEvents.filter((event) => event.booking_id !== booking?.id).map((event) => ({ id: event.id, starts_at: event.starts_at, ends_at: event.ends_at, status: event.status })), [scheduleEvents, booking?.id]);
  const latestSchedule = useMemo(() => booking ? scheduleEvents.filter((event) => event.booking_id === booking.id).sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())[0] ?? null : null, [booking, scheduleEvents]);
  const scrollToBottom = useCallback(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), []);
  useEffect(() => { if (messages.length) scrollToBottom(); }, [messages.length, scrollToBottom]);

  const loadMover = useCallback(async () => {
    if (!selectedChatMoverId) { setMover(null); return; }
    const rows = await protectedGet<ChatMover[]>(`/rest/v1/movers?select=*&id=eq.${encodeURIComponent(selectedChatMoverId)}&limit=1`); setMover(first(rows));
  }, [selectedChatMoverId]);

  const loadData = useCallback(async () => {
    if (!profile || !mover || !conversationId) return;
    const bookingFilter = isMover ? `mover_id=eq.${encodeURIComponent(mover.id)}` : `renter_id=eq.${encodeURIComponent(profile.id)}&mover_id=eq.${encodeURIComponent(mover.id)}`;
    const [generalMessages, bookingRows, events] = await Promise.all([
      protectedGet<ChatMessage[]>(`/rest/v1/chat_messages?select=*&conversation_id=eq.${encodeURIComponent(conversationId)}&order=created_at.asc`),
      protectedGet<MovingBooking[]>(`/rest/v1/bookings?select=*&${bookingFilter}&order=requested_at.desc&limit=1`),
      protectedGet<ScheduleEvent[]>(`/rest/v1/mover_schedule_events?select=*&mover_id=eq.${encodeURIComponent(mover.id)}&order=starts_at.asc`),
    ]);
    setBooking(first(bookingRows)); setMessages(asRows(generalMessages)); setScheduleEvents(asRows(events));
  }, [profile, mover, isMover, conversationId]);

  useEffect(() => {
    let cancelled = false; const run = async () => { setLoading(true); setPageError(null); try { await loadMover(); } catch (error) { if (!cancelled) setPageError(errorMessage(error, 'Unable to load mover chat.')); } finally { if (!cancelled) setLoading(false); } };
    void run(); return () => { cancelled = true; };
  }, [loadMover]);
  useEffect(() => { if (!profile || !mover || !conversationId) return; void loadData().catch((error) => setPageError(errorMessage(error, 'Unable to load chat.'))); }, [profile, mover, conversationId, loadData]);

  useEffect(() => {
    if (!profile || !mover || !conversationId) return; const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined; if (!baseUrl) return;
    streamRef.current?.close(); const params = new URLSearchParams({ peer_user_id: mover.user_id }); if (booking?.id) params.set('booking_id', booking.id);
    const stream = new EventSource(`${baseUrl.replace(/\/+$/, '')}/functions/v1/${STREAM_FUNCTION}?${params.toString()}`, { withCredentials: true }); streamRef.current = stream;
    stream.addEventListener('messages', (event) => { try { const incoming = JSON.parse((event as MessageEvent).data) as ChatMessage[]; setMessages((previous) => { const map = new Map(previous.map((message) => [message.id, message])); for (const message of incoming) if (message.conversation_id === conversationId) map.set(message.id, message); return Array.from(map.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); }); } catch (error) { console.error('Invalid chat stream message:', error); } });
    stream.addEventListener('booking', (event) => { try { setBooking(JSON.parse((event as MessageEvent).data) as MovingBooking); } catch (error) { console.error('Invalid booking stream event:', error); } });
    stream.onerror = () => { /* browser EventSource reconnects automatically */ }; return () => { stream.close(); if (streamRef.current === stream) streamRef.current = null; };
  }, [profile, mover, conversationId, booking?.id]);

  const sendText = async () => {
    if (!profile || !mover || !receiverId || !newMessage.trim() || !conversationId) return; setSending(true); setPageError(null);
    try { const created = await protectedPost<ChatMessage | ChatMessage[]>('/rest/v1/chat_messages', { conversation_id: conversationId, sender_id: profile.id, receiver_id: receiverId, content: newMessage.trim(), message_type: 'text', event_data: null }, { headers: { Prefer: 'return=representation' } }); const message = first(created); if (message) setMessages((previous) => [...previous.filter((item) => item.id !== message.id), message].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())); setNewMessage(''); }
    catch (error) { setPageError(errorMessage(error, 'Unable to send message.')); } finally { setSending(false); }
  };

  const uploadImage = async (file: File) => {
    if (!profile || !mover || !receiverId || !conversationId) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) { setPageError('Only JPG, PNG, WEBP, and GIF pictures are allowed.'); return; }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) { setPageError('Picture attachments must be smaller than 8 MB.'); return; }
    setUploading(true); setPageError(null);
    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined; if (!baseUrl) throw new Error('VITE_SUPABASE_URL is not configured.');
      const form = new FormData(); form.append('file', file); const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/functions/v1/${MEDIA_FUNCTION}`, { method: 'POST', credentials: 'include', body: form });
      const body = (await response.json().catch(() => null)) as (ChatAttachment & { error?: string }) | null; if (!response.ok || !body?.path) throw new Error(body?.error || 'Unable to upload picture.');
      const attachment: ChatAttachment = { path: body.path, name: body.name, mime_type: body.mime_type, size: body.size, signed_url: body.signed_url };
      const created = await protectedPost<ChatMessage | ChatMessage[]>('/rest/v1/chat_messages', { conversation_id: conversationId, sender_id: profile.id, receiver_id: receiverId, content: attachment.name, message_type: 'image', event_data: { attachments: [attachment] } }, { headers: { Prefer: 'return=representation' } });
      const message = first(created); if (message) setMessages((previous) => [...previous.filter((item) => item.id !== message.id), message].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
    } catch (error) { setPageError(errorMessage(error, 'Unable to send picture.')); } finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const respondToBooking = async (decision: 'confirm' | 'cancel') => {
    if (!profile || !booking || !isMover) return; setResponding(true); setPageError(null);
    try { await protectedPost('/rest/v1/rpc/respond_to_mover_booking', { p_booking_id: booking.id, p_decision: decision, p_reason: decision === 'cancel' ? 'Mover declined the request.' : null }); await loadData(); }
    catch (error) { setPageError(errorMessage(error, 'Unable to update the booking request.')); } finally { setResponding(false); }
  };

  const proposeSchedule = async () => {
    if (!profile || !mover || !booking || isMover || !scheduleValue) return; setProposing(true); setScheduleError(null);
    try {
      if (bookingStatus !== 'confirmed') throw new Error('The mover must accept the request before a moving time can be proposed.');
      const startsAt = toNairobiIso(scheduleValue.date, scheduleValue.startTime); const endsAt = toNairobiIso(scheduleValue.date, scheduleValue.endTime);
      await protectedPost('/rest/v1/rpc/propose_moving_schedule', { p_booking_id: booking.id, p_starts_at: startsAt, p_ends_at: endsAt });
      await protectedPost('/rest/v1/chat_messages', { conversation_id: conversationId, sender_id: profile.id, receiver_id: mover.user_id, content: 'Moving schedule proposed. Please confirm the requested date and time.', message_type: 'schedule_proposed', event_data: { booking_id: booking.id, starts_at: startsAt, ends_at: endsAt } }, { headers: { Prefer: 'return=minimal' } });
      setShowScheduler(false); setScheduleValue(null); await loadData();
    } catch (error) { setScheduleError(errorMessage(error, 'Unable to propose the moving schedule.')); } finally { setProposing(false); }
  };

  const confirmSchedule = async () => {
    if (!profile || !booking || !isMover) return; setResponding(true); setPageError(null);
    try { await protectedPost('/rest/v1/rpc/confirm_moving_schedule', { p_booking_id: booking.id }); await protectedPost('/rest/v1/chat_messages', { conversation_id: conversationId, sender_id: profile.id, receiver_id: booking.renter_id, content: 'The mover confirmed the moving date and time.', message_type: 'schedule_confirmed', event_data: { booking_id: booking.id } }, { headers: { Prefer: 'return=minimal' } }); await loadData(); }
    catch (error) { setPageError(errorMessage(error, 'Unable to confirm the moving schedule.')); } finally { setResponding(false); }
  };
  const refresh = async () => { setRefreshing(true); setPageError(null); try { await loadData(); } catch (error) { setPageError(errorMessage(error, 'Unable to refresh chat.')); } finally { setRefreshing(false); } };

  if (loading) return <div className="flex min-h-[500px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-600" /></div>;
  if (!mover) return <div className="mx-auto max-w-2xl px-4 py-12 text-center"><MessageCircle className="mx-auto h-12 w-12 text-gray-300" /><h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Chat unavailable</h1><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">The selected mover could not be found.</p><button type="button" onClick={() => navigate('movers')} className="btn-primary mt-5">Browse Movers</button></div>;

  return <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
    <header className="card mb-4 flex items-center gap-3 p-4"><button type="button" onClick={() => navigate('mover-detail', mover.id)} className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-brand-600 dark:hover:bg-brand-800" aria-label="Back to mover"><ArrowLeft className="h-5 w-5" /></button>{mover.profile_photo_url ? <img src={mover.profile_photo_url} alt={mover.driver_full_name || 'Mover'} className="h-11 w-11 rounded-full object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-800"><Truck className="h-5 w-5 text-brand-600 dark:text-brand-400" /></div>}<div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold text-gray-900 dark:text-white">{mover.business_name || mover.driver_full_name || 'Mover'}</h1><p className="truncate text-xs text-gray-500 dark:text-gray-400">{mover.operating_city || mover.operating_county || 'Mover'}{mover.vehicle_type ? ` · ${mover.vehicle_type}` : ''}</p></div><button type="button" onClick={() => void refresh()} disabled={refreshing} className="rounded-full p-2 text-gray-400 hover:text-brand-600 disabled:opacity-50" aria-label="Refresh chat"><RefreshCw className={cn('h-5 w-5', refreshing && 'animate-spin')} /></button></header>
    {pageError && <div className="mb-4 flex items-start gap-2 rounded-xl border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-400"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{pageError}</span><button type="button" onClick={() => setPageError(null)} className="ml-auto" aria-label="Dismiss error"><X className="h-4 w-4" /></button></div>}
    {booking && <section className="card mb-4 overflow-hidden"><div className="border-b border-gray-200 p-4 dark:border-brand-800"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">Moving request</p><h2 className="mt-1 font-bold text-gray-900 dark:text-white">{booking.pickup_address} → {booking.dropoff_address}</h2></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold capitalize text-gray-700 dark:bg-brand-800 dark:text-gray-300">{bookingStatus.replace(/_/g, ' ') || 'unknown'}</span></div></div><div className="grid gap-3 p-4 sm:grid-cols-3"><div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-800/30"><p className="text-xs text-gray-500 dark:text-gray-400">Total</p><p className="mt-1 font-bold text-gray-900 dark:text-white">{formatKES(booking.total_amount)}</p></div><div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-800/30"><p className="text-xs text-gray-500 dark:text-gray-400">Requested</p><p className="mt-1 font-semibold text-gray-900 dark:text-white">{formatDateTime(booking.requested_at)}</p></div><div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-800/30"><p className="text-xs text-gray-500 dark:text-gray-400">Moving time</p><p className="mt-1 font-semibold text-gray-900 dark:text-white">{booking.scheduled_start_at ? formatDateTime(booking.scheduled_start_at) : 'Not scheduled'}</p></div></div>{isMover && bookingStatus === 'pending' && <div className="flex gap-2 border-t border-gray-200 p-4 dark:border-brand-800"><button type="button" onClick={() => void respondToBooking('confirm')} disabled={responding} className="btn-primary flex flex-1 items-center justify-center gap-2 text-sm">{responding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Accept Request</button><button type="button" onClick={() => void respondToBooking('cancel')} disabled={responding} className="btn-secondary flex flex-1 items-center justify-center gap-2 text-sm"><XCircle className="h-4 w-4" />Decline</button></div>}</section>}
    {booking && bookingStatus === 'confirmed' && !booking.scheduled_start_at && !isMover && <section className="mb-4">{!showScheduler ? <button type="button" onClick={() => setShowScheduler(true)} className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-brand-400"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-800/50"><CalendarDays className="h-5 w-5 text-brand-600 dark:text-brand-400" /></div><div className="flex-1"><h2 className="font-bold text-gray-900 dark:text-white">Choose moving date & time</h2><p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Only this mover's working days and free time are selectable.</p></div></button> : <div className="card p-4"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-gray-900 dark:text-white">Select moving schedule</h2><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The mover has accepted your request. Select a time within their availability.</p></div><button type="button" onClick={() => setShowScheduler(false)} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-brand-800"><X className="h-4 w-4" /></button></div><MoverSchedulePicker workingDays={mover.working_days} startTime={mover.start_time} endTime={mover.end_time} blockedIntervals={blockedIntervals} value={scheduleValue ?? undefined} onChange={setScheduleValue} />{scheduleValue && <div className="mt-4 rounded-xl bg-brand-50 p-4 text-sm dark:bg-brand-800/40"><div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white"><Clock3 className="h-4 w-4 text-brand-600 dark:text-brand-400" />{formatDate(scheduleValue.date)} · {formatTime(scheduleValue.startTime)} – {formatTime(scheduleValue.endTime)}</div></div>}{scheduleError && <p className="mt-3 rounded-xl bg-error-50 p-3 text-xs text-error-700 dark:bg-error-900/20 dark:text-error-400">{scheduleError}</p>}<button type="button" onClick={() => void proposeSchedule()} disabled={!scheduleValue || proposing} className="btn-primary mt-4 flex w-full items-center justify-center gap-2">{proposing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}Propose This Time</button></div>}</section>}
    {booking && bookingStatus === 'confirmed' && latestSchedule && normalizeStatus(latestSchedule.status) === 'tentative' && isMover && <section className="card mb-4 border-2 border-brand-300 p-4 dark:border-brand-600"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-brand-600 dark:text-brand-400" /><div className="flex-1"><h2 className="font-bold text-gray-900 dark:text-white">Schedule awaiting your confirmation</h2><p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{formatDateTime(latestSchedule.starts_at)} – {formatTime(latestSchedule.ends_at)}</p><button type="button" onClick={() => void confirmSchedule()} disabled={responding} className="btn-primary mt-3 flex items-center gap-2 text-sm">{responding ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Confirm Schedule</button></div></div></section>}
    {booking?.scheduled_start_at && <section className="card mb-4 border-2 border-success-200 p-4 dark:border-success-800"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-success-600 dark:text-success-400" /><div><h2 className="font-bold text-gray-900 dark:text-white">Moving schedule confirmed</h2><p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{formatDateTime(booking.scheduled_start_at)} – {formatTime(booking.scheduled_end_at)}</p>{!isMover && booking.payment_status !== 'paid' && <button type="button" onClick={() => navigate('renter-payment', booking.id)} className="btn-primary mt-3 text-sm">Continue to payment</button>}</div></div></section>}
    <section className="card mb-4 h-[55vh] min-h-[420px] overflow-y-auto p-4 sm:p-5">{messages.length === 0 ? <div className="flex h-full flex-col items-center justify-center text-center"><MessageCircle className="h-10 w-10 text-gray-300" /><h2 className="mt-3 font-semibold text-gray-900 dark:text-white">Start the conversation</h2><p className="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">Discuss pickup details, access instructions, moving items, and anything the mover needs to know.</p></div> : <div className="space-y-3">{messages.map((message) => { const own = message.sender_id === profile?.id; const attachment = message.message_type === 'image' ? getAttachment(message) : null; const bookingId = getBookingIdFromMessage(message); if (attachment) return <div key={message.id} className={cn('flex', own ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[82%] rounded-2xl p-2', own ? 'bg-brand-600' : 'bg-gray-100 dark:bg-brand-800')}><ChatImage messageId={message.id} attachment={attachment} /><p className={cn('px-2 pt-1 text-xs', own ? 'text-brand-100' : 'text-gray-500 dark:text-gray-400')}>{formatDateTime(message.created_at)}</p></div></div>; if (message.message_type === 'booking_request') return <div key={message.id} className="flex justify-center"><div className="max-w-xl rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-700 dark:bg-brand-900/30"><div className="flex items-center gap-2"><Truck className="h-4 w-4 text-brand-600 dark:text-brand-400" /><p className="font-semibold text-brand-800 dark:text-brand-300">Moving request</p></div><p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{message.content}</p>{bookingId && <p className="mt-2 text-xs text-gray-500">Booking #{bookingId.slice(0, 8)}</p>}</div></div>; if (message.message_type === 'schedule_proposed') return <div key={message.id} className="flex justify-center"><div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-700 dark:bg-brand-900/30"><div className="flex items-center gap-2 font-semibold text-brand-800 dark:text-brand-300"><CalendarDays className="h-4 w-4" />Schedule proposed</div><p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{message.content}</p></div></div>; if (message.message_type === 'schedule_confirmed') return <div key={message.id} className="flex justify-center"><div className="rounded-full bg-success-50 px-4 py-2 text-xs font-medium text-success-700 dark:bg-success-900/30 dark:text-success-400"><CheckCircle2 className="mr-1 inline h-4 w-4" />{message.content}</div></div>; return <div key={message.id} className={cn('flex', own ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[82%] rounded-2xl px-4 py-2.5', own ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-800 dark:bg-brand-800 dark:text-gray-200')}><p className="whitespace-pre-wrap break-words text-sm">{message.content}</p><p className={cn('mt-1 text-[10px]', own ? 'text-brand-100' : 'text-gray-400')}>{formatDateTime(message.created_at)}</p></div></div>; })}<div ref={messagesEndRef} /></div>}</section>
    <section className="card p-3"><input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); }} /><div className="flex items-end gap-2"><button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || sending || !receiverId} className="rounded-full p-2.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600 disabled:opacity-50 dark:hover:bg-brand-800" aria-label="Attach picture" title="Attach picture">{uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}</button>{!isMover && booking && bookingStatus === 'confirmed' && !booking.scheduled_start_at && <button type="button" onClick={() => setShowScheduler((value) => !value)} className={cn('rounded-full p-2.5', showScheduler ? 'bg-brand-100 text-brand-600 dark:bg-brand-800 dark:text-brand-400' : 'text-gray-400 hover:bg-gray-100 hover:text-brand-600 dark:hover:bg-brand-800')} aria-label="Choose moving date and time" title="Choose moving date and time"><CalendarDays className="h-5 w-5" /></button>}<input type="text" value={newMessage} onChange={(event) => setNewMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendText(); } }} placeholder="Type a message..." maxLength={2000} disabled={!receiverId} className="input-field flex-1" /><button type="button" onClick={() => void sendText()} disabled={!newMessage.trim() || sending || uploading || !receiverId} className="btn-primary flex items-center justify-center gap-2" aria-label="Send message">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div><div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-gray-400"><Paperclip className="h-3 w-3" />Pictures only · max 8 MB</div></section>
    <p className="mt-4 flex items-center justify-center gap-1 text-center text-xs text-gray-400"><Navigation className="h-3 w-3" />Saka Krib moving conversations are protected.</p>
  </div>;
}
