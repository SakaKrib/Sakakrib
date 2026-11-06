import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';

interface LocationSettingsPlugin {
  ensureEnabled(): Promise<{ enabled: boolean }>;
}

const NativeLocationSettings = registerPlugin<LocationSettingsPlugin>('LocationSettings');

/**
 * One place for every GPS read in the app.
 *
 * - Android/iOS app: uses the native @capacitor/geolocation plugin, which shows the operating
 *   system's own "Allow Saka Krib to access this device's location?" dialog.
 * - Website (Chrome, Safari...): uses the browser's navigator.geolocation, which shows the
 *   browser's permission prompt. Requires HTTPS (or localhost).
 *
 * Call these from a user action (a tap on "Use my location", "Show on map", "Start journey")
 * so the permission prompt appears when the person expects it.
 */

export interface DevicePosition {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

export type LocationErrorCode =
  | 'permission_denied'
  | 'services_off'
  | 'no_fix'
  | 'timeout'
  | 'unsupported'
  | 'insecure'
  | 'unknown';

export class LocationError extends Error {
  readonly code: LocationErrorCode;
  constructor(code: LocationErrorCode, message?: string) {
    super(message ?? locationMessage(code));
    this.name = 'LocationError';
    this.code = code;
  }
}

export interface LocationOptions {
  /** Default true: use GPS rather than network location. */
  enableHighAccuracy?: boolean;
  /** Accept a cached fix this old (ms). */
  maximumAge?: number;
  /** Give up after this long (ms). */
  timeout?: number;
}

const DEFAULTS: Required<LocationOptions> = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 20000,
};

function locationMessage(code: LocationErrorCode): string {
  switch (code) {
    case 'permission_denied':
      return Capacitor.isNativePlatform()
        ? 'Saka Krib needs precise location to show your live position. Tap Enable location to request access. If Android no longer displays the permission prompt, you may need to re-enable location access in app permissions.'
        : 'Location permission was not granted. Allow location for this site in your browser, then tap Try again.';
    case 'services_off':
      return Capacitor.isNativePlatform()
        ? 'Location is still off. Tap Enable location to open the Android prompt and turn it on.'
        : 'Location is turned off on this device. Turn on Location, then tap Try again.';
    case 'no_fix':
      return 'Still looking for your location. Step outside or near a window and give it a few seconds, or tap Try again.';
    case 'timeout':
      return 'We could not get a GPS fix in time. Move to an open area, check that Location is on, and try again.';
    case 'unsupported':
      return 'This device or browser does not support location.';
    case 'insecure':
      return 'The browser only allows location on secure (HTTPS) pages. Open Saka Krib over HTTPS and try again.';
    default:
      return 'Unable to read your current location. Check that Location is turned on and try again.';
  }
}

/** Human-readable text for anything thrown by this module (or by the underlying plugins). */
export function describeLocationError(error: unknown): string {
  if (error instanceof LocationError) return error.message;
  return normalizeError(error).message;
}

function normalizeError(error: unknown): LocationError {
  if (error instanceof LocationError) return error;

  // Browser GeolocationPositionError: 1 denied, 2 unavailable (no fix yet), 3 timeout.
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 1) return new LocationError('permission_denied');
  if (code === 2) return new LocationError('no_fix');
  if (code === 3) return new LocationError('timeout');

  // Capacitor plugin errors are plain Errors with a descriptive message. Only say Location is
  // switched off when the phone says so explicitly; "unavailable" usually just means no GPS
  // fix yet (indoors, cold start) and must not be reported as GPS being off.
  const text = String((error as { message?: unknown } | null)?.message ?? error ?? '').toLowerCase();
  if (/(permission|not granted|denied)/.test(text)) return new LocationError('permission_denied');
  if (/(location services?.*(not enabled|disabled|off)|location (is )?(disabled|turned off|switched off)|gps (is )?(off|disabled|not enabled))/.test(text)) {
    return new LocationError('services_off');
  }
  if (/(timeout|timed out)/.test(text)) return new LocationError('timeout');
  if (/(unavailable|no location|unable to (get|determine|read))/.test(text)) return new LocationError('no_fix');
  return new LocationError('unknown');
}

export function isLocationSupported(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

function assertBrowserReady(): void {
  if (!isLocationSupported()) throw new LocationError('unsupported');
  if (typeof window !== 'undefined' && window.isSecureContext === false) throw new LocationError('insecure');
}

export type PermissionState = 'granted' | 'denied' | 'prompt';

/** Current permission without showing any prompt. */
export async function checkLocationPermission(): Promise<PermissionState> {
  if (Capacitor.isNativePlatform()) {
    const status = await Geolocation.checkPermissions();
    if (status.location === 'granted' || status.coarseLocation === 'granted') return 'granted';
    if (status.location === 'denied') return 'denied';
    return 'prompt';
  }
  try {
    const result = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (result) return result.state as PermissionState;
  } catch {
    /* Permissions API not available (older Safari): the browser will prompt on first use. */
  }
  return 'prompt';
}

/**
 * Ask for location permission now. On Android this shows the system dialog. In a browser the
 * prompt only appears when a position is actually requested, so this takes one reading.
 * Resolves to true when location can be used, otherwise throws a LocationError.
 */
export async function requestLocationPermission(): Promise<true> {
  if (Capacitor.isNativePlatform()) {
    let status = await Geolocation.checkPermissions();
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      // No arguments: Android shows its own "Allow only while using the app" dialog.
      status = await Geolocation.requestPermissions();
    }
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      throw new LocationError('permission_denied');
    }
    return true;
  }
  await getCurrentPosition({ maximumAge: 60000, timeout: 30000 });
  return true;
}

/**
 * Prepares the device for the listing's live map from the user's tap:
 * request Android runtime permission first, then show Android's native
 * "Turn on device location" dialog if Location/GPS is switched off.
 */
export async function prepareLiveMapLocation(): Promise<DevicePosition> {
  try {
    if (Capacitor.isNativePlatform()) {
      let status = await Geolocation.checkPermissions();
      if (status.location !== 'granted') {
        status = await Geolocation.requestPermissions();
      }
      if (status.location !== 'granted') {
        throw new LocationError(
          'permission_denied',
          status.coarseLocation === 'granted'
            ? 'Please choose Precise location for Saka Krib so the live map can show your position accurately.'
            : undefined,
        );
      }
      await NativeLocationSettings.ensureEnabled();
    }
    return await getCurrentPosition({
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 30000,
    });
  } catch (error) {
    throw normalizeError(error);
  }
}

function fromNative(position: Position): DevicePosition {
  const { coords } = position;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
    speed: coords.speed == null || !Number.isFinite(coords.speed) ? null : coords.speed,
    heading: coords.heading == null || !Number.isFinite(coords.heading) ? null : coords.heading,
    timestamp: position.timestamp,
  };
}

function fromBrowser(position: GeolocationPosition): DevicePosition {
  const { coords } = position;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
    speed: coords.speed == null ? null : coords.speed,
    heading: coords.heading == null ? null : coords.heading,
    timestamp: position.timestamp,
  };
}

/** One position fix. Asks for permission first when needed. */
export async function getCurrentPosition(options: LocationOptions = {}): Promise<DevicePosition> {
  const opts = { ...DEFAULTS, ...options };
  try {
    if (Capacitor.isNativePlatform()) {
      await requestLocationPermission();
      try {
        return fromNative(await Geolocation.getCurrentPosition(opts));
      } catch (error) {
        if (normalizeError(error).code === 'permission_denied') throw error;
        // No precise GPS fix in time: settle for a network/coarse fix rather than failing.
        return fromNative(await Geolocation.getCurrentPosition({ enableHighAccuracy: false, maximumAge: 120000, timeout: 10000 }));
      }
    }
    assertBrowserReady();
    return await new Promise<DevicePosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition((p) => resolve(fromBrowser(p)), (err) => {
        if (err.code === 1) { reject(err); return; }
        // Retry once with a coarse fix before giving up.
        navigator.geolocation.getCurrentPosition((p) => resolve(fromBrowser(p)), reject, { enableHighAccuracy: false, maximumAge: 120000, timeout: 10000 });
      }, opts);
    });
  } catch (error) {
    throw normalizeError(error);
  }
}

/**
 * Continuous position updates. Resolves to a stop() function once the watch has started
 * (permission granted); rejects with a LocationError if it could not start. Later errors
 * (GPS switched off while watching, a timeout) go to onError and the watch keeps running.
 */
export async function watchPosition(
  onPosition: (position: DevicePosition) => void,
  onError: (error: LocationError) => void,
  options: LocationOptions = {},
): Promise<() => void> {
  const opts = { ...DEFAULTS, ...options };
  const startedAt = Date.now();
  let gotFix = false;

  const deliver = (position: DevicePosition) => {
    gotFix = true;
    onPosition(position);
  };
  // "No fix yet" and timeouts are normal while the GPS warms up. Stay quiet for the first
  // 20 seconds; permission problems and "Location is off" are always reported straight away.
  const report = (error: LocationError) => {
    const transient = error.code === 'no_fix' || error.code === 'timeout';
    if (transient && !gotFix && Date.now() - startedAt < 20000) return;
    onError(error);
  };

  try {
    if (Capacitor.isNativePlatform()) {
      await requestLocationPermission();
      const id = await Geolocation.watchPosition(opts, (position, error) => {
        if (error) report(normalizeError(error));
        else if (position) deliver(fromNative(position));
      });
      // If precise GPS is slow, show a coarse network position meanwhile.
      const fallback = window.setTimeout(() => {
        if (gotFix) return;
        Geolocation.getCurrentPosition({ enableHighAccuracy: false, maximumAge: 120000, timeout: 10000 })
          .then((p) => { if (!gotFix) deliver(fromNative(p)); })
          .catch(() => undefined);
      }, 6000);
      return () => {
        window.clearTimeout(fallback);
        void Geolocation.clearWatch({ id });
      };
    }
    assertBrowserReady();
    const id = navigator.geolocation.watchPosition(
      (p) => deliver(fromBrowser(p)),
      (e) => report(normalizeError(e)),
      opts,
    );
    return () => navigator.geolocation.clearWatch(id);
  } catch (error) {
    throw normalizeError(error);
  }
}

/** Basic sanity check on coordinates before saving them. */
export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
  );
}

/** Shape of a reading handed to requestPosition callbacks (same fields as the browser's). */
export interface PositionReading {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    speed: number | null;
    heading: number | null;
  };
  timestamp: number;
}

/**
 * Callback-style wrapper for form code that just needs "the current location once":
 *
 *   requestPosition((pos) => use(pos.coords.latitude, pos.coords.longitude),
 *                   (err) => showMessage(err.message));
 *
 * Shows the system permission dialog in the app / the browser prompt on the web, and
 * `err.message` is always a sentence the user can act on.
 */
export function requestPosition(
  onSuccess: (position: PositionReading) => void,
  onFailure: (error: LocationError) => void,
  options: LocationOptions = {},
): void {
  getCurrentPosition(options)
    .then((p) =>
      onSuccess({
        coords: {
          latitude: p.latitude,
          longitude: p.longitude,
          accuracy: p.accuracy ?? NaN,
          speed: p.speed,
          heading: p.heading,
        },
        timestamp: p.timestamp,
      }),
    )
    .catch((error: unknown) => onFailure(normalizeError(error)));
}
