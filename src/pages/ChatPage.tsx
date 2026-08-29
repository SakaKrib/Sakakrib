import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Navigation,
  DollarSign,
  CheckCircle2,
  XCircle,
  Loader2,
  CreditCard,
  ShieldCheck,
  AlertCircle,
  MessageCircle,
  Truck,
} from 'lucide-react';
import { useNav } from '@/context/NavContext';
import { useAuth } from '@/context/AuthContext';
import {
  protectedGet,
  protectedPost,
  protectedPatch,
} from '@/lib/protectedApi';
import {
  formatKES,
  formatTime,
  getDayOfWeek,
  isMoverAvailable,
  COMMISSION_RATE,
  cn,
} from '@/lib/utils';

/* ============================================================
 * TYPES
 * ============================================================ */

interface ChatMover {
  id: string;
  user_id: string;
  driver_full_name: string | null;
  business_name: string | null;
  phone: string | null;
  vehicle_type: string | null;
  number_plate: string | null;
  operating_city: string | null;
  operating_county: string | null;
  base_rate_kes: number | null;
  rate_per_km_kes: number | null;
  approval_status: string | null;
  is_available: boolean | null;
  working_days: string[] | null;
  start_time: string | null;
  end_time: string | null;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  message_type: string | null;
  event_data: BookingEventData | null;
  created_at: string;
  updated_at?: string | null;
}

interface BookingEventData {
  relocation_date: string;
  day_of_week: string;
  pickup_time: string;
  pickup_address: string;
  dropoff_address: string;
  negotiated_price: number;
}

interface BookingEvent {
  id: string;
  conversation_id: string;
  renter_id: string;
  mover_id: string;
  mover_profile_id: string;
  relocation_date: string;
  day_of_week: string;
  pickup_time: string;
  pickup_address: string;
  dropoff_address: string;
  negotiated_price: number;
  commission_amount: number | null;
  total_amount: number | null;
  status: string;
  confirmed_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string | null;
}

/* ============================================================
 * HELPERS
 * ============================================================ */

function getConversationId(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join('__');
}

function normalizeRows<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function getFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/* ============================================================
 * COMPONENT
 * ============================================================ */

export default function ChatPage() {
  const { selectedChatMoverId, navigate } = useNav();
  const { profile } = useAuth();

  const [mover, setMover] = useState<ChatMover | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [activeBookingEvent, setActiveBookingEvent] = useState<BookingEvent | null>(null);
  const [paying, setPaying] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [schedError, setSchedError] = useState<string | null>(null);
  const [submittingEvent, setSubmittingEvent] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [schedPickup, setSchedPickup] = useState('');
  const [schedDropoff, setSchedDropoff] = useState('');
  const [schedPrice, setSchedPrice] = useState('');

  const conversationId =
    profile && mover ? getConversationId(profile.id, mover.user_id) : '';

  const isMover = profile?.id === mover?.user_id;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  /* ==========================================================
   * LOAD MOVER
   * ========================================================== */

  const loadMover = useCallback(async () => {
    if (!selectedChatMoverId) {
      setMover(null);
      return;
    }

    const rows = await protectedGet<ChatMover[]>(
      `/rest/v1/movers?select=*&id=eq.${encodeURIComponent(selectedChatMoverId)}&limit=1`,
    );

    setMover(getFirst(rows));
  }, [selectedChatMoverId]);

  /* ==========================================================
   * LOAD CHAT
   * ========================================================== */

  const loadChat = useCallback(async () => {
    if (!profile || !mover) return;

    const convId = getConversationId(profile.id, mover.user_id);

    const [messageRows, eventRows] = await Promise.all([
      protectedGet<ChatMessage[]>(
        `/rest/v1/chat_messages?select=*&conversation_id=eq.${encodeURIComponent(convId)}&order=created_at.asc`,
      ),
      protectedGet<BookingEvent[]>(
        `/rest/v1/booking_events?select=*&conversation_id=eq.${encodeURIComponent(convId)}&order=created_at.desc&limit=1`,
      ),
    ]);

    setMessages(normalizeRows(messageRows ?? []));
    setActiveBookingEvent(getFirst(eventRows));

    const savedDraft = localStorage.getItem(`draft_${convId}`);
    setDraft(savedDraft ?? '');
  }, [profile, mover]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setPageError(null);

    try {
      await loadMover();
    } catch (error) {
      console.error('Failed to load mover chat:', error);
      setPageError(getErrorMessage(error, 'Unable to load mover chat.'));
      setMover(null);
    } finally {
      setLoading(false);
    }
  }, [loadMover]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!profile || !mover) return;

    void loadChat().catch((error) => {
      console.error('Failed to load chat:', error);
      setPageError(getErrorMessage(error, 'Unable to load chat messages.'));
    });
  }, [profile, mover, loadChat]);

  /* ==========================================================
   * POLLING
   *
   * HttpOnly authentication means the browser Supabase client
   * must not be used as the application's authenticated realtime
   * client. Poll the protected endpoint until a dedicated server
   * realtime gateway is introduced.
   * ========================================================== */

  useEffect(() => {
    if (!profile || !mover) return;

    const interval = window.setInterval(() => {
      void loadChat().catch((error) => {
        console.error('Chat refresh failed:', error);
      });
    }, 15_000);

    return () => window.clearInterval(interval);
  }, [profile, mover, loadChat]);

  /* ==========================================================
   * SAVE DRAFT
   * ========================================================== */

  useEffect(() => {
    if (!conversationId) return;

    if (draft) {
      localStorage.setItem(`draft_${conversationId}`, draft);
    } else {
      localStorage.removeItem(`draft_${conversationId}`);
    }
  }, [draft, conversationId]);

  /* ==========================================================
   * SEND MESSAGE
   * ========================================================== */

  const handleSend = async () => {
    if (!profile || !mover || !newMessage.trim()) return;

    setSending(true);
    setPageError(null);

    try {
      const convId = getConversationId(profile.id, mover.user_id);

      const created = await protectedPost<ChatMessage | ChatMessage[]>(
        '/rest/v1/chat_messages',
        {
          conversation_id: convId,
          sender_id: profile.id,
          receiver_id: mover.user_id,
          content: newMessage.trim(),
          message_type: 'text',
        },
        {
          headers: {
            Prefer: 'return=representation',
          },
        },
      );

      const message = getFirst(created);
      if (message) {
        setMessages((previous) => {
          if (previous.some((item) => item.id === message.id)) return previous;
          return [...previous, message];
        });
      }

      setNewMessage('');
      setDraft('');
    } catch (error) {
      console.error('Failed to send message:', error);
      setPageError(getErrorMessage(error, 'Unable to send message.'));
    } finally {
      setSending(false);
    }
  };

  /* ==========================================================
   * CREATE BOOKING EVENT
   * ========================================================== */

  const handleSchedule = async () => {
    setSchedError(null);

    if (!profile || !mover) return;

    if (
      !schedDate ||
      !schedTime ||
      !schedPickup.trim() ||
      !schedDropoff.trim() ||
      !schedPrice
    ) {
      setSchedError('Please fill in all scheduling fields.');
      return;
    }

    const price = Number(schedPrice);

    if (!Number.isFinite(price) || price <= 0) {
      setSchedError('Enter a valid negotiated price greater than zero.');
      return;
    }

    const day = getDayOfWeek(schedDate);
    const availability = isMoverAvailable(
      mover.working_days || [],
      mover.start_time || '08:00',
      mover.end_time || '18:00',
      schedDate,
      schedTime,
    );

    if (!availability.valid) {
      setSchedError(
        availability.reason ||
          'Mover is not available at the requested time.',
      );
      return;
    }

    setSubmittingEvent(true);

    try {
      const convId = getConversationId(profile.id, mover.user_id);
      const commission = price * COMMISSION_RATE;
      const total = price + commission;

      const eventData: BookingEventData = {
        relocation_date: schedDate,
        day_of_week: day,
        pickup_time: schedTime,
        pickup_address: schedPickup.trim(),
        dropoff_address: schedDropoff.trim(),
        negotiated_price: price,
      };

      const createdEvent = await protectedPost<BookingEvent | BookingEvent[]>(
        '/rest/v1/booking_events',
        {
          conversation_id: convId,
          renter_id: profile.id,
          mover_id: mover.user_id,
          mover_profile_id: mover.id,
          relocation_date: schedDate,
          day_of_week: day,
          pickup_time: schedTime,
          pickup_address: schedPickup.trim(),
          dropoff_address: schedDropoff.trim(),
          negotiated_price: price,
          commission_amount: commission,
          total_amount: total,
          status: 'pending',
        },
        {
          headers: {
            Prefer: 'return=representation',
          },
        },
      );

      const bookingEvent = getFirst(createdEvent);

      const createdMessage = await protectedPost<ChatMessage | ChatMessage[]>(
        '/rest/v1/chat_messages',
        {
          conversation_id: convId,
          sender_id: profile.id,
          receiver_id: mover.user_id,
          content: 'Booking Event Request',
          message_type: 'event_request',
          event_data: eventData,
        },
        {
          headers: {
            Prefer: 'return=representation',
          },
        },
      );

      const message = getFirst(createdMessage);
      if (message) {
        setMessages((previous) => {
          if (previous.some((item) => item.id === message.id)) return previous;
          return [...previous, message];
        });
      }

      if (bookingEvent) setActiveBookingEvent(bookingEvent);

      setShowScheduler(false);
      setSchedDate('');
      setSchedTime('');
      setSchedPickup('');
      setSchedDropoff('');
      setSchedPrice('');
    } catch (error) {
      console.error('Failed to create booking event:', error);
      setSchedError(
        getErrorMessage(error, 'Failed to create booking event.'),
      );
    } finally {
      setSubmittingEvent(false);
    }
  };

  /* ==========================================================
   * MOVER CONFIRMS EVENT
   * ========================================================== */

  const handleConfirmEvent = async (eventId: string) => {
    if (!profile || !mover || !isMover) return;

    setPageError(null);

    try {
      const updated = await protectedPatch<BookingEvent | BookingEvent[]>(
        `/rest/v1/booking_events?id=eq.${encodeURIComponent(eventId)}`,
        {
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
        },
        {
          headers: {
            Prefer: 'return=representation',
          },
        },
      );

      const event = getFirst(updated);
      if (event) setActiveBookingEvent(event);

      await protectedPost<ChatMessage | ChatMessage[]>(
        '/rest/v1/chat_messages',
        {
          conversation_id: getConversationId(profile.id, mover.user_id),
          sender_id: profile.id,
          receiver_id: mover.user_id === profile.id ? event?.renter_id : mover.user_id,
          content: 'Event Confirmed! The renter can now proceed to payment.',
          message_type: 'event_confirmed',
        },
        {
          headers: {
            Prefer: 'return=minimal',
          },
        },
      );
    } catch (error) {
      console.error('Failed to confirm booking event:', error);
      setPageError(getErrorMessage(error, 'Unable to confirm booking event.'));
    }
  };

  /* ==========================================================
   * MOVER DECLINES EVENT
   * ========================================================== */

  const handleDeclineEvent = async (eventId: string) => {
    if (!profile || !mover || !isMover) return;

    setPageError(null);

    try {
      const updated = await protectedPatch<BookingEvent | BookingEvent[]>(
        `/rest/v1/booking_events?id=eq.${encodeURIComponent(eventId)}`,
        { status: 'declined' },
        {
          headers: {
            Prefer: 'return=representation',
          },
        },
      );

      const event = getFirst(updated);
      if (event) setActiveBookingEvent(event);

      await protectedPost<ChatMessage | ChatMessage[]>(
        '/rest/v1/chat_messages',
        {
          conversation_id: getConversationId(profile.id, mover.user_id),
          sender_id: profile.id,
          receiver_id: event?.renter_id ?? '',
          content: 'Event Declined. Please propose a new time.',
          message_type: 'event_declined',
        },
        {
          headers: {
            Prefer: 'return=minimal',
          },
        },
      );
    } catch (error) {
      console.error('Failed to decline booking event:', error);
      setPageError(getErrorMessage(error, 'Unable to decline booking event.'));
    }
  };

  /* ==========================================================
   * PAYMENT
   *
   * Do not mark an event paid from the browser. Payment must be
   * confirmed by the payment gateway/backend before the event
   * becomes paid.
   * ========================================================== */

  const handlePay = () => {
    if (!activeBookingEvent) return;

    navigate('renter-payment', activeBookingEvent.id);
  };

  /* ==========================================================
   * MANUAL REFRESH
   * ========================================================== */

  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      await loadChat();
    } catch (error) {
      console.error('Failed to refresh chat:', error);
      setPageError(getErrorMessage(error, 'Unable to refresh chat.'));
    } finally {
      setRefreshing(false);
    }
  };

  /* ==========================================================
   * LOADING / ERROR
   * ========================================================== */

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (pageError && !mover) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="card p-6 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-error-500" />
          <h1 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">
            Unable to load chat
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {pageError}
          </p>
          <button
            type="button"
            onClick={() => void loadPage()}
            className="btn-primary mt-4"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!mover) {
    return (
      <div className="py-20 text-center">
        <MessageCircle className="mx-auto h-12 w-12 text-gray-300" />
        <p className="mt-4 text-gray-500 dark:text-gray-400">
          Chat not found.
        </p>
        <button
          type="button"
          onClick={() => navigate('movers')}
          className="btn-primary mt-4"
        >
          Browse Movers
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
      {/* Chat Header */}
      <div className="card mb-4 flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => navigate('mover-detail', mover.id)}
          className="text-gray-400 hover:text-brand-600"
          aria-label="Back to mover"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent-400 to-accent-600 text-white">
          <Truck className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-gray-900 dark:text-white">
            {mover.business_name || mover.driver_full_name || 'Mover'}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {mover.operating_city || '—'} · {mover.working_days?.length || 7} days/week ·{' '}
            {formatTime(mover.start_time)} - {formatTime(mover.end_time)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="rounded-full p-2 text-gray-400 hover:text-brand-600 disabled:opacity-50"
          title="Refresh chat"
          aria-label="Refresh chat"
        >
          <Loader2 className={cn('h-5 w-5', refreshing && 'animate-spin')} />
        </button>

        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            mover.is_available
              ? 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400'
              : 'bg-gray-100 text-gray-500 dark:bg-brand-800 dark:text-gray-400',
          )}
        >
          {mover.is_available ? 'Available' : 'Busy'}
        </span>
      </div>

      {pageError && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{pageError}</span>
        </div>
      )}

      {/* Messages */}
      <div className="card mb-4 h-[400px] overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageCircle className="h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Start negotiating with {mover.driver_full_name || 'your mover'}. Discuss pickup logistics, pricing, and details.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              const ownMessage = msg.sender_id === profile?.id;
              const eventData = msg.event_data;

              if (msg.message_type === 'event_request' && eventData) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="max-w-md rounded-xl border-2 border-brand-300 bg-brand-50 p-4 dark:border-brand-600 dark:bg-brand-800/40">
                      <div className="mb-2 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                        <span className="text-sm font-bold text-brand-700 dark:text-brand-300">
                          Booking Event Request
                        </span>
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
                          <span className="font-semibold">
                            {formatKES(eventData.negotiated_price)}
                          </span>
                          <span className="text-xs">
                            + {COMMISSION_RATE * 100}% commission ={' '}
                            {formatKES(
                              eventData.negotiated_price * (1 + COMMISSION_RATE),
                            )}
                          </span>
                        </div>
                      </div>

                      {isMover && activeBookingEvent?.id && activeBookingEvent.id === msg.event_data?.negotiated_price && false}

                      {isMover && activeBookingEvent?.status === 'pending' && (
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void handleConfirmEvent(activeBookingEvent.id)}
                            className="flex-1 rounded-full bg-success-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-success-700"
                          >
                            <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                            Confirm & Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeclineEvent(activeBookingEvent.id)}
                            className="flex-1 rounded-full bg-error-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-error-600"
                          >
                            <XCircle className="mr-1 inline h-3.5 w-3.5" />
                            Decline
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
                      <CheckCircle2 className="mr-1 inline h-4 w-4" />
                      {msg.content}
                    </div>
                  </div>
                );
              }

              if (msg.message_type === 'event_declined') {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="rounded-full bg-error-50 px-4 py-2 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
                      <XCircle className="mr-1 inline h-4 w-4" />
                      {msg.content}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={cn('flex', ownMessage ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[75%] rounded-2xl px-4 py-2 text-sm',
                      ownMessage
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-100 text-gray-800 dark:bg-brand-800 dark:text-gray-200',
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    <p
                      className={cn(
                        'mt-0.5 text-xs',
                        ownMessage ? 'text-brand-200' : 'text-gray-400',
                      )}
                    >
                      {new Date(msg.created_at).toLocaleTimeString('en-KE', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Payment Section */}
      {!isMover && activeBookingEvent?.status === 'confirmed' && (
        <div className="card mb-4 border-2 border-success-300 p-4 dark:border-success-600">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-success-600" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              Event Confirmed — Pay Securely
            </h3>
          </div>

          <div className="mb-3 rounded-xl bg-gray-50 p-3 text-sm dark:bg-brand-800/30">
            <div className="flex justify-between py-0.5">
              <span className="text-gray-500 dark:text-gray-400">Service Amount</span>
              <span className="font-semibold">
                {formatKES(activeBookingEvent.negotiated_price)}
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-gray-500 dark:text-gray-400">Platform Commission (10%)</span>
              <span className="font-semibold text-brand-600 dark:text-brand-400">
                {formatKES(activeBookingEvent.commission_amount)}
              </span>
            </div>
            <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 dark:border-brand-700">
              <span className="font-bold">Total</span>
              <span className="font-bold text-brand-600 dark:text-brand-400">
                {formatKES(activeBookingEvent.total_amount)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePay}
            disabled={paying}
            className="btn-primary flex w-full items-center justify-center gap-2"
          >
            {paying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Processing...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4" /> Pay via Saka Krib Platform
              </>
            )}
          </button>
        </div>
      )}

      {/* Paid state is display-only. Payment status must come from backend. */}
      {!isMover && activeBookingEvent?.status === 'paid' && (
        <div className="card mb-4 border-2 border-success-300 p-4 text-center dark:border-success-600">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success-600" />
          <h3 className="mt-2 text-sm font-bold text-gray-900 dark:text-white">
            Payment Complete!
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Your booking is confirmed for {activeBookingEvent.relocation_date} at{' '}
            {formatTime(activeBookingEvent.pickup_time)}.
          </p>
        </div>
      )}

      {/* Scheduler */}
      {showScheduler && !isMover && (
        <div className="card mb-4 border-2 border-brand-300 p-4 dark:border-brand-600">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
            <Calendar className="h-4 w-4 text-brand-600" />
            Schedule Relocation Event
          </h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Relocation Date
              </label>
              <input
                type="date"
                value={schedDate}
                onChange={(event) => setSchedDate(event.target.value)}
                className="input-field text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Pickup Time
              </label>
              <input
                type="time"
                value={schedTime}
                onChange={(event) => setSchedTime(event.target.value)}
                className="input-field text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Pickup Address
              </label>
              <input
                type="text"
                value={schedPickup}
                onChange={(event) => setSchedPickup(event.target.value)}
                placeholder="Current location"
                className="input-field text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Drop-off Address
              </label>
              <input
                type="text"
                value={schedDropoff}
                onChange={(event) => setSchedDropoff(event.target.value)}
                placeholder="Destination"
                className="input-field text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Negotiated Price (KES)
              </label>
              <input
                type="number"
                value={schedPrice}
                onChange={(event) => setSchedPrice(event.target.value)}
                placeholder="e.g. 5000"
                className="input-field text-sm"
                min={1}
                step="1"
              />
            </div>
          </div>

          {schedError && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-error-50 px-3 py-2 text-xs text-error-700 dark:bg-error-900/20 dark:text-error-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{schedError}</span>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void handleSchedule()}
              disabled={submittingEvent}
              className="btn-primary flex flex-1 items-center justify-center gap-2 text-sm"
            >
              {submittingEvent ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending...
                </>
              ) : (
                'Send Event Request'
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowScheduler(false)}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Message Input */}
      <div className="card p-3">
        {draft && draft !== newMessage && (
          <p className="mb-1.5 text-xs text-gray-400">
            Draft saved: "{draft.slice(0, 40)}{draft.length > 40 ? '...' : ''}"
          </p>
        )}

        <div className="flex gap-2">
          {!isMover && (
            <button
              type="button"
              onClick={() => setShowScheduler((open) => !open)}
              className={cn(
                'rounded-full p-2.5 transition-colors',
                showScheduler
                  ? 'bg-brand-100 text-brand-600 dark:bg-brand-800 dark:text-brand-400'
                  : 'text-gray-400 hover:text-brand-600',
              )}
              title="Schedule relocation"
              aria-label="Schedule relocation"
            >
              <Calendar className="h-5 w-5" />
            </button>
          )}

          <input
            type="text"
            value={newMessage}
            onChange={(event) => {
              setNewMessage(event.target.value);
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !sending) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Type a message..."
            className="input-field flex-1"
            maxLength={2000}
          />

          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!newMessage.trim() || sending}
            className="btn-primary flex items-center justify-center gap-2"
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-gray-400">
        © Copyright Saka Krib. All Rights Reserved.
      </p>
    </div>
  );
}
