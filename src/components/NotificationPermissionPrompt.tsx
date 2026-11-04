import { useEffect, useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { enablePushNotifications, getPushPermissionState, isPushAvailable } from '@/lib/pushNotifications';

const SNOOZE_KEY = 'saka-krib-push-prompt-until';
const NOT_NOW_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const DENIED_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
/** Wait so the prompt never appears on top of the launch animation or the first screen load. */
const SHOW_DELAY_MS = 4500;

function snoozedUntil(): number {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function snoozeFor(ms: number): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + ms));
  } catch {
    /* storage unavailable: the prompt may show again next launch */
  }
}

type View = 'hidden' | 'ask' | 'busy' | 'denied';

/**
 * Asks, in the app's own words, whether Saka Krib may send notifications, then shows the
 * system Allow / Don't allow dialog only if the person agrees. Shown once the person is signed
 * in, only inside the installed app, and only while permission is still undecided.
 */
export default function NotificationPermissionPrompt() {
  const { profile, loading } = useAuth();
  const [view, setView] = useState<View>('hidden');

  useEffect(() => {
    if (loading || !profile?.id || !isPushAvailable()) {
      setView('hidden');
      return;
    }
    if (snoozedUntil() > Date.now()) return;

    let cancelled = false;
    let timer: number | undefined;
    void getPushPermissionState().then((state) => {
      if (cancelled || state !== 'prompt') return;
      timer = window.setTimeout(() => {
        if (!cancelled) setView('ask');
      }, SHOW_DELAY_MS);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loading, profile?.id]);

  if (view === 'hidden') return null;

  const notNow = () => {
    snoozeFor(NOT_NOW_SNOOZE_MS);
    setView('hidden');
  };

  const allow = async () => {
    setView('busy');
    try {
      const state = await enablePushNotifications();
      if (state === 'granted') {
        setView('hidden');
      } else {
        snoozeFor(DENIED_SNOOZE_MS);
        setView('denied');
      }
    } catch (error) {
      console.warn('Could not enable notifications:', error);
      setView('denied');
    }
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-3"
      style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div
        role="dialog"
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-auto w-full max-w-md animate-slide-up rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-brand-700 dark:bg-brand-900"
      >
        {view === 'denied' ? (
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-brand-800 dark:text-gray-300">
              <BellOff className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Notifications are off</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                You will not get message or mover alerts. To turn them on later, open your phone&apos;s Settings &gt; Apps &gt; Saka Krib &gt; Notifications.
              </p>
              <button type="button" onClick={() => setView('hidden')} className="btn-secondary mt-3 !px-4 !py-2 text-xs">
                OK
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-800 dark:text-brand-300">
                <Bell className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Turn on notifications?</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Get alerts for new messages, when your mover reaches the pickup and drop-off points, payments and listing updates, even when the app is closed.
                </p>
              </div>
              <button
                type="button"
                onClick={notNow}
                aria-label="Dismiss"
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-brand-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void allow()}
                disabled={view === 'busy'}
                className="btn-primary flex-1 !py-2 text-sm"
              >
                {view === 'busy' ? 'Asking…' : 'Allow notifications'}
              </button>
              <button type="button" onClick={notNow} disabled={view === 'busy'} className="btn-secondary !py-2 text-sm">
                Not now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
