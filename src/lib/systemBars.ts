import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

export type AppTheme = 'light' | 'dark';

/** Must match --status-bar-bg in index.css (the strip drawn behind the status bar). */
const BAR_COLOR: Record<AppTheme, string> = {
  light: '#ffffff',
  dark: '#070d1c',
};

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
