import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.reso.app',
  appName: 'Reso',
  // Next.js static export output — the full app, bundled inside the APK.
  webDir: 'out',
  // Native window paints dark instead of white during load/transition gaps.
  backgroundColor: '#17161d',
  // DEV ONLY: uncomment to load the live site instead of the bundle.
  // server: { url: 'https://reso-pnjj.vercel.app', cleartext: false },
};

export default config;
