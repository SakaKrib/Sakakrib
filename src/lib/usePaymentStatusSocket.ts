import { useEffect, useRef, useState } from 'react';

export type PaymentSocketStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

export interface PaymentSocketEvent {
  type: 'payment_status' | 'ready' | 'error';
  status?: PaymentSocketStatus;
  message?: string;
  provider?: string;
  invoice_id?: string;
  event_type?: string;
  listing_id?: string | null;
  subscription_id?: string | null;
  subscription_status?: string | null;
  details?: Record<string, unknown>;
}

const getApiBase = () => (import.meta.env.VITE_DJANGO_API_URL as string | undefined || window.location.origin).replace(/\/+$/, '');

const getWebSocketBase = () => {
  const url = new URL(getApiBase());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString().replace(/\/$/, '');
};

export function usePaymentStatusSocket(invoiceId: string | null | undefined) {
  const [event, setEvent] = useState<PaymentSocketEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!invoiceId) return;

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const connect = () => {
      if (cancelled) return;
      const socket = new WebSocket(`${getWebSocketBase()}/ws/payments/${encodeURIComponent(invoiceId)}/`);
      socketRef.current = socket;

      socket.onopen = () => {
        attempts = 0;
        setConnected(true);
        setConnectionError(null);
      };

      socket.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data) as PaymentSocketEvent;
          setEvent(data);
          if (data.type === 'payment_status') {
            setConnectionError(null);
          }
        } catch {
          setConnectionError('Received an invalid payment status update.');
        }
      };

      socket.onerror = () => {
        setConnected(false);
        setConnectionError('Live payment confirmation is temporarily unavailable.');
      };

      socket.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        attempts += 1;
        const delay = Math.min(1000 * 2 ** Math.min(attempts, 5), 15000);
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [invoiceId]);

  return { event, connected, connectionError };
}
