import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Loader2, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { moverApi, type MoverBooking, type MoverChatMessage } from '@/lib/Movers';

function conversationId(userA: string, userB: string) {
  return [userA, userB].sort().join('__');
}

function messageText(message: MoverChatMessage) {
  return typeof message.content === 'string' ? message.content : '';
}

function messageId(message: MoverChatMessage) {
  return typeof message.id === 'string' || typeof message.id === 'number' ? String(message.id) : '';
}

function messageSender(message: MoverChatMessage) {
  return typeof message.sender_id === 'string' ? message.sender_id : '';
}

function messageCreatedAt(message: MoverChatMessage) {
  return typeof message.created_at === 'string' ? message.created_at : '';
}

function formatMessageTime(value: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function MoverMessages() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [bookings, setBookings] = useState<MoverBooking[]>([]);
  const [selectedRenterId, setSelectedRenterId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MoverChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    if (!profile?.id || profile.role !== 'mover') { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const rows = await moverApi.getBookings();
      setBookings(rows ?? []);
      setSelectedRenterId(previous => previous && rows.some(row => row.renter_id === previous) ? previous : rows.find(row => row.renter_id)?.renter_id ?? null);
    } catch (err) {
      console.error('Failed to load mover conversations:', err);
      setError(err instanceof Error ? err.message : 'Unable to load customer conversations.');
    } finally { setLoading(false); }
  }, [profile?.id, profile?.role]);

  const customers = useMemo(() => {
    const unique = new Map<string, MoverBooking>();
    [...bookings]
      .filter(booking => Boolean(booking.renter_id))
      .sort((a, b) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime())
      .forEach(booking => { if (!unique.has(booking.renter_id)) unique.set(booking.renter_id, booking); });
    return [...unique.entries()];
  }, [bookings]);

  const selectedBooking = customers.find(([renterId]) => renterId === selectedRenterId)?.[1] ?? null;
  const activeConversationId = profile?.id && selectedRenterId ? conversationId(profile.id, selectedRenterId) : '';

  const loadConversation = useCallback(async () => {
    if (!activeConversationId) { setMessages([]); return; }
    setChatLoading(true);
    try {
      const response = await moverApi.getConversation(activeConversationId, 100);
      setMessages(response.messages ?? []);
      setError(null);
    } catch (err) {
      console.error('Failed to load mover conversation:', err);
      setError(err instanceof Error ? err.message : 'Unable to load conversation.');
    } finally { setChatLoading(false); }
  }, [activeConversationId]);

  useEffect(() => { void loadBookings(); }, [loadBookings]);
  useEffect(() => { void loadConversation(); }, [loadConversation]);
  useEffect(() => {
    if (!activeConversationId) return;
    const timer = window.setInterval(() => { void loadConversation(); }, 5000);
    return () => window.clearInterval(timer);
  }, [activeConversationId, loadConversation]);

  const sendText = useCallback(async () => {
    const content = newMessage.trim();
    if (!profile?.id || !selectedRenterId || !content || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await moverApi.sendMessage(selectedRenterId, content);
      if (response.message) {
        setMessages(previous => [...previous.filter(item => messageId(item) !== messageId(response.message)), response.message]);
      }
      setNewMessage('');
    } catch (err) {
      console.error('Failed to send mover message:', err);
      setError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally { setSending(false); }
  }, [newMessage, profile?.id, selectedRenterId, sending]);

  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-brand-500" /></div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to dashboard</button>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Mover messages</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Communicate directly with renters linked to your bookings.</p>
        </div>
        <button type="button" onClick={() => { void loadBookings(); void loadConversation(); }} className="btn-secondary inline-flex items-center gap-2 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      {customers.length === 0 ? (
        <div className="card p-10 text-center"><MessageCircle className="mx-auto h-10 w-10 text-brand-500" /><h2 className="mt-3 font-bold text-gray-900 dark:text-white">No customer conversations yet</h2><p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">Once a renter books your moving service, their conversation will appear here.</p></div>
      ) : (
        <div className="card grid min-h-[560px] overflow-hidden md:grid-cols-[280px_1fr]">
          <aside className="border-b border-gray-100 dark:border-brand-800 md:border-b-0 md:border-r">
            <div className="border-b border-gray-100 p-4 dark:border-brand-800"><p className="font-bold text-gray-900 dark:text-white">Customers</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{customers.length} conversation{customers.length === 1 ? '' : 's'}</p></div>
            <div className="max-h-[500px] divide-y divide-gray-100 overflow-y-auto dark:divide-brand-800">
              {customers.map(([renterId, booking]) => (
                <button key={renterId} type="button" onClick={() => setSelectedRenterId(renterId)} className={`flex w-full items-center gap-3 p-4 text-left ${selectedRenterId === renterId ? 'bg-brand-50 dark:bg-brand-900/40' : 'hover:bg-gray-50 dark:hover:bg-brand-900/20'}`}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700 dark:bg-brand-800/60 dark:text-brand-300">{renterId.slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold text-gray-900 dark:text-white">Renter</p><p className="truncate text-xs text-gray-500 dark:text-gray-400">Booking {booking.id}</p></div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
                </button>
              ))}
            </div>
          </aside>

          <section className="flex min-h-[560px] flex-col">
            {!selectedRenterId ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-gray-500 dark:text-gray-400">Select a customer to open the conversation.</div>
            ) : (
              <>
                <header className="border-b border-gray-100 p-4 dark:border-brand-800">
                  <p className="font-bold text-gray-900 dark:text-white">Renter conversation</p>
                  {selectedBooking && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Booking {selectedBooking.id} · {selectedBooking.pickup_address} → {selectedBooking.dropoff_address}</p>}
                </header>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {chatLoading && messages.length === 0 ? <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-500" /></div> : messages.length === 0 ? <div className="flex h-full items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">No messages yet. Start the conversation with the renter.</div> : messages.map((message, index) => {
                    const mine = messageSender(message) === profile?.id;
                    return <div key={messageId(message) || `message-${index}`} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${mine ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-900 dark:bg-brand-900 dark:text-white'}`}><p className="whitespace-pre-wrap break-words">{messageText(message)}</p><p className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>{formatMessageTime(messageCreatedAt(message))}</p></div></div>;
                  })}
                </div>
                <form onSubmit={event => { event.preventDefault(); void sendText(); }} className="border-t border-gray-100 p-3 dark:border-brand-800">
                  <div className="flex items-end gap-2">
                    <textarea value={newMessage} onChange={event => setNewMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendText(); } }} rows={2} placeholder="Write a message…" className="min-h-[48px] flex-1 resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-brand-700 dark:bg-brand-950 dark:text-white" />
                    <button type="submit" disabled={!newMessage.trim() || sending} className="btn-primary inline-flex h-11 shrink-0 items-center gap-2 px-4 disabled:cursor-not-allowed disabled:opacity-50">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send</button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
