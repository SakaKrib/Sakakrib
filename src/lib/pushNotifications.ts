import { Capacitor } from '@capacitor/core';
import { PushNotifications, type PluginListenerHandle } from '@capacitor/push-notifications';

import { protectedPost } from '@/lib/djangoApi';

let currentRegistrationToken: string | null = null;

const ALLOWED_VIEWS = new Set([
  'home', 'listings', 'listing-detail', 'listing-manage', 'movers',
  'mover-detail', 'mover-booking-detail', 'chat', 'community',
  'post-listing', 'dashboard', 'my-bookings', 'my-listings',
  'subscription-plans', 'pms-dashboard', 'renter-invoices',
  'renter-payment', 'renter-moving-history', 'mover-tracking',
  'live-mover-map', 'renter-calendar', 'renter-messages',
  'renter-notifications', 'mover-calendar', 'mover-booking-requests',
  'mover-upcoming-jobs', 'mover-customers', 'mover-invoices',
  'mover-earnings', 'mover-notifications', 'mover-messages',
  'moving-financial-records', 'moving-transaction-timeline',
  'profile',
]);

function openNotificationSource(data: Record<string, unknown> | undefined) {
  const raw = String(data?.deep_link || '').trim();
  if (!raw) {
    window.location.hash = 'dashboard';
    return;
  }

  const route = raw.replace(/^#/, '').replace(/^\/+/, '');
  const [view] = route.split('/');
  if (!ALLOWED_VIEWS.has(view)) {
    window.location.hash = 'dashboard';
    return;
  }

  window.location.hash = route;
}

export async function installPushNotificationActionListener(): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};
  const listener = await PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action) => {
      openNotificationSource(
        action.notification.data as Record<string, unknown> | undefined,
      );
    },
  );
  const received = await PushNotifications.addListener('pushNotificationReceived', () => {
    window.dispatchEvent(new Event('sakakrib:push'));
  });
  return () => {
    void listener.remove();
    void received.remove();
  };
}

const FIREBASE_PUSH_ENABLED =
  import.meta.env.VITE_FIREBASE_PUSH_ENABLED === 'true';

export type PushPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

/** True only in the installed app, in a build that was configured with Firebase. */
export function isPushAvailable(): boolean {
  return Capacitor.isNativePlatform() && FIREBASE_PUSH_ENABLED;
}

function toPermissionState(receive: string): PushPermissionState {
  if (receive === 'granted') return 'granted';
  if (receive === 'denied') return 'denied';
  return 'prompt'; // 'prompt' and 'prompt-with-rationale'
}

/** Current notification permission, without showing any dialog. */
export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (!isPushAvailable()) return 'unsupported';
  try {
    const permission = await PushNotifications.checkPermissions();
    return toPermissionState(permission.receive);
  } catch (error) {
    console.warn('Unable to read notification permission:', error);
    return 'unsupported';
  }
}

async function registerForPush(): Promise<void> {
  if (Capacitor.getPlatform() === 'android') {
    try {
      await PushNotifications.createChannel({
        id: 'sakakrib_notifications',
        name: 'Saka Krib',
        description: 'Bookings, messages, listings, payments and account updates',
        importance: 5,
      });
    } catch (error) {
      console.warn('Unable to create the Saka Krib notification channel:', error);
    }
  }
  await PushNotifications.register();
}

/**
 * Ask the user to allow notifications (system Allow / Don't allow dialog on Android 13+ and
 * iOS) and, if they agree, register this phone with Firebase. Call it from a button the user
 * tapped, after explaining why (see NotificationPermissionPrompt).
 */
export async function enablePushNotifications(): Promise<PushPermissionState> {
  if (!isPushAvailable()) return 'unsupported';
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive === 'granted') await registerForPush();
  return toPermissionState(permission.receive);
}

/**
 * Attach the listeners that save this phone's Firebase token with the server, and register
 * right away if the user already allowed notifications. It never shows a permission dialog by
 * itself: that happens only through enablePushNotifications().
 */
export async function initializePushNotifications(): Promise<() => void> {
  if (!isPushAvailable()) {
    return () => {};
  }

  const listeners: PluginListenerHandle[] = [];
  const addListener = async (handle: Promise<PluginListenerHandle>) => {
    const listener = await handle;
    listeners.push(listener);
  };

  await addListener(PushNotifications.addListener('registration', async (token) => {
    currentRegistrationToken = token.value;
    try {
      await protectedPost('/api/accounts/push-devices/', {
        token: token.value,
        platform: Capacitor.getPlatform(),
      });
    } catch (error) {
      console.error('Unable to register FCM device token with Saka Krib:', error);
    }
  }));

  await addListener(PushNotifications.addListener('registrationError', (error) => {
    console.error('Native push registration failed:', error);
  }));

  // Already allowed earlier (or in system settings): refresh the token quietly.
  if ((await getPushPermissionState()) === 'granted') {
    await registerForPush();
  }

  return () => {
    listeners.forEach((listener) => {
      void listener.remove();
    });
  };
}

export async function unregisterPushDevicesForCurrentUser() {
  if (!Capacitor.isNativePlatform() || !currentRegistrationToken) return;
  await protectedPost('/api/accounts/push-devices/unregister/', {
    token: currentRegistrationToken,
  });
  currentRegistrationToken = null;
}
