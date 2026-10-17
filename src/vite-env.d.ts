/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  // "1" builds the static, server-less demo (see src/lib/demo.ts).
  readonly VITE_DEMO?: string;
  // "1" builds the app the npx CLI serves (see src/lib/mode.ts).
  readonly VITE_LOCAL?: string;
}

/** cli/package.json's version, set by vite.config.ts. */
declare const __APP_VERSION__: string;
