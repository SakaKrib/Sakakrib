import type { CapacitorConfig } from '@capacitor/cli';

const devServerUrl = process.env.CAPACITOR_DEV_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.sakakrib.app',
  appName: 'Saka Krib',
  webDir: 'dist',
  plugins: {
    // Status bar icon colour is set from the app theme at runtime (src/lib/systemBars.ts).
    // 'css' keeps Android insets handled by Capacitor; this is also the default.
    SystemBars: {
      insetsHandling: 'css',
      style: 'DEFAULT',
    },
  },
  ...(devServerUrl
    ? {
        server: {
          url: devServerUrl,
          cleartext: devServerUrl.startsWith('http://'),
        },
      }
    : {}),
};

export default config;
