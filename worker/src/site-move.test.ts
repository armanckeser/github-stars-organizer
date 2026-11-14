import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HOST, fakeGitHubWhere } from "./fake-github.test-helper.ts";
import { callWorker, memoryCaches } from "./worker-host.test-helper.ts";

// The game moved from stars-demo.armanckeser.com to stard.armanckeser.com. The old
// address keeps serving its cards (profile READMEs embed them) and sends every page to
// the new address. GitHub and the static site are faked at the network.

vi.mock("@resvg/resvg-wasm/index_bg.wasm", () => ({ default: new Uint8Array() }));
vi.mock("./SpaceGrotesk-Bold.ttf", () => ({ default: new ArrayBuffer(0) }));

const OLD = "https://stars-demo.armanckeser.com";
const NEW = "https://stard.armanckeser.com";
const TEAM_LINK = "/team?t=troy-and-abed-in-the-morning";
const TRAINER = `/api/card/trainer.svg?user=${HOST}&class=specialist&look=2.4.5.1.3.2`;
const SITE_PAGE = "<!doctype html><html><head><title>Stard</title></head><body></body></html>";

// What reached the static site, by address.
let siteReads: string[] = [];

beforeEach(() => {
  siteReads = [];
  const github = fakeGitHubWhere({ noPlay: [] });
  vi.stubGlobal("caches", memoryCaches());
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const address = input instanceof Request ? input.url : String(input);
    if (address === "https://api.github.com/graphql") return github.fetch(input, init);
    siteReads.push(address);
    return new Response(SITE_PAGE, { status: 200, headers: { "Content-Type": "text/html" } });
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("the old address", () => {
  test.each([
    { path: TEAM_LINK, to: `${NEW}${TEAM_LINK}` },
    { path: "/", to: `${NEW}/` },
    { path: "/battle?a=study-group-abed&b=study-group-annie&play=1", to: `${NEW}/battle?a=study-group-abed&b=study-group-annie&play=1` },
    { path: "/compose?user=study-group-abed", to: `${NEW}/compose?user=study-group-abed` },
    // Only /api/ with its slash is the API; a lookalike path is a page.
    { path: "/apiary", to: `${NEW}/apiary` },
  ])("sends $path to the same path and query on the new address", async ({ path, to }) => {
    // Regression guarded: a team or battle link shared before the move landing on a
    // stale page, or losing the query that names the team.
    const { status, headers } = await callWorker(`${OLD}${path}`);
    expect(status).toBe(301);
    expect(headers.get("Location")).toBe(to);
    expect(siteReads).toEqual([]);
  });

  test("still serves a trainer card embedded in a profile README", async () => {
    // Regression guarded: every README card from the old address turning into a
    // broken image (or a redirect GitHub's image proxy may not follow).
    const { status, headers, text } = await callWorker(`${OLD}${TRAINER}`);
    expect(status).toBe(200);
    expect(headers.get("Content-Type")).toContain("image/svg+xml");
    expect(text).toContain("<svg");
  });
});

describe("the new address", () => {
  // /run and /battle add their tags with HTMLRewriter, which only exists in a Worker, so
  // these are the pages that pass through untouched: a team link that doesn't open, and /runs.
  test.each([TEAM_LINK, "/runs"])("passes the page %s through to the site", async (path) => {
    const { status, text } = await callWorker(`${NEW}${path}`);
    expect(status).toBe(200);
    expect(text).toContain("<title>Stard</title>");
    expect(siteReads).toEqual([`${NEW}${path}`]);
  });

  test("serves a trainer card", async () => {
    const { status, headers } = await callWorker(`${NEW}${TRAINER}`);
    expect(status).toBe(200);
    expect(headers.get("Content-Type")).toContain("image/svg+xml");
  });
});

describe("any other address", () => {
  test("passes a page through instead of redirecting it", async () => {
    // A self-hosted Worker or a preview address is not the old host; nothing moves.
    const { status } = await callWorker(`https://stars-demo.greendale.example${TEAM_LINK}`);
    expect(status).toBe(200);
    expect(siteReads).toEqual([`https://stars-demo.greendale.example${TEAM_LINK}`]);
  });
});
