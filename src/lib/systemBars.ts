import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

export type AppTheme = 'light' | 'dark';

/** Must match --status-bar-bg in index.css (the strip drawn behind the status bar). */
const BAR_COLOR: Record<AppTheme, string> = {
  light: '#ffffff',
  dark: '#070d1c',
};

/** While set (e.g. during the splash screen) this wins over the app theme. */
let lockedTheme: AppTheme | null = null;

function apply(theme: AppTheme): void {
  // Mobile browsers use this for the address bar colour.
  try {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = BAR_COLOR[theme];
  } catch {
    /* non-critical */
  }

  if (!Capacitor.isNativePlatform()) return;

  SystemBars.setStyle({
    style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
  }).catch((error: unknown) => {
    console.warn('Could not update system bar style', error);
  });
}

/**
 * Keeps the system status bar and navigation bar icons readable for the app's own theme.
 *
 * Capacitor's default style ("DEFAULT") follows the phone's system appearance, not the app's
 * light/dark toggle. A phone in dark mode with the app in light mode therefore showed white
 * icons (time, battery, signal) on a light background. We set the style explicitly instead.
 *
 * SystemBarsStyle.Dark  = light icons, for dark backgrounds.
 * SystemBarsStyle.Light = dark icons, for light backgrounds.
 */
export function syncSystemBars(theme: AppTheme): void {
  apply(lockedTheme ?? theme);
}

/**
 * Temporarily force the bar icons for a screen that has its own background, such as the
 * splash screen. 'dark' means light icons (for a dark background).
 */
export function lockSystemBars(theme: AppTheme): void {
  lockedTheme = theme;
  apply(theme);
}

/** Release a lock and return to the style that matches the app theme. */
export function unlockSystemBars(appTheme: AppTheme): void {
  lockedTheme = null;
  apply(appTheme);
}
