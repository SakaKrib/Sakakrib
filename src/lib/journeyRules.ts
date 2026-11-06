import { useEffect, useMemo, useState } from 'react';

/** Mirrors backend/apps/core/moving_proximity.py. The server is the authority; these only drive the UI. */
export const DEFAULT_EARLY_START_MINUTES = 30;
export const PICKUP_RADIUS_METERS = 500;
export const DELIVERY_RADIUS_METERS = 200;

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (v: number) => (v * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

export function formatCoordinates(lat: number | null | undefined, lng: number | null | undefined): string {
  if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return 'No location yet';
  const la = Number(lat); const ln = Number(lng);
  return `${Math.abs(la).toFixed(5)}° ${la >= 0 ? 'N' : 'S'}, ${Math.abs(ln).toFixed(5)}° ${ln >= 0 ? 'E' : 'W'}`;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(total / 86400); const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60); const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function agoLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'no update yet';
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

interface StartGateInput {
  scheduled_start_at?: string | null;
  server_now?: string | null;
  early_start_minutes?: number | null;
}

/**
 * Whether the mover may start yet. Uses the server clock (offset taken from `server_now`) so a wrong
 * phone clock cannot unlock or block the button. Re-evaluates every second.
 */
export function useStartGate(booking: StartGateInput | null | undefined) {
  const scheduled = booking?.scheduled_start_at ?? null;
  const serverNow = booking?.server_now ?? null;
  const early = booking?.early_start_minutes ?? DEFAULT_EARLY_START_MINUTES;
  // Offset between the server clock and this device, fixed when the booking was loaded.
  const offset = useMemo(() => {
    if (!serverNow) return 0;
    const t = new Date(serverNow).getTime();
    return Number.isFinite(t) ? t - Date.now() : 0;
  }, [serverNow]);
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!scheduled) return;
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [scheduled]);

  if (!scheduled) return { hasSchedule: false, open: false, msUntilOpen: 0, opensAt: null as Date | null, scheduledAt: null as Date | null };
  const scheduledAt = new Date(scheduled);
  const opensAt = new Date(scheduledAt.getTime() - early * 60000);
  const msUntilOpen = opensAt.getTime() - (tick + offset);
  return { hasSchedule: true, open: msUntilOpen <= 0, msUntilOpen, opensAt, scheduledAt };
}
