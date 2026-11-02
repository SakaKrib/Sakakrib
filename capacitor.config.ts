import type { CapacitorConfig } from '@capacitor/cli';

const devServerUrl = process.env.CAPACITOR_DEV_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.sakakrib.app',
  appName: 'Saka Krib',
  webDir: 'dist',
  bundledWebRuntime: false,
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
