import { useEffect, useState } from 'react';

export interface MarketplaceEvent {
  type: 'resource.updated' | 'ready' | 'pong';
  resource?: string;
  object_id?: string;
  action?: 'created' | 'updated' | 'deleted';
  status?: string | null;
  reconnected?: boolean;
}

type Listener = (event: MarketplaceEvent) => void;
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

function marketplaceWebSocketUrl() {
  const configured = (import.meta.env.VITE_DJANGO_API_URL as string | undefined)
    ?.trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
  const url = new URL(`${configured || window.location.origin}/ws/marketplace/`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function scheduleReconnect() {
  if (!listeners.size || reconnectTimer !== null) return;
  const delay = Math.min(1000 * 2 ** Math.min(attempts++, 5), 15000);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect() {
  if (!listeners.size || (socket && (
    socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN
  ))) return;

  try {
    socket = new WebSocket(marketplaceWebSocketUrl());
  } catch {
    scheduleReconnect();
    return;
  }

  const connection = socket;
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
      const event = JSON.parse(message.data) as MarketplaceEvent;
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
      // The public catalogue remains available through its HTTP read endpoints.
    }
  };
  connection.onerror = () => connection.close();
  connection.onclose = () => {
    clearHeartbeat();
    if (socket === connection) socket = null;
    scheduleReconnect();
  };
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

export function useMarketplaceEvents() {
  const [event, setEvent] = useState<MarketplaceEvent | null>(null);
  useEffect(() => subscribe(setEvent), []);
  return { event };
}
