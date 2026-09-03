import {
  AlertCircle, ArrowLeft, CalendarDays, Check, CheckCircle2, Clock3, ImagePlus, Loader2,
  MessageCircle, Navigation, Paperclip, RefreshCw, Send, ShieldCheck, Truck, X, XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import MoverSchedulePicker, { type MoverBlockedInterval, type MoverScheduleValue } from '@/components/Renter/MoverSchedulePicker';
import { protectedGet, protectedPost, protectedUpload } from '@/lib/protectedApi';
import { cn, formatKES } from '@/lib/utils';

interface ChatMover { id: string; user_id: string; driver_full_name: string | null; business_name: string | null; profile_photo_url: string | null; phone: string | null; vehicle_type: string | null; number_plate: string | null; operating_city: string | null; operating_county: string | null; base_rate_kes: number | null; rate_per_km_kes: number | null; approval_status: string | null; is_available: boolean | null; working_days: string[] | null; start_time: string | null; end_time: string | null; }
interface ChatMessage { id: string; conversation_id: string; sender_id: string; receiver_id: string; content: string; message_type: string | null; event_data: Record<string, unknown> | null; created_at: string; }
interface MovingBooking { id: string; renter_id: string; mover_id: string; pickup_address: string; dropoff_address: string; moving_date: string | null; booking_amount: number | null; commission_amount: number | null; total_amount: number | null; status: string | null; payment_status: string | null; requested_at: string | null; request_expires_at: string | null; confirmed_at: string | null; scheduled_start_at: string | null; scheduled_end_at: string | null; }
interface ScheduleEvent { id: string; mover_id: string; booking_id: string; starts_at: string; ends_at: string; status: string; title: string | null; }
interface ChatAttachment { path: string; name: string; mime_type: string; size: number; signed_url?: string; }
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
function getConversationId(userA: string, userB: string) { return [userA, userB].sort().join('__'); }
function first<T>(value: T | T[] | null | undefined): T | null { if (value == null) return null; return Array.isArray(value) ? value[0] ?? null : value; }
function asRows<T>(value: T | T[] | null | undefined): T[] { if (value == null) return []; return Array.isArray(value) ? value : [value]; }
function errorMessage(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }
function normalizeStatus(value: string | null | undefined) { return String(value ?? '').trim().toLowerCase().replace(/-/g, '_'); }
function formatDate(value: string | null | undefined) { if (!value) return '—'; const date = new Date(`${value}T00:00:00+03:00`); if (Number.isNaN(date.getTime())) return value; return date.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
function formatDateTime(value: string | null | undefined) { if (!value) return '—'; const date = new Date(value); if (Number.isNaN(date.getTime())) return '—'; return date.toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
function formatTime(value: string | null | undefined) { if (!value) return '—'; const match = String(value).match(/^(\d{1,2}):(\d{2})/); if (!match) return value; return new Date(2000, 0, 1, Number(match[1]), Number(match[2])).toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' }); }
function toNairobiIso(date: string, time: string) { return `${date}T${time}:00+03:00`; }
function getBookingIdFromMessage(message: ChatMessage) { const value = message.event_data?.booking_id; return typeof value === 'string' ? value : null; }
function getAttachment(message: ChatMessage): ChatAttachment | null { const raw = message.event_data?.attachments; if (!Array.isArray(raw) || raw.length === 0) return null; const value = raw[0]; if (!value || typeof value !== 'object') return null; const item = value as Record<string, unknown>; if (typeof item.path !== 'string' || typeof item.name !== 'string' || typeof item.mime_type !== 'string') return null; return { path: item.path, name: item.name, mime_type: item.mime_type, size: typeof item.size === 'number' ? item.size : 0, signed_url: typeof item.signed_url === 'string' ? item.signed_url : undefined }; }
function areScheduleValuesEqual(a: MoverScheduleValue | null, b: MoverScheduleValue | null) { if (a === b) return true; if (!a || !b) return false; return a.date === b.date && a.startTime === b.startTime && a.endTime === b.endTime; }
function getWebSocketUrl(conversationId: string) {
  const configured = (import.meta.env.VITE_DJANGO_API_URL as string | undefined)?.replace(/\/+$/, '').replace(/\/api$/, '');
  const base = configured || window.location.origin;
  const url = new URL(`${base}/ws/chat/${encodeURIComponent(conversationId)}/`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function ChatImage({ messageId, attachment }: { messageId: string; attachment: ChatAttachment }) {
  const [url, setUrl] = useState(attachment.signed_url ?? '');
  const [loading, setLoading] = useState(!url);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (url) return;
    let cancelled = false;
    const run = async () => {
      try {
        const form = new FormData(); form.append('action', 'sign'); form.append('message_id', messageId);
        const body = await protectedUpload<{ signed_url?: string; error?: string }>('/api/core/chat/media/', form);
        if (!body?.signed_url) throw new Error(body?.error || 'Unable to load image.');
        if (!cancelled) setUrl(body.signed_url);
      } catch (err) { console.error('Failed to sign chat image:', err); if (!cancelled) setError(true); }
      finally { if (!cancelled) setLoading(false); }
    };
    void run();
    return () => { cancelled = true; };
  }, [messageId, url]);
  if (loading) return <div className="flex h-40 w-56 items-center justify-center rounded-xl bg-brand-800/40"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (error || !url) return <div className="rounded-xl bg-brand-800/40 px-2 py-3 text-xs text-gray-400">Image unavailable</div>;
  return <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl"><img src={url} alt={attachment.name} className="max-h-72 w-full max-w-xs object-cover" loading="lazy" /></a>;
}

export default function ChatPage() {
  const { selectedChatMoverId, navigate } = useNav();
  const { profile } = useAuth();
  const [mover, setMover] = useState<ChatMover | null>(null);
  const [booking, setBooking] = useState<MovingBooking | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [responding, setResponding] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduleValue, setScheduleValue] = useState<MoverScheduleValue | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const loadGenerationRef = useRef(0);
  const isMover = profile?.id === mover?.user_id;
  const bookingStatus = normalizeStatus(booking?.status);
  const conversationId = profile && mover ? getConversationId(profile.id, mover.user_id) : '';
  const receiverId = isMover ? booking?.renter_id ?? null : mover?.user_id ?? null;
  useEffect(() => { const ws = socketRef.current; return () => { if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current); ws?.close(); }; }, []);
  const blockedIntervals: MoverBlockedInterval[] = useMemo(() => scheduleEvents.filter(event => event.booking_id !== booking?.id).map(event => ({ id: event.id, starts_at: event.starts_at, ends_at: event.ends_at, status: event.status })), [scheduleEvents, booking?.id]);
  const latestSchedule = useMemo(() => { if (!booking?.id) return null; return scheduleEvents.filter(event => event.booking_id === booking.id).sort((a,b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())[0] ?? null; }, [booking?.id, scheduleEvents]);
  const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, []);
  useEffect(() => { if (messages.length > 0) scrollToBottom(); }, [messages.length, scrollToBottom]);
  const handleScheduleChange = useCallback((next: MoverScheduleValue | null) => { setScheduleValue(previous => areScheduleValuesEqual(previous, next) ? previous : next); }, []);

  const loadMover = useCallback(async () => {
    if (!selectedChatMoverId) { setMover(null); return; }
    const row = await protectedGet<ChatMover>(`/api/core/movers/${encodeURIComponent(selectedChatMoverId)}/`);
    setMover(first(row));
  }, [selectedChatMoverId]);

  const loadData = useCallback(async () => {
    if (!profile || !mover || !conversationId) return;
    const generation = ++loadGenerationRef.current;
    const bookingQuery = isMover ? `?mover_id=${encodeURIComponent(mover.id)}` : `?renter_id=${encodeURIComponent(profile.id)}&mover_id=${encodeURIComponent(mover.id)}`;
    const [chatResponse, bookingRows, events] = await Promise.all([
      protectedGet<{ messages?: ChatMessage[] }>(`/api/core/chat/?conversation_id=${encodeURIComponent(conversationId)}`),
      protectedGet<MovingBooking[]>(`/api/core/bookings/${bookingQuery}`),
      protectedGet<ScheduleEvent[]>(`/api/core/mover-schedule-events/?mover_id=${encodeURIComponent(mover.id)}`),
    ]);
    if (generation !== loadGenerationRef.current) return;
    setBooking(first(bookingRows)); setMessages(asRows(chatResponse?.messages)); setScheduleEvents(asRows(events));
  }, [profile, mover, isMover, conversationId]);

  useEffect(() => { let cancelled = false; const run = async () => { setLoading(true); setPageError(null); try { await loadMover(); } catch (error) { if (!cancelled) setPageError(errorMessage(error, 'Unable to load mover chat.')); } finally { if (!cancelled) setLoading(false); } }; void run(); return () => { cancelled = true; }; }, [loadMover]);
  useEffect(() => { if (!profile || !mover || !conversationId) return; let cancelled = false; const run = async () => { try { await loadData(); } catch (error) { if (!cancelled) setPageError(errorMessage(error, 'Unable to load chat.')); } }; void run(); return () => { cancelled = true; }; }, [profile, mover, conversationId, loadData]);

  useEffect(() => {
    if (!profile || !mover || !conversationId) return;
    let cancelled = false;
    const connect = async () => {
      if (cancelled) return;
      try {
        if (reconnectTimerRef.current) { window.clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
        socketRef.current?.close();
        const socket = new WebSocket(getWebSocketUrl(conversationId));
        socketRef.current = socket;
        socket.onopen = () => { reconnectAttemptRef.current = 0; setSocketConnected(true); };
        socket.onmessage = event => {
          try {
            const payload = JSON.parse(event.data) as { type?: string; message?: ChatMessage };
            if (payload.type !== 'message' || !payload.message || payload.message.conversation_id !== conversationId) return;
            setMessages(previous => [...previous.filter(item => item.id !== payload.message!.id), payload.message!].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
          } catch (error) { console.warn('Ignoring malformed chat WebSocket event:', error); }
        };
        socket.onerror = () => setSocketConnected(false);
        socket.onclose = () => {
          if (cancelled) return;
          setSocketConnected(false);
          const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 15000);
          reconnectAttemptRef.current += 1;
          reconnectTimerRef.current = window.setTimeout(() => {
            void protectedGet('/api/accounts/me/').catch(() => undefined).finally(() => { if (!cancelled) void connect(); });
          }, delay);
        };
      } catch (error) {
        setSocketConnected(false);
        if (!cancelled) reconnectTimerRef.current = window.setTimeout(() => void connect(), 3000);
      }
    };
    void connect();
    return () => { cancelled = true; if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; socketRef.current?.close(); socketRef.current = null; setSocketConnected(false); };
  }, [profile, mover, conversationId]);

  const sendText = useCallback(async () => {
    if (!profile || !mover || !receiverId || !newMessage.trim() || !conversationId) return;
    setSending(true); setPageError(null);
    try {
      const response = await protectedPost<{ message?: ChatMessage }>(`/api/core/chat/`, { receiver_id: receiverId, content: newMessage.trim(), message_type: 'text', event_data: null });
      const message = response?.message;
      if (message) setMessages(previous => [...previous.filter(item => item.id !== message.id), message].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
      setNewMessage('');
    } catch (error) { setPageError(errorMessage(error, 'Unable to send message.')); } finally { setSending(false); }
  }, [profile, mover, receiverId, conversationId, newMessage]);

  const uploadImage = useCallback(async (file: File) => {
    if (!profile || !mover || !receiverId || !conversationId) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) { setPageError('Only JPG, PNG, WEBP, and GIF pictures are allowed.'); return; }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) { setPageError('Picture attachments must be smaller than 8 MB.'); return; }
    setUploading(true); setPageError(null);
    try {
      const form = new FormData(); form.append('file', file);
      const attachment = await protectedUpload<ChatAttachment>('/api/core/chat/media/', form);
      if (!attachment?.path) throw new Error('Unable to upload picture.');
      const response = await protectedPost<{ message?: ChatMessage }>('/api/core/chat/', { receiver_id: receiverId, content: attachment.name, message_type: 'image', event_data: { attachments: [attachment] } });
      const message = response?.message;
      if (message) setMessages(previous => [...previous.filter(item => item.id !== message.id), message].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
    } catch (error) { setPageError(errorMessage(error, 'Unable to send picture.')); } finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }, [profile, mover, receiverId, conversationId]);

  const respondToBooking = useCallback(async (decision: 'confirm' | 'cancel') => { if (!profile || !booking || !isMover) return; setResponding(true); setPageError(null); try { await protectedPost(`/api/core/bookings/${booking.id}/respond/`, { decision, reason: decision === 'cancel' ? 'Mover declined the request.' : null }); await loadData(); } catch (error) { setPageError(errorMessage(error, 'Unable to update the booking request.')); } finally { setResponding(false); } }, [profile, booking, isMover, loadData]);
  const proposeSchedule = useCallback(async () => { if (!profile || !mover || !booking || isMover || !scheduleValue) return; setProposing(true); setScheduleError(null); try { if (bookingStatus !== 'confirmed') throw new Error('The mover must accept the request before a moving time can be proposed.'); const startsAt = toNairobiIso(scheduleValue.date, scheduleValue.startTime); const endsAt = toNairobiIso(scheduleValue.date, scheduleValue.endTime); await protectedPost(`/api/core/bookings/${booking.id}/schedule/propose/`, { starts_at: startsAt, ends_at: endsAt }); await protectedPost('/api/core/chat/', { receiver_id: mover.user_id, content: 'Moving schedule proposed. Please confirm the requested date and time.', message_type: 'schedule_proposed', event_data: { booking_id: booking.id, starts_at: startsAt, ends_at: endsAt } }); setShowScheduler(false); setScheduleValue(null); await loadData(); } catch (error) { setScheduleError(errorMessage(error, 'Unable to propose the moving schedule.')); } finally { setProposing(false); } }, [profile, mover, booking, isMover, scheduleValue, bookingStatus, conversationId, loadData]);
  const confirmSchedule = useCallback(async () => { if (!profile || !booking || !isMover) return; setResponding(true); setPageError(null); try { await protectedPost(`/api/core/bookings/${booking.id}/schedule/confirm/`, {}); await protectedPost('/api/core/chat/', { receiver_id: booking.renter_id, content: 'The mover confirmed the moving date and time.', message_type: 'schedule_confirmed', event_data: { booking_id: booking.id } }); await loadData(); } catch (error) { setPageError(errorMessage(error, 'Unable to confirm the moving schedule.')); } finally { setResponding(false); } }, [profile, booking, isMover, conversationId, loadData]);
  const refresh = useCallback(async () => { setRefreshing(true); setPageError(null); try { await loadData(); } catch (error) { setPageError(errorMessage(error, 'Unable to refresh chat.')); } finally { setRefreshing(false); } }, [loadData]);
  const cancelBooking = useCallback(async () => { if (!booking) return; setResponding(true); setPageError(null); try { await protectedPost(`/api/core/bookings/${booking.id}/cancel/`, { reason: 'Cancelled from chat.' }); await loadData(); } catch (error) { setPageError(errorMessage(error, 'Unable to cancel booking.')); } finally { setResponding(false); } }, [booking, loadData]);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!mover) return <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center"><MessageCircle className="h-8 w-8" /><p className="text-sm text-gray-400">Unable to load this chat.</p><button onClick={() => navigate(-1)} className="rounded-lg px-4 py-2">Go back</button></div>;

  return <div className="min-h-screen bg-background text-foreground"><div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col">
    <header className="flex items-center gap-3 border-b px-4 py-3"><button onClick={() => navigate(-1)} className="rounded-lg p-2 hover:bg-muted" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0 flex-1"><h1 className="truncate font-semibold">{mover.business_name || mover.driver_full_name || 'Mover'}</h1><p className="text-xs text-muted-foreground">{mover.operating_city || mover.operating_county || 'Moving service'}</p></div><div className="flex items-center gap-2"><span className={cn('h-2 w-2 rounded-full', socketConnected ? 'bg-green-500' : 'bg-gray-400')} title={socketConnected ? 'Live chat connected' : 'Reconnecting chat'} /><button onClick={() => void refresh()} disabled={refreshing} className="rounded-lg p-2 hover:bg-muted" aria-label="Refresh"><RefreshCw className={cn('h-5 w-5', refreshing && 'animate-spin')} /></button></div></header>
    {pageError && <div className="mx-4 mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">{pageError}</div>}
    <main className="flex-1 overflow-y-auto px-4 py-4">
      {booking && <div className="mb-4 rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs text-muted-foreground">Moving booking</p><p className="font-medium">{formatDate(booking.moving_date)}</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{booking.status || 'pending'}</span></div><div className="mt-3 grid gap-2 text-sm"><p><span className="text-muted-foreground">Pickup:</span> {booking.pickup_address}</p><p><span className="text-muted-foreground">Dropoff:</span> {booking.dropoff_address}</p><p><span className="text-muted-foreground">Total:</span> {formatKES(booking.total_amount ?? booking.booking_amount ?? 0)}</p></div></div>}
      <div className="space-y-3">{messages.map(message => { const attachment = getAttachment(message); const bookingMessageId = getBookingIdFromMessage(message); return <div key={message.id} className={cn('flex', message.sender_id === profile?.id ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[85%] rounded-2xl px-4 py-3', message.sender_id === profile?.id ? 'bg-primary text-primary-foreground' : 'bg-muted')}>{attachment ? <ChatImage messageId={message.id} attachment={attachment} /> : <p className="whitespace-pre-wrap text-sm">{message.content}</p>}{bookingMessageId && <p className="mt-1 text-[10px] opacity-70">Booking #{bookingMessageId.slice(0, 8)}</p>}<p className="mt-1 text-[10px] opacity-60">{formatDateTime(message.created_at)}</p></div></div>; })}<div ref={messagesEndRef} /></div>
      {latestSchedule && <div className="mt-4 rounded-xl border p-4"><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /><span className="font-medium">Moving schedule</span></div><p className="mt-2 text-sm">{formatDateTime(latestSchedule.starts_at)} — {formatTime(latestSchedule.ends_at)}</p></div>}
      {showScheduler && <div className="mt-4 rounded-xl border p-4"><MoverSchedulePicker value={scheduleValue} onChange={handleScheduleChange} blockedIntervals={blockedIntervals} /><div className="mt-3 flex gap-2"><button onClick={() => { setShowScheduler(false); setScheduleValue(null); }} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button onClick={() => void proposeSchedule()} disabled={proposing || !scheduleValue} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">{proposing ? 'Proposing…' : 'Propose schedule'}</button></div>{scheduleError && <p className="mt-2 text-sm text-destructive">{scheduleError}</p></div>}
    </main>
    <footer className="border-t p-3">{isMover && booking?.status === 'pending' && <div className="mb-3 flex gap-2"><button onClick={() => void respondToBooking('confirm')} disabled={responding} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Accept</button><button onClick={() => void respondToBooking('cancel')} disabled={responding} className="flex-1 rounded-lg border px-4 py-2 text-sm">Decline</button></div>}{!isMover && booking?.status === 'confirmed' && <div className="mb-3 flex gap-2"><button onClick={() => setShowScheduler(value => !value)} className="flex-1 rounded-lg border px-4 py-2 text-sm"><CalendarDays className="mr-2 inline h-4 w-4" />Schedule</button><button onClick={() => void cancelBooking()} disabled={responding} className="rounded-lg border px-4 py-2 text-sm">Cancel booking</button></div>}<div className="flex items-end gap-2"><input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void uploadImage(file); }} /><button onClick={() => fileInputRef.current?.click()} disabled={uploading || sending} className="rounded-lg p-2 hover:bg-muted" aria-label="Attach picture"><Paperclip className="h-5 w-5" /></button><textarea value={newMessage} onChange={event => setNewMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendText(); } }} placeholder="Type a message…" rows={1} className="min-h-10 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm" /><button onClick={() => void sendText()} disabled={sending || !newMessage.trim()} className="rounded-lg bg-primary p-2 text-primary-foreground" aria-label="Send"><Send className="h-5 w-5" /></button></div></footer>
  </div></div>;
}
