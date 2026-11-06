import type { CapacitorConfig } from '@capacitor/cli';

const devServerUrl = process.env.CAPACITOR_DEV_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.sakakrib.app',
  appName: 'Saka Krib',
  webDir: 'dist',
  server: {
    // Keep the bundled Android WebView on a secure local origin.
    // This is important for browser APIs such as navigator.geolocation.
    hostname: 'localhost',
    androidScheme: 'https',
    ...(devServerUrl
      ? {
          url: devServerUrl,
          cleartext: devServerUrl.startsWith('http://'),
        }
      : {}),
  },
  plugins: {
    SocialLogin: {
      providers: {
        google: true,
        apple: true,
        facebook: false,
        twitter: false,
      },
      logLevel: 1,
    },
    // Status bar icon colour is set from the app theme at runtime (src/lib/systemBars.ts).
    // 'css' keeps Android insets handled by Capacitor; this is also the default.
    SystemBars: {
      insetsHandling: 'css',
      style: 'DEFAULT',
    },
  },
};

export default config;
