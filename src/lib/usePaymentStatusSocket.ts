import { useEffect, useRef, useState } from 'react';
import { getDjangoWebSocketUrl } from '@/lib/djangoApi';

export type PaymentSocketStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED' | 'UPGRADED';

export interface PaymentSocketEvent {
  type: 'payment_status' | 'ready' | 'error' | 'pong';
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


export function usePaymentStatusSocket(invoiceId: string | null | undefined) {
  const [event, setEvent] = useState<PaymentSocketEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!invoiceId) return;

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const connect = () => {
      if (cancelled) return;
      const socket = new WebSocket(getDjangoWebSocketUrl(`/ws/payments/${encodeURIComponent(invoiceId)}/`));
      socketRef.current = socket;

      socket.onopen = () => {
        attempts = 0;
        setConnected(true);
        setConnectionError(null);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (socket.readyState !== WebSocket.OPEN) return;
          if (heartbeatTimeout) {
            socket.close();
            return;
          }
          socket.send(JSON.stringify({ type: 'ping' }));
          heartbeatTimeout = setTimeout(() => {
            heartbeatTimeout = null;
            socket.close();
          }, 10000);
        }, 25000);
      };

      socket.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data) as PaymentSocketEvent;
          if (data.type === 'pong') {
            if (heartbeatTimeout) clearTimeout(heartbeatTimeout);
            heartbeatTimeout = null;
            return;
          }
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
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (heartbeatTimeout) clearTimeout(heartbeatTimeout);
        heartbeatTimer = null;
        heartbeatTimeout = null;
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
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (heartbeatTimeout) clearTimeout(heartbeatTimeout);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [invoiceId]);

  return { event, connected, connectionError };
}
