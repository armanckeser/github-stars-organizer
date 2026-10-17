// Stands in for @tanstack/browser-db-sqlite-persistence in server and demo
// builds (see vite.config.ts), so they don't ship its 1.7 MB SQLite worker.
// Only the npx build stores rows in the browser; nothing else calls these.

function localBuildOnly(): never {
  throw new Error("Browser storage is only in the npx build.");
}

export const createBrowserWASQLitePersistence = localBuildOnly;
export const openBrowserWASQLiteOPFSDatabase = localBuildOnly;
export const persistedCollectionOptions = localBuildOnly;
export class BrowserCollectionCoordinator {
  constructor() {
    localBuildOnly();
  }
}
