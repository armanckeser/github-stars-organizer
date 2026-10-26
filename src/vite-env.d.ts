/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  // "1" builds the static, server-less demo (see src/lib/demo.ts).
  readonly VITE_DEMO?: string;
}
