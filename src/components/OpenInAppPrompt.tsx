import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Smartphone, X } from 'lucide-react';

const ANDROID_PACKAGE = 'com.sakakrib.app';

interface PromptState { intentUrl: string }

/** Reads the landing URL once, before the router rewrites `/app/...` into a hash route. */
function readInitialState(): PromptState | null {
  if (typeof window === 'undefined' || Capacitor.isNativePlatform()) return null;
  const { pathname, search, host, origin } = window.location;
  if (!pathname.startsWith('/app/') || !/android/i.test(window.navigator.userAgent)) return null;
  const route = pathname.slice('/app/'.length).replace(/^\/+|\/+$/g, '');
  if (!route) return null;
  const fallback = route.startsWith('reset-password') ? `${origin}/reset-password${search}` : `${origin}/#${route}`;
  return {
    intentUrl: `intent://${host}${pathname}${search}#Intent;scheme=https;package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallback)};end`,
  };
}

/**
 * Email buttons are verified HTTPS App Links. When Android has not (yet) verified the link and
 * opens it in a browser instead of the installed app, this gives the person a one-tap way to open
 * Saka Krib. If the app is not installed the intent falls back to the website page.
 */
export default function OpenInAppPrompt() {
  const [state, setState] = useState<PromptState | null>(readInitialState);
  if (!state) return null;
  return (
    <div className="fixed inset-x-3 bottom-4 z-[100] rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-brand-700 dark:bg-brand-900" role="dialog" aria-label="Open in the Saka Krib app">
      <button type="button" onClick={() => setState(null)} className="absolute right-3 top-3 rounded-full p-1 text-gray-400" aria-label="Dismiss"><X className="h-4 w-4" /></button>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-800 dark:text-brand-200"><Smartphone className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 dark:text-white">Open this in the Saka Krib app</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">You get live updates, notifications and precise location in the app.</p>
          <div className="mt-3 flex gap-2">
            <a href={state.intentUrl} className="btn-primary px-4 py-2 text-xs">Open app</a>
            <button type="button" onClick={() => setState(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 dark:border-brand-700 dark:text-gray-200">Continue in browser</button>
          </div>
        </div>
      </div>
    </div>
  );
}
