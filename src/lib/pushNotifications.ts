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
  'notifications', 'profile',
]);

function openNotificationSource(data: Record<string, unknown> | undefined) {
  const raw = String(data?.deep_link || '').trim();
  if (!raw) {
    window.location.hash = 'notifications';
    return;
  }

  const route = raw.replace(/^#/, '').replace(/^\/+/, '');
  const [view] = route.split('/');
  if (!ALLOWED_VIEWS.has(view)) {
    window.location.hash = 'notifications';
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
  return () => {
    void listener.remove();
  };
}

export async function initializePushNotifications(): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};

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

  const permission = await PushNotifications.checkPermissions();
  let receivePermission = permission.receive;
  if (receivePermission !== 'granted') {
    const requested = await PushNotifications.requestPermissions();
    receivePermission = requested.receive;
  }

  if (receivePermission === 'granted') {
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
