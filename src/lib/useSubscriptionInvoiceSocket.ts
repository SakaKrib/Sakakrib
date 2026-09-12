import { useEffect, useRef, useState } from 'react';

export interface SubscriptionInvoiceSocketEvent {
  type: 'subscription_invoice' | 'ready' | 'error';
  event_type?: string;
  status?: string;
  invoice_id?: string;
  listing_id?: string | null;
  subscription_id?: string | null;
}

const getApiBase = () => (import.meta.env.VITE_DJANGO_API_URL as string | undefined || window.location.origin).replace(/\/+$/, '');

const getWebSocketBase = () => {
  const url = new URL(getApiBase());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString().replace(/\/$/, '');
};

export function useSubscriptionInvoiceSocket() {
  const [event, setEvent] = useState<SubscriptionInvoiceSocketEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const connect = () => {
      if (cancelled) return;
      const socket = new WebSocket(`${getWebSocketBase()}/ws/subscription-invoices/`);
      socketRef.current = socket;

      socket.onopen = () => {
        attempts = 0;
        setConnected(true);
        setConnectionError(null);
      };

      socket.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data) as SubscriptionInvoiceSocketEvent;
          setEvent(data);
          if (data.type === 'subscription_invoice') {
            setConnectionError(null);
          }
        } catch {
          setConnectionError('Received an invalid subscription invoice update.');
        }
      };

      socket.onerror = () => {
        setConnected(false);
        setConnectionError('Live subscription invoice updates are temporarily unavailable.');
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
  }, []);

  return { event, connected, connectionError };
}
