import worker from "./index.ts";

// Runs the Worker's own `fetch` the way Cloudflare does, with the edge cache kept in
// memory, so a test goes through the same routing and caching as a real request.

/** The edge cache (`caches.default`), in memory. Only what the Worker calls is here. */
class MemoryCache {
  private readonly entries = new Map<string, Response>();

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    return this.entries.get(keyOf(request))?.clone();
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(keyOf(request), response.clone());
  }
}

const keyOf = (request: RequestInfo | URL) => (request instanceof Request ? request.url : String(request));

export const KEY = "the-key-to-greendale";
const ORIGIN = "https://stars-demo.example";

/** A fresh edge cache, for `vi.stubGlobal("caches", ...)`. */
export const memoryCaches = () => ({ default: new MemoryCache() });

/** One request to the Worker. Work it hands to `waitUntil` (cache writes) is finished before this returns. */
export async function callWorker(path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const pending: Promise<unknown>[] = [];
  // The Worker only calls waitUntil; the rest of ExecutionContext is never touched.
  const context = { waitUntil: (promise: Promise<unknown>) => void pending.push(promise), passThroughOnException: () => {} } as unknown as ExecutionContext;
  const request = new Request(`${ORIGIN}${path}`, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
  const response = await worker.fetch(request, { GITHUB_TOKEN: "a-token", BATTLE_KEY: KEY }, context);
  await Promise.all(pending);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}
