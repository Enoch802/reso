import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.reso.app',
  appName: 'Reso',
  webDir: 'public',
  server: {
    url: 'https://reso-pnjj.vercel.app',
    cleartext: false
  }
};

export default config;
