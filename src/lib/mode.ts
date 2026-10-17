// Where the data lives, fixed at build time:
// - "server": Postgres, streamed through Electric, written through the Hono API (self-host).
// - "demo": an in-memory snapshot, no server and no token (VITE_DEMO=1, see demo.ts).
// - "local": the browser's own storage, with GitHub writes going through the npx CLI's
//   localhost server, which holds the user's gh token (VITE_LOCAL=1, see cli/).
export type AppMode = "server" | "demo" | "local";

// A plain expression rather than a function so the bundler folds it to a
// literal and drops the other modes' code from each build.
export const APP_MODE: AppMode =
  import.meta.env.VITE_DEMO === "1" ? "demo" : import.meta.env.VITE_LOCAL === "1" ? "local" : "server";
