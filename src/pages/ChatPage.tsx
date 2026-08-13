import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, ArrowLeft, Calendar, Clock, MapPin, Navigation, DollarSign,
  CheckCircle2, XCircle, Loader2, CreditCard, ShieldCheck, AlertCircle,
  MessageCircle, Truck
} from 'lucide-react';
import { useNav } from '@/context/NavContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  formatKES, formatTime, getDayOfWeek, isMoverAvailable,
  COMMISSION_RATE, cn
} from '@/lib/utils';
import type { ChatMessage, Mover, BookingEvent, BookingEventData } from '@/lib/supabase';

function getConversationId(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join('__');
}

export default function ChatPage() {
  const { selectedChatMoverId, navigate } = useNav();
  const { profile } = useAuth();
  const [mover, setMover] = useState<Mover | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [activeBookingEvent, setActiveBookingEvent] = useState<BookingEvent | null>(null);
  const [paying, setPaying] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scheduler form state
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [schedPickup, setSchedPickup] = useState('');
  const [schedDropoff, setSchedDropoff] = useState('');
  const [schedPrice, setSchedPrice] = useState('');
  const [schedError, setSchedError] = useState<string | null>(null);
  const [submittingEvent, setSubmittingEvent] = useState(false);

  const conversationId = profile && mover ? getConversationId(profile.id, mover.user_id) : '';

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load mover profile
  useEffect(() => {
    if (!selectedChatMoverId) return;
    const loadMover = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('movers')
        .select('*')
        .eq('id', selectedChatMoverId)
        .maybeSingle();
      if (data) setMover(data as Mover);
      setLoading(false);
    };
    loadMover();
  }, [selectedChatMoverId]);

  // Load messages + subscribe to realtime
  useEffect(() => {
    if (!profile || !mover) return;
    const convId = getConversationId(profile.id, mover.user_id);

    const loadMessages = async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });
      if (data) setMessages(data as ChatMessage[]);

      // Restore draft from localStorage
      const savedDraft = localStorage.getItem(`draft_${convId}`);
      if (savedDraft) setDraft(savedDraft);
    };
    loadMessages();

    const channel = supabase
      .channel(`chat_${convId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${convId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${convId}` },
        (payload) => {
          setMessages((prev) => prev.map((m) => m.id === (payload.new as ChatMessage).id ? payload.new as ChatMessage : m));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, mover]);

  // Load active booking event
  useEffect(() => {
    if (!profile || !mover) return;
    const convId = getConversationId(profile.id, mover.user_id);
    const loadBookingEvent = async () => {
      const { data } = await supabase
        .from('booking_events')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setActiveBookingEvent(data as BookingEvent);
    };
    loadBookingEvent();
  }, [profile, mover, messages]);

  // Save draft to localStorage on change
  useEffect(() => {
    if (conversationId && draft) {
      localStorage.setItem(`draft_${conversationId}`, draft);
    }
  }, [draft, conversationId]);

  const handleSend = async () => {
    if (!profile || !mover || !newMessage.trim()) return;
    setSending(true);
    const convId = getConversationId(profile.id, mover.user_id);
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: convId,
        sender_id: profile.id,
        receiver_id: mover.user_id,
        content: newMessage.trim(),
        message_type: 'text',
      })
      .select('*')
      .single();
    if (!error && data) {
      setMessages((prev) => [...prev, data as ChatMessage]);
      setNewMessage('');
    }
    setSending(false);
  };

  const handleSchedule = async () => {
    setSchedError(null);
    if (!profile || !mover) return;
    if (!schedDate || !schedTime || !schedPickup.trim() || !schedDropoff.trim() || !schedPrice) {
      setSchedError('Please fill in all scheduling fields.');
      return;
    }

    const day = getDayOfWeek(schedDate);
    const availability = isMoverAvailable(
      mover.working_days || [],
      mover.start_time || '08:00',
      mover.end_time || '18:00',
      schedDate,
      schedTime
    );

    if (!availability.valid) {
      setSchedError(availability.reason || 'Driver is not available at the requested time.');
      return;
    }

    setSubmittingEvent(true);
    const convId = getConversationId(profile.id, mover.user_id);
    const price = Number(schedPrice);
    const commission = price * COMMISSION_RATE;
    const total = price + commission;

    const eventData: BookingEventData = {
      relocation_date: schedDate,
      day_of_week: day,
      pickup_time: schedTime,
      pickup_address: schedPickup,
      dropoff_address: schedDropoff,
      negotiated_price: price,
    };

    try {
      // Create booking event
      const { data: bookingData, error: bookingError } = await supabase
        .from('booking_events')
        .insert({
          conversation_id: convId,
          renter_id: profile.id,
          mover_id: mover.user_id,
          mover_profile_id: mover.id,
          relocation_date: schedDate,
          day_of_week: day,
          pickup_time: schedTime,
          pickup_address: schedPickup,
          dropoff_address: schedDropoff,
          negotiated_price: price,
          commission_amount: commission,
          total_amount: total,
          status: 'pending',
        })
        .select('*')
        .single();

      if (bookingError) throw bookingError;

      // Send event request message in chat
      const { data: msgData } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: convId,
          sender_id: profile.id,
          receiver_id: mover.user_id,
          content: 'Booking Event Request',
          message_type: 'event_request',
          event_data: eventData,
        })
        .select('*')
        .single();

      if (msgData) setMessages((prev) => [...prev, msgData as ChatMessage]);
      if (bookingData) setActiveBookingEvent(bookingData as BookingEvent);
      setShowScheduler(false);
      setSchedDate('');
      setSchedTime('');
      setSchedPickup('');
      setSchedDropoff('');
      setSchedPrice('');
    } catch (err) {
      setSchedError(err instanceof Error ? err.message : 'Failed to create booking event.');
    } finally {
      setSubmittingEvent(false);
    }
  };

  const handleConfirmEvent = async (eventId: string) => {
    if (!profile || !mover) return;
    const convId = getConversationId(profile.id, mover.user_id);
    const { data } = await supabase
      .from('booking_events')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', eventId)
      .select('*')
      .single();
    if (data) setActiveBookingEvent(data as BookingEvent);

    // Send confirmation message
    await supabase.from('chat_messages').insert({
      conversation_id: convId,
      sender_id: mover.user_id,
      receiver_id: profile.id,
      content: 'Event Confirmed! The renter can now proceed to payment.',
      message_type: 'event_confirmed',
    });
  };

  const handleDeclineEvent = async (eventId: string) => {
    if (!profile || !mover) return;
    const convId = getConversationId(profile.id, mover.user_id);
    const { data } = await supabase
      .from('booking_events')
      .update({ status: 'declined' })
      .eq('id', eventId)
      .select('*')
      .single();
    if (data) setActiveBookingEvent(data as BookingEvent);

    await supabase.from('chat_messages').insert({
      conversation_id: convId,
      sender_id: mover.user_id,
      receiver_id: profile.id,
      content: 'Event Declined. Please propose a new time.',
      message_type: 'event_declined',
    });
  };

  const handlePay = async () => {
    if (!activeBookingEvent) return;
    setPaying(true);
    const { data } = await supabase
      .from('booking_events')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', activeBookingEvent.id)
      .select('*')
      .single();
    if (data) setActiveBookingEvent(data as BookingEvent);
    setPaying(false);
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
        <MessageCircle className="mx-auto h-12 w-12 text-gray-300" />
        <p className="mt-4 text-gray-500 dark:text-gray-400">Chat not found.</p>
        <button onClick={() => navigate('movers')} className="btn-primary mt-4">Browse Movers</button>
      </div>
    );
  }

  const isMover = profile?.id === mover.user_id;

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
      {/* Chat Header */}
      <div className="card mb-4 flex items-center gap-3 p-4">
        <button onClick={() => navigate('mover-detail', mover.id)} className="text-gray-400 hover:text-brand-600">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent-400 to-accent-600 text-white">
          <Truck className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">{mover.business_name || mover.driver_full_name}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {mover.operating_city} · {mover.working_days?.length || 7} days/week · {formatTime(mover.start_time)} - {formatTime(mover.end_time)}
          </p>
        </div>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-xs font-medium',
          mover.is_available ? 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400' : 'bg-gray-100 text-gray-500 dark:bg-brand-800 dark:text-gray-400'
        )}>
          {mover.is_available ? 'Available' : 'Busy'}
        </span>
      </div>

      {/* Messages */}
      <div className="card mb-4 h-[400px] overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageCircle className="h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Start negotiating with {mover.driver_full_name}. Discuss pickup logistics, pricing, and details.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              const isOwn = msg.sender_id === profile?.id;
              const eventData = msg.event_data as BookingEventData | null;

              if (msg.message_type === 'event_request' && eventData) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="max-w-md rounded-xl border-2 border-brand-300 bg-brand-50 p-4 dark:border-brand-600 dark:bg-brand-800/40">
                      <div className="mb-2 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                        <span className="text-sm font-bold text-brand-700 dark:text-brand-300">Booking Event Request</span>
                      </div>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{eventData.relocation_date} ({eventData.day_of_week})</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{formatTime(eventData.pickup_time)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Navigation className="h-3.5 w-3.5" />
                          <span>{eventData.pickup_address}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>{eventData.dropoff_address}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <DollarSign className="h-3.5 w-3.5" />
                          <span className="font-semibold">{formatKES(eventData.negotiated_price)}</span>
                          <span className="text-xs">+ {COMMISSION_RATE * 100}% commission = {formatKES(eventData.negotiated_price * (1 + COMMISSION_RATE))}</span>
                        </div>
                      </div>
                      {isMover && activeBookingEvent?.status === 'pending' && (
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => handleConfirmEvent(activeBookingEvent.id)}
                            className="flex-1 rounded-full bg-success-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-success-700"
                          >
                            <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> Confirm & Accept
                          </button>
                          <button
                            onClick={() => handleDeclineEvent(activeBookingEvent.id)}
                            className="flex-1 rounded-full bg-error-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-error-600"
                          >
                            <XCircle className="mr-1 inline h-3.5 w-3.5" /> Decline
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              if (msg.message_type === 'event_confirmed') {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="rounded-full bg-success-50 px-4 py-2 text-sm text-success-700 dark:bg-success-900/30 dark:text-success-400">
                      <CheckCircle2 className="mr-1 inline h-4 w-4" /> {msg.content}
                    </div>
                  </div>
                );
              }

              if (msg.message_type === 'event_declined') {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="rounded-full bg-error-50 px-4 py-2 text-sm text-error-700 dark:bg-error-900/30 dark:text-error-400">
                      <XCircle className="mr-1 inline h-4 w-4" /> {msg.content}
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[75%] rounded-2xl px-4 py-2 text-sm',
                    isOwn
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 text-gray-800 dark:bg-brand-800 dark:text-gray-200'
                  )}>
                    <p>{msg.content}</p>
                    <p className={cn('mt-0.5 text-xs', isOwn ? 'text-brand-200' : 'text-gray-400')}>
                      {new Date(msg.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Payment Section (visible to renter after mover confirms) */}
      {!isMover && activeBookingEvent?.status === 'confirmed' && (
        <div className="card mb-4 border-2 border-success-300 p-4 dark:border-success-600">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-success-600" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Event Confirmed — Pay Securely</h3>
          </div>
          <div className="mb-3 rounded-full bg-gray-50 p-3 text-sm dark:bg-brand-800/30">
            <div className="flex justify-between py-0.5">
              <span className="text-gray-500 dark:text-gray-400">Service Amount</span>
              <span className="font-semibold">{formatKES(activeBookingEvent.negotiated_price)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-gray-500 dark:text-gray-400">Platform Commission (10%)</span>
              <span className="font-semibold text-brand-600 dark:text-brand-400">{formatKES(activeBookingEvent.commission_amount)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 dark:border-brand-700">
              <span className="font-bold">Total</span>
              <span className="font-bold text-brand-600 dark:text-brand-400">{formatKES(activeBookingEvent.total_amount)}</span>
            </div>
          </div>
          <button onClick={handlePay} disabled={paying} className="btn-primary w-full">
            {paying ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</> : <><CreditCard className="h-4 w-4" /> Pay via Saka Krib Platform</>}
          </button>
        </div>
      )}

      {/* Payment confirmed */}
      {!isMover && activeBookingEvent?.status === 'paid' && (
        <div className="card mb-4 border-2 border-success-300 p-4 text-center dark:border-success-600">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success-600" />
          <h3 className="mt-2 text-sm font-bold text-gray-900 dark:text-white">Payment Complete!</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Your booking is confirmed for {activeBookingEvent.relocation_date} at {formatTime(activeBookingEvent.pickup_time)}.
          </p>
        </div>
      )}

      {/* Scheduler Panel */}
      {showScheduler && !isMover && (
        <div className="card mb-4 border-2 border-brand-300 p-4 dark:border-brand-600">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
            <Calendar className="h-4 w-4 text-brand-600" /> Schedule Relocation Event
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Relocation Date</label>
              <input type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} className="input-field text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Pickup Time</label>
              <input type="time" value={schedTime} onChange={(e) => setSchedTime(e.target.value)} className="input-field text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Pickup Address</label>
              <input type="text" value={schedPickup} onChange={(e) => setSchedPickup(e.target.value)} placeholder="Current location" className="input-field text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Drop-off Address</label>
              <input type="text" value={schedDropoff} onChange={(e) => setSchedDropoff(e.target.value)} placeholder="Destination" className="input-field text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Negotiated Price (KES)</label>
              <input type="number" value={schedPrice} onChange={(e) => setSchedPrice(e.target.value)} placeholder="e.g. 5000" className="input-field text-sm" min={0} />
            </div>
          </div>
          {schedError && (
            <div className="mt-3 flex items-start gap-2 rounded-full bg-error-50 px-3 py-2 text-xs text-error-700 dark:bg-error-900/20 dark:text-error-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {schedError}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button onClick={handleSchedule} disabled={submittingEvent} className="btn-primary flex-1 text-sm">
              {submittingEvent ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</> : 'Send Event Request'}
            </button>
            <button onClick={() => setShowScheduler(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Message Input */}
      <div className="card p-3">
        {/* Draft indicator */}
        {draft && draft !== newMessage && (
          <p className="mb-1.5 text-xs text-gray-400">
            Draft saved: "{draft.slice(0, 40)}{draft.length > 40 ? '...' : ''}"
          </p>
        )}
        <div className="flex gap-2">
          {!isMover && (
            <button
              onClick={() => setShowScheduler(!showScheduler)}
              className={cn(
                'rounded-full p-2.5 transition-colors',
                showScheduler ? 'bg-brand-100 text-brand-600 dark:bg-brand-800 dark:text-brand-400' : 'text-gray-400 hover:text-brand-600'
              )}
              title="Schedule relocation"
            >
              <Calendar className="h-5 w-5" />
            </button>
          )}
          <input
            type="text"
            value={newMessage}
            onChange={(e) => { setNewMessage(e.target.value); setDraft(e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !sending) handleSend(); }}
            placeholder="Type a message..."
            className="input-field flex-1"
          />
          <button onClick={handleSend} disabled={!newMessage.trim() || sending} className="btn-primary">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-gray-400">© Copyright Saka Krib. All Rights Reserved.</p>
    </div>
  );
}
