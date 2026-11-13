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

/** The Worker's secrets, as `wrangler secret put` sets them. */
type Secrets = { GITHUB_TOKEN: string; BATTLE_KEY?: string; NO_PLAY?: string };
const SECRETS: Secrets = { GITHUB_TOKEN: "a-token", BATTLE_KEY: KEY };

/**
 * One request to the Worker. Work it hands to `waitUntil` (cache writes) is finished
 * before this returns. `body` is the reply read as JSON, or empty when it isn't JSON;
 * `text` is the reply as it came.
 */
export async function callWorker(path: string, body?: unknown, secrets: Partial<Secrets> = {}): Promise<{ status: number; body: Record<string, unknown>; text: string }> {
  const pending: Promise<unknown>[] = [];
  // The Worker only calls waitUntil; the rest of ExecutionContext is never touched.
  const context = { waitUntil: (promise: Promise<unknown>) => void pending.push(promise), passThroughOnException: () => {} } as unknown as ExecutionContext;
  const request = new Request(`${ORIGIN}${path}`, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
  const response = await worker.fetch(request, { ...SECRETS, ...secrets }, context);
  await Promise.all(pending);
  const text = await response.text();
  const isJson = (response.headers.get("Content-Type") ?? "").includes("application/json");
  return { status: response.status, body: isJson ? (JSON.parse(text) as Record<string, unknown>) : {}, text };
}
