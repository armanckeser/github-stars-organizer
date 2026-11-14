/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  // "1" builds the static, server-less demo (see src/lib/demo.ts).
  readonly VITE_DEMO?: string;
  // "1" builds the app the npx CLI serves (see src/lib/mode.ts).
  readonly VITE_LOCAL?: string;
  // "1" builds the app the perf harness measures (e2e/perf/): the board is reachable from the page, as in development.
  readonly VITE_PERF?: string;
}

/** cli/package.json's version, set by vite.config.ts. */
declare const __APP_VERSION__: string;
