import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bell, CalendarDays, Loader2, MessageCircle, Paperclip, RefreshCw, Send, Truck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import MoverSchedulePicker, { type MoverBlockedInterval, type MoverScheduleValue } from '@/components/Renter/MoverSchedulePicker';
import ChatBookingCard from '@/components/ChatBookingCard';
import { protectedGet, protectedPatch, protectedPost, protectedUpload } from '@/lib/djangoApi';
import { cn, formatKES } from '@/lib/utils';

interface ChatMover { id: string; user_id: string; driver_full_name: string | null; business_name: string | null; profile_photo_url: string | null; phone: string | null; vehicle_type: string | null; number_plate: string | null; operating_city: string | null; operating_county: string | null; }
interface ChatMessage { id: string; conversation_id: string; sender_id: string; receiver_id: string; content: string; message_type: string | null; event_data: Record<string, unknown> | null; created_at: string; }
interface MovingBooking { id: string; renter_id: string; mover_id: string; pickup_address: string; dropoff_address: string; moving_date: string | null; booking_amount: number | null; commission_amount: number | null; total_amount: number | null; status: string | null; payment_status: string | null; payment_method: string | null; requested_at: string | null; request_expires_at: string | null; confirmed_at: string | null; scheduled_start_at: string | null; scheduled_end_at: string | null; pickup_latitude?: number | null; pickup_longitude?: number | null; dropoff_latitude?: number | null; dropoff_longitude?: number | null; }
interface ScheduleEvent { id: string; mover_id: string; booking_id: string; starts_at: string; ends_at: string; status: string; title: string | null; }
interface ChatAttachment { path: string; name: string; mime_type: string; size: number; signed_url?: string; }
interface Notification { id: string; notification_type: string; title: string; message: string; data?: Record<string, unknown> | null; read_at?: string | null; created_at: string; }

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const conversationIdForUsers = (a: string, b: string) => [a, b].sort().join('__');
const normalizeStatus = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
const first = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] ?? null : value ?? null;
const rows = <T,>(value: T | T[] | null | undefined): T[] => value == null ? [] : Array.isArray(value) ? value : [value];
const dateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
const dateOnly = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00+03:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const getWebSocketUrl = (conversationId: string) => { const configured = (import.meta.env.VITE_DJANGO_API_URL as string | undefined)?.replace(/\/+$/, '').replace(/\/api$/, ''); const url = new URL(`${configured || window.location.origin}/ws/chat/${encodeURIComponent(conversationId)}/`); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; return url.toString(); };

function ChatImage({ messageId, attachment }: { messageId: string; attachment: ChatAttachment }) {
  const [url, setUrl] = useState(attachment.signed_url ?? '');
  useEffect(() => { if (url) return; let cancelled = false; const run = async () => { try { const form = new FormData(); form.append('action', 'sign'); form.append('message_id', messageId); const body = await protectedUpload<{ signed_url?: string }>('/api/core/chat/media/', form); if (!cancelled && body?.signed_url) setUrl(body.signed_url); } catch { /* keep unavailable state */ } }; void run(); return () => { cancelled = true; }; }, [messageId, url]);
  return url ? <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl"><img src={url} alt={attachment.name} className="max-h-72 w-full max-w-sm object-cover" loading="lazy" /></a> : <div className="rounded-xl bg-brand-800/40 px-3 py-5 text-xs text-gray-400">Loading attachment…</div>;
}

export default function ChatPage() {
  const { selectedChatMoverId, navigate } = useNav();
  const { profile } = useAuth();
  const [mover, setMover] = useState<ChatMover | null>(null);
  const [booking, setBooking] = useState<MovingBooking | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [responding, setResponding] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduleValue, setScheduleValue] = useState<Partial<MoverScheduleValue> | undefined>();
  const [pageError, setPageError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);

  const isMover = profile?.id === mover?.user_id;
  const conversationId = profile && mover ? conversationIdForUsers(profile.id, mover.user_id) : '';
  const receiverId = isMover ? booking?.renter_id ?? null : mover?.user_id ?? null;
  const bookingStatus = normalizeStatus(booking?.status);
  const unreadNotifications = notifications.filter(item => !item.read_at).length;
  const latestSchedule = useMemo(() => scheduleEvents.filter(item => item.booking_id === booking?.id).sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())[0] ?? null, [scheduleEvents, booking?.id]);
  const blockedIntervals: MoverBlockedInterval[] = useMemo(() => scheduleEvents.filter(item => item.booking_id !== booking?.id).map(item => ({ id: item.id, starts_at: item.starts_at, ends_at: item.ends_at, status: item.status })), [scheduleEvents, booking?.id]);

  const load = useCallback(async () => {
    if (!profile || !mover || !conversationId) return;
    const bookingQuery = isMover ? `?mover_id=${encodeURIComponent(String(mover.id))}` : `?renter_id=${encodeURIComponent(String(profile.id))}&mover_id=${encodeURIComponent(String(mover.id))}`;
    const [chat, bookings, events, userNotifications] = await Promise.all([
      protectedGet<{ messages?: ChatMessage[] }>(`/api/core/chat/?conversation_id=${encodeURIComponent(conversationId)}&limit=100`),
      protectedGet<MovingBooking[]>(`/api/core/bookings/${bookingQuery}`),
      protectedGet<ScheduleEvent[]>(`/api/core/mover-schedule-events/?mover_id=${encodeURIComponent(String(mover.id))}`),
      protectedGet<{ notifications?: Notification[] }>('/api/core/notifications/?limit=50'),
    ]);
    setMessages(rows(chat?.messages)); setBooking(first(bookings)); setScheduleEvents(rows(events)); setNotifications(rows(userNotifications?.notifications));
  }, [profile, mover, conversationId, isMover]);

  useEffect(() => { if (!selectedChatMoverId) { setLoading(false); return; } let cancelled = false; const run = async () => { try { const data = await protectedGet<ChatMover>(`/api/core/movers/${encodeURIComponent(String(selectedChatMoverId))}/`); if (!cancelled) setMover(first(data)); } catch (error) { if (!cancelled) setPageError(error instanceof Error ? error.message : 'Unable to load mover chat.'); } finally { if (!cancelled) setLoading(false); } }; void run(); return () => { cancelled = true; }; }, [selectedChatMoverId]);
  useEffect(() => { if (!profile || !mover || !conversationId) return; void load().catch(error => setPageError(error instanceof Error ? error.message : 'Unable to load chat.')); }, [profile, mover, conversationId, load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  useEffect(() => {
    if (!profile || !mover || !conversationId) return;
    let cancelled = false;
    const connect = () => {
      if (cancelled) return;
      socketRef.current?.close();
      const socket = new WebSocket(getWebSocketUrl(conversationId));
      socketRef.current = socket;
      socket.onopen = () => { reconnectAttemptRef.current = 0; setSocketConnected(true); };
      socket.onmessage = event => { try { const payload = JSON.parse(event.data) as { type?: string; message?: ChatMessage }; if (payload.type === 'message' && payload.message?.conversation_id === conversationId) setMessages(prev => [...prev.filter(item => item.id !== payload.message!.id), payload.message!].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())); } catch { /* ignore malformed event */ } };
      socket.onerror = () => setSocketConnected(false);
      socket.onclose = () => { if (cancelled) return; setSocketConnected(false); const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 15000); reconnectAttemptRef.current += 1; reconnectTimerRef.current = window.setTimeout(connect, delay); };
    };
    connect();
    return () => { cancelled = true; if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current); socketRef.current?.close(); socketRef.current = null; };
  }, [profile, mover, conversationId]);

  const sendText = async () => {
    if (!receiverId || !newMessage.trim()) return;
    setSending(true); setPageError(null);
    try { const result = await protectedPost<{ message?: ChatMessage }>('/api/core/chat/', { receiver_id: receiverId, content: newMessage.trim(), message_type: 'text', event_data: null }); if (result?.message) setMessages(prev => [...prev.filter(item => item.id !== result.message!.id), result.message!].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())); setNewMessage(''); }
    catch (error) { setPageError(error instanceof Error ? error.message : 'Unable to send message.'); }
    finally { setSending(false); }
  };

  const uploadImage = async (file: File) => {
    if (!receiverId) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) { setPageError('Use a JPG, PNG, WEBP or GIF image smaller than 8 MB.'); return; }
    setUploading(true); setPageError(null);
    try { const form = new FormData(); form.append('file', file); const attachment = await protectedUpload<ChatAttachment>('/api/core/chat/media/', form); const result = await protectedPost<{ message?: ChatMessage }>('/api/core/chat/', { receiver_id: receiverId, content: attachment.name, message_type: 'image', event_data: { attachments: [attachment] } }); if (result?.message) setMessages(prev => [...prev, result.message!]); }
    catch (error) { setPageError(error instanceof Error ? error.message : 'Unable to send image.'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const respond = async (decision: 'confirm' | 'not_sure' | 'cancel') => {
    if (!booking || !isMover) return;
    setResponding(true); setPageError(null);
    try { await protectedPost(`/api/core/bookings/${booking.id}/respond/`, { decision, reason: decision === 'not_sure' ? 'The mover needs more information before confirming.' : decision === 'cancel' ? 'The mover declined the request.' : null }); await load(); }
    catch (error) { setPageError(error instanceof Error ? error.message : 'Unable to update the booking request.'); }
    finally { setResponding(false); }
  };

  const cancelBooking = async () => { if (!booking) return; setResponding(true); try { await protectedPost(`/api/core/bookings/${booking.id}/cancel/`, { reason_code: 'RENTER_CANCELLED', reason_text: 'Cancelled from chat.' }); await load(); } catch (error) { setPageError(error instanceof Error ? error.message : 'Unable to cancel booking.'); } finally { setResponding(false); } };
  const proposeSchedule = async () => { if (!booking || !scheduleValue?.date || !scheduleValue.startTime || !scheduleValue.endTime) return; try { const starts = `${scheduleValue.date}T${scheduleValue.startTime}:00+03:00`; const ends = `${scheduleValue.date}T${scheduleValue.endTime}:00+03:00`; await protectedPost(`/api/core/bookings/${booking.id}/schedule/propose/`, { starts_at: starts, ends_at: ends }); await load(); setShowScheduler(false); setScheduleValue(undefined); } catch (error) { setPageError(error instanceof Error ? error.message : 'Unable to propose schedule.'); } };
  const markNotificationRead = async (notification: Notification) => { if (notification.read_at) return; try { await protectedPatch('/api/core/notifications/', { id: notification.id }); setNotifications(prev => prev.map(item => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item)); } catch { /* notification read is non-blocking */ } };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand-600" /></div>;
  if (!mover) return <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center"><MessageCircle className="h-8 w-8" /><p className="text-sm text-gray-500">Unable to load this conversation.</p><button type="button" onClick={() => navigate('movers')} className="btn-secondary">Back to movers</button></div>;

  return <div className="min-h-screen bg-background text-foreground"><div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col">
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur"><button type="button" onClick={() => navigate(-1 as any)} className="rounded-xl p-2 hover:bg-muted" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button><div className="flex min-w-0 flex-1 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300"><Truck className="h-5 w-5" /></div><div className="min-w-0"><h1 className="truncate font-semibold">{mover.business_name || mover.driver_full_name || 'Mover'}</h1><p className="truncate text-xs text-muted-foreground">{mover.operating_city || mover.operating_county || 'Moving service'} · {socketConnected ? 'Live' : 'Reconnecting'}</p></div></div><div className="relative flex items-center gap-1"><button type="button" onClick={() => setShowNotifications(v => !v)} className="relative rounded-xl p-2 hover:bg-muted" aria-label="Notifications"><Bell className="h-5 w-5" />{unreadNotifications > 0 && <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-error-500 px-1 text-[9px] font-bold text-white">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>}</button><button type="button" onClick={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} className="rounded-xl p-2 hover:bg-muted" aria-label="Refresh"><RefreshCw className={cn('h-5 w-5', refreshing && 'animate-spin')} /></button>{showNotifications && <div className="absolute right-0 top-12 z-30 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border bg-background shadow-xl"><div className="border-b px-4 py-3"><p className="font-semibold">Notifications</p><p className="text-xs text-muted-foreground">Booking and chat updates from Django</p></div><div className="max-h-80 overflow-y-auto">{notifications.length ? notifications.map(item => <button type="button" key={item.id} onClick={() => void markNotificationRead(item)} className={cn('block w-full border-b px-4 py-3 text-left hover:bg-muted/60', !item.read_at && 'bg-brand-50/50 dark:bg-brand-900/20')}><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.message}</p><p className="mt-1 text-[10px] text-muted-foreground">{dateTime(item.created_at)}</p></button>) : <p className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications.</p>}</div></div>}</div></header>
    {pageError && <div className="mx-4 mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">{pageError}</div>}
    <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
      {booking && <div className="mb-5 rounded-2xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-800 dark:bg-brand-950/50"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Booking</p><p className="mt-1 text-sm font-semibold">{dateOnly(booking.moving_date)} · {formatKES(Number(booking.total_amount ?? booking.booking_amount ?? 0))}</p></div><span className="rounded-full bg-background px-3 py-1 text-xs font-semibold uppercase">{booking.status || 'pending'}</span></div></div>}
      <div className="space-y-4">{messages.map(message => {
        const eventBookingId = typeof message.event_data?.booking_id === 'string' ? message.event_data.booking_id : null;
        if (message.message_type === 'booking_request' || message.message_type === 'booking_response') return <div key={message.id} className={cn('flex', message.sender_id === profile?.id ? 'justify-end' : 'justify-start')}><ChatBookingCard message={message} booking={eventBookingId && booking?.id === eventBookingId ? booking : booking} isMover={isMover} responding={responding} onRespond={respond} onCancel={cancelBooking} onSchedule={() => setShowScheduler(true)} /></div>;
        const raw = message.event_data?.attachments; const attachment = Array.isArray(raw) && raw[0] && typeof raw[0] === 'object' ? raw[0] as ChatAttachment : null;
        return <div key={message.id} className={cn('flex', message.sender_id === profile?.id ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[85%] rounded-2xl px-4 py-3 shadow-sm', message.sender_id === profile?.id ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
          {attachment ? <ChatImage messageId={message.id} attachment={attachment} /> : <p className="whitespace-pre-wrap text-sm">{message.content}</p>}
          <p className="mt-1 text-[10px] opacity-60">{dateTime(message.created_at)}</p>
        </div></div>;
      })}<div ref={endRef} /></div>
      {latestSchedule && <div className="mx-auto mt-5 max-w-xl rounded-2xl border border-success-200 bg-success-50 p-4 dark:border-success-800 dark:bg-success-900/20"><div className="flex items-center gap-2 text-success-800 dark:text-success-300"><CalendarDays className="h-5 w-5" /><p className="font-semibold">Moving schedule</p></div><p className="mt-2 text-sm text-success-800/80 dark:text-success-300/80">{dateTime(latestSchedule.starts_at)} – {dateTime(latestSchedule.ends_at)}</p></div>}
      {showScheduler && !isMover && bookingStatus === 'confirmed' && <div className="mx-auto mt-5 max-w-xl rounded-2xl border bg-background p-4"><MoverSchedulePicker value={scheduleValue} onChange={setScheduleValue} blockedIntervals={blockedIntervals} /><div className="mt-3 flex gap-2"><button type="button" onClick={() => setShowScheduler(false)} className="btn-secondary flex-1">Cancel</button><button type="button" onClick={() => void proposeSchedule()} disabled={!scheduleValue?.date || !scheduleValue.startTime || !scheduleValue.endTime} className="btn-primary flex-1">Propose time</button></div></div>}
    </main>
    <footer className="sticky bottom-0 border-t bg-background/95 p-3 backdrop-blur"><div className="mx-auto max-w-4xl"><input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void uploadImage(file); }} /><div className="flex items-end gap-2"><button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || sending} className="rounded-xl p-2 hover:bg-muted" aria-label="Attach image"><Paperclip className="h-5 w-5" /></button><textarea value={newMessage} onChange={event => setNewMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendText(); } }} rows={1} placeholder="Message your mover…" className="min-h-10 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/30" /><button type="button" onClick={() => void sendText()} disabled={sending || !newMessage.trim()} className="rounded-xl bg-primary p-2 text-primary-foreground disabled:opacity-50" aria-label="Send message"><Send className="h-5 w-5" /></button></div></div></footer>
  </div></div>;
}
