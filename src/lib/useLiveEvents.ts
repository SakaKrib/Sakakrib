import { useEffect, useState } from 'react';

export interface LiveBusinessEvent {
  type: 'resource.updated' | 'ready' | 'pong';
  resource?: string;
  object_id?: string;
  action?: 'created' | 'updated';
  status?: string | null;
}

type Listener = (event: LiveBusinessEvent) => void;
const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let attempts = 0;

function websocketUrl() {
  const configured = (import.meta.env.VITE_DJANGO_API_URL as string | undefined)
    ?.trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
  const url = new URL(`${configured || window.location.origin}/ws/events/`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function connect() {
  if (
    !listeners.size ||
    (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN))
  ) return;

  try {
    socket = new WebSocket(websocketUrl());
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => { attempts = 0; };
  socket.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data) as LiveBusinessEvent;
      listeners.forEach((listener) => listener(event));
    } catch {
      // REST remains authoritative if a malformed event frame is received.
    }
  };
  socket.onerror = () => socket?.close();
  socket.onclose = () => {
    socket = null;
    scheduleReconnect();
  };
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
      socket?.close();
      socket = null;
    }
  };
}

export function useLiveEvents() {
  const [event, setEvent] = useState<LiveBusinessEvent | null>(null);
  useEffect(() => subscribe(setEvent), []);
  return { event };
}
