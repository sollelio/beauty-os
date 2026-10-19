// The Android package of the web app (ADR-0011). It loads the bundled Vite build (dist/) from the device: never a remote
// server.url, never Netlify. Per-environment identities (dev: com.sollelio.beautyos.dev) are Gradle flavors.
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.sollelio.beautyos',
  appName: 'Beauty OS',
  webDir: 'dist',
}

export default config
