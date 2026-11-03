import { useEffect, useState } from 'react';
import { ensureDjangoApiBaseUrl } from '@/lib/djangoApi';

export interface LiveBusinessEvent {
  type: 'resource.updated' | 'ready' | 'pong';
  resource?: string;
  object_id?: string;
  action?: 'created' | 'updated' | 'deleted';
  status?: string | null;
  reconnected?: boolean;
}

type Listener = (event: LiveBusinessEvent) => void;
const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let attempts = 0;
let hasConnectedOnce = false;
let heartbeatTimer: number | null = null;
let heartbeatTimeout: number | null = null;

function clearHeartbeat() {
  if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
  if (heartbeatTimeout !== null) window.clearTimeout(heartbeatTimeout);
  heartbeatTimer = null;
  heartbeatTimeout = null;
}

function websocketUrl(baseUrl: string) {
  const url = new URL(`${baseUrl}/ws/events/`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

let connectionPending = false;

async function connect() {
  if (
    !listeners.size ||
    connectionPending ||
    (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN))
  ) return;

  connectionPending = true;
  try {
    const baseUrl = await ensureDjangoApiBaseUrl();
    if (!listeners.size || (socket && (
      socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN
    ))) return;

    const connection = new WebSocket(websocketUrl(baseUrl));
    socket = connection;
    connection.onopen = () => {
      attempts = 0;
      clearHeartbeat();
      heartbeatTimer = window.setInterval(() => {
        if (connection.readyState !== WebSocket.OPEN) return;
        if (heartbeatTimeout !== null) {
          connection.close();
          return;
        }
        connection.send(JSON.stringify({ type: 'ping' }));
        heartbeatTimeout = window.setTimeout(() => {
          heartbeatTimeout = null;
          connection.close();
        }, 10000);
      }, 25000);
    };
    connection.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as LiveBusinessEvent;
        if (event.type === 'pong') {
          if (heartbeatTimeout !== null) window.clearTimeout(heartbeatTimeout);
          heartbeatTimeout = null;
          return;
        }
        if (event.type === 'ready') {
          event.reconnected = hasConnectedOnce;
          hasConnectedOnce = true;
        }
        listeners.forEach((listener) => listener(event));
      } catch {
        // REST remains authoritative if a malformed event frame is received.
      }
    };
    connection.onerror = () => connection.close();
    connection.onclose = () => {
      clearHeartbeat();
      if (socket === connection) socket = null;
      scheduleReconnect();
    };
  } catch {
    scheduleReconnect();
  } finally {
    connectionPending = false;
  }
}
function scheduleReconnect() {
  if (!listeners.size || reconnectTimer !== null) return;
  const delay = Math.min(1000 * 2 ** Math.min(attempts++, 5), 15000);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  connect();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      clearHeartbeat();
      socket?.close();
      socket = null;
      hasConnectedOnce = false;
    }
  };
}

export function useLiveEvents(enabled = true) {
  const [event, setEvent] = useState<LiveBusinessEvent | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return subscribe(setEvent);
  }, [enabled]);
  return { event };
}
