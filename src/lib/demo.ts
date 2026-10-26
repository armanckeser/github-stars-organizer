// The static demo build (VITE_DEMO=1): no server, no token. It opens on a
// build-time snapshot of one user's public stars, Lists and health scores
// (scripts/build-demo-data.ts) and can swap in anyone else's public stars,
// read straight from GitHub's REST API in the browser.

export const DEMO = import.meta.env.VITE_DEMO === "1";

type DemoSnapshot = {
  user: string;
  generated_at: string;
  repos: Record<string, unknown>[];
  lists: Record<string, unknown>[];
  list_items: Record<string, unknown>[];
};

// A glob rather than a plain import so a normal build, which never runs the
// snapshot script, still compiles when the file does not exist.
const snapshotModules = import.meta.glob<DemoSnapshot>("./demo/demo-data.json", { eager: true, import: "default" });
const snapshot: DemoSnapshot | undefined = DEMO ? Object.values(snapshotModules)[0] : undefined;

export const demoSnapshotUser = snapshot?.user ?? null;

export function demoSeed(): Record<string, readonly Record<string, unknown>[]> {
  return { repos: snapshot?.repos ?? [], lists: snapshot?.lists ?? [], list_items: snapshot?.list_items ?? [] };
}
