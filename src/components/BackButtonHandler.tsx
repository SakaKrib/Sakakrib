import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useNav } from '@/context/NavContext';

/** Second back press must come within this window to actually exit. */
const EXIT_WINDOW_MS = 2000;

/**
 * Android hardware/gesture back button.
 *
 * 1. If the sign-in / verification modal is open, close it.
 * 2. Away from the home screen, go back one screen like the browser's back button.
 * 3. On the home screen, the first press shows
 *    "Press back again to exit"; a second press within 2 seconds exits the app.
 *
 * Renders only the small hint toast. Does nothing in a normal browser.
 */
export default function BackButtonHandler() {
  const { view, navigate, authModalOpen, setAuthModalOpen } = useNav();
  const [showHint, setShowHint] = useState(false);

  // The listener is registered once, so it reads the latest values through a ref.
  const latest = useRef({ view, navigate, authModalOpen, setAuthModalOpen });
  latest.current = { view, navigate, authModalOpen, setAuthModalOpen };

  const lastBackAt = useRef(0);
  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeListener: (() => void) | undefined;
    let disposed = false;

    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      const { view: currentView, navigate: go, authModalOpen: modalOpen, setAuthModalOpen: setModalOpen } =
        latest.current;

      if (modalOpen) {
        setModalOpen(false);
        return;
      }

      // Not on the home screen: step back one screen.
      if (currentView !== 'home') {
        if (canGoBack) window.history.back();
        else go('home');
        return;
      }

      // On the home screen: this is the "exit" gesture, whatever the history holds.
      const now = Date.now();
      if (now - lastBackAt.current <= EXIT_WINDOW_MS) {
        void CapacitorApp.exitApp();
        return;
      }

      lastBackAt.current = now;
      setShowHint(true);
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setShowHint(false), EXIT_WINDOW_MS);
    })
      .then((handle) => {
        if (disposed) void handle.remove();
        else removeListener = () => void handle.remove();
      })
      .catch((error: unknown) => console.warn('Back button listener unavailable', error));

    return () => {
      disposed = true;
      removeListener?.();
      window.clearTimeout(hideTimer.current);
    };
  }, []);

  if (!showHint) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[9998] flex justify-center px-4"
      style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="animate-fade-in rounded-full bg-gray-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg dark:bg-white/90 dark:text-gray-900">
        Press back again to exit
      </div>
    </div>
  );
}
