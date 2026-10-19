// Android Slice A1 · Capacitor feasibility spike (not a production architecture decision; ADR-0008 is unchanged).
// The Android shell loads the bundled Vite build (dist/) from the device: never a remote server.url, never Netlify.
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.sollelio.beautyos.spike',   // non-production id, for the spike only
  appName: 'Beauty OS Spike',
  webDir: 'dist',
}

export default config
