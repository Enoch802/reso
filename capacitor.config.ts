import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.reso.app',
  appName: 'Reso',
  // The bundled web assets shipped inside the APK. cap sync copies the
  // production build here — the app is fully offline-capable.
  webDir: 'public',
  // DEV ONLY: uncomment to load the live site instead of the bundle when
  // iterating on web changes without a rebuild. NEVER commit enabled —
  // it turns the app into a thin client that dies without internet.
  // server: { url: 'https://reso-pnjj.vercel.app', cleartext: false },
};

export default config;
