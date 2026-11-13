import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Fighter } from "../../server/battle.ts";
import { defaultCharacter } from "../../server/character.ts";
import { OPPONENTS, type RunFighter } from "../../server/run/rules.ts";
import { rarityOf } from "../../server/run/stats.ts";
import type { Card } from "../../server/run/types.ts";
import type { RunPool } from "./battle.ts";
import { runResponse, type RunDeps } from "./run.ts";
import { fakeGitHubWhere } from "./fake-github.test-helper.ts";
import { teamPreview, teamResponse } from "./team.ts";
import { callWorker, memoryCaches, memoryDataset } from "./worker-host.test-helper.ts";

// The share picture's assets are bundled by wrangler and can't load in Node; nothing here draws a picture.
vi.mock("@resvg/resvg-wasm/index_bg.wasm", () => ({ default: new Uint8Array() }));
vi.mock("./SpaceGrotesk-Bold.ttf", () => ({ default: new ArrayBuffer(0) }));

// A finished run's team: saved by the Worker after it replays the run, read back from
// the share link's token, and played against from "Beat this team". GitHub is faked
// at the boundary the Worker hands a run (`read`); a real fetch fails the test.

const KEY = "the-key-to-greendale";
const NOW = Date.parse("2026-11-11T12:00:00Z");
const PLAYER = "greendale";
const CHALLENGER = "city-college";
const POOL = 21;

const fighter = (fullName: string, over: Partial<Fighter>): RunFighter => {
  const base: Fighter = {
    fullName, description: null, language: "TypeScript", color: null, avatarUrl: null, stars: 50, contributors: 1, commits: 1, age: 1, health: 5,
    type: "web", weakness: null, resistance: null, level: 10, hp: 100, attack: 40, defense: 30, speed: 20,
    moves: [{ name: "Hot Reload", power: 1, damage: 20 }, { name: "Hotfix", power: 1.6, damage: 30 }], shiny: false, home: false, retired: false, perk: false, ...over,
  };
  const card: Card = { fullName, type: base.type, sets: [], rarity: rarityOf(base.stars), hp: base.hp, attack: base.attack, guard: base.defense, speed: base.speed, range: 1, ability: "none", shiny: false };
  return { ...base, card };
};

const poolOf = (login: string, over: Partial<Fighter>): RunPool => ({
  login, avatarUrl: null, source: "stars",
  character: { ...defaultCharacter(login), level: 1, since: null, followers: 0, ownStars: 0, custom: false },
  team: Array.from({ length: POOL }, (_, i) => fighter(`${login}/repo-${i}`, over)),
  facts: { readAt: new Date(NOW).toISOString(), character: null, ace: null, source: "stars", repos: [] },
});

const STRONG = { hp: 1000, attack: 400, defense: 100, speed: 100 };
const WEAK = { hp: 50, attack: 5, defense: 5, speed: 5 };

/**
 * The player's cards are `strengths[login]`, everyone else's weak; every read is noted in `reads`;
 * `optedOut` have a `stard/no-play` file; every counted event is noted in `counted`.
 */
function depsFor(strengths: Record<string, Partial<Fighter>>, reads: string[] = [], optedOut: string[] = [], counted: string[] = []): RunDeps {
  return {
    key: KEY,
    now: NOW,
    count: (event) => void counted.push(event),
    read: async (login) => {
      reads.push(login);
      return poolOf(login, strengths[login] ?? WEAK);
    },
    optedOut: async (logins) => logins.map((login) => login.toLowerCase()).filter((login) => optedOut.includes(login)),
  };
}

type Saved = { token: string; error: string; team: { login: string; day: string; wins: number; losses: number; fighters: { fullName: string; card: { attack: number } }[]; rounds: { units: { fighter: number; col: number; row: number }[]; boosts: string[] }[] } };

/** A round where the team is just the ace, up close in the front row. */
const aceOnly = (login = PLAYER) => ({ units: [{ repo: `${login}/repo-0`, col: 1, row: 0 }], boosts: [] });

async function post(body: unknown, deps: RunDeps): Promise<{ status: number; body: Saved }> {
  const request = new Request("https://stars-demo.example/api/run/team", { method: "POST", body: JSON.stringify(body) });
  const response = await teamResponse(request, new URL(request.url), deps);
  return { status: response.status, body: (await response.json()) as Saved };
}

async function read(token: string, deps: RunDeps): Promise<{ status: number; body: Saved["team"] & { error: string } }> {
  const url = new URL(`https://stars-demo.example/api/run/team?t=${encodeURIComponent(token)}`);
  const response = await teamResponse(new Request(url), url, deps);
  return { status: response.status, body: (await response.json()) as Saved["team"] & { error: string } };
}

// A team link's token is deflated JSON in base64url; these open and close one the way an editing player would.
const piped = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
async function inflated(payload: string): Promise<string> {
  const bytes = Uint8Array.from(atob(payload.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(await piped(bytes, new DecompressionStream("deflate-raw")));
}
async function deflated(text: string): Promise<string> {
  const bytes = await piped(new TextEncoder().encode(text), new CompressionStream("deflate-raw"));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function savedStrongTeam(): Promise<string> {
  const { status, body } = await post({ login: PLAYER, rounds: Array.from({ length: 5 }, () => aceOnly()) }, depsFor({ [PLAYER]: STRONG }));
  expect(status).toBe(200);
  return body.token;
}

beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("A team test reached the network.");
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/run/team", () => {
  it("saves a finished run's team with the record its fights give, and the link reads the same team back", async () => {
    // Regression guarded: a share link that doesn't reopen the team the run ended with.
    const token = await savedStrongTeam();
    const { status, body } = await read(token, depsFor({}));
    expect(status).toBe(200);
    expect(body).toMatchObject({ login: PLAYER, day: "2026-11-11", wins: 5, losses: 0 });
    expect(body.fighters.map((card) => card.fullName)).toEqual(["greendale/repo-0"]);
    expect(body.rounds).toHaveLength(5);
    expect(body.rounds[4]).toEqual({ units: [{ fighter: 0, col: 1, row: 0 }], boosts: [] });
  });

  it("freezes each card's numbers as the Worker read them for the day", async () => {
    // Regression guarded: a team link that read the repos again would change the team when the repos change.
    const token = await savedStrongTeam();
    const later = await read(token, depsFor({ [PLAYER]: { attack: 1 } }));
    expect(later.body.fighters[0].card.attack).toBe(400);
  });

  it("counts the record from the Worker's own replay of the fights", async () => {
    // Regression guarded: a weak team claiming five wins. A team of 1-HP cards loses rounds 1 to 3, so the run ends there.
    const weak = await post({ login: PLAYER, rounds: Array.from({ length: 5 }, () => aceOnly()) }, depsFor({ [PLAYER]: { hp: 1, attack: 1, defense: 1, speed: 1 } }));
    expect(weak.status).toBe(422);
    expect(weak.body.error).toBe("The run was over before round 4.");
  });

  it("refuses a card that isn't one of the player's cards for the day", async () => {
    // Regression guarded: a forged legendary on a shared team.
    const rounds = [...Array.from({ length: 4 }, () => aceOnly()), { units: [{ repo: "torvalds/linux", col: 1, row: 0 }], boosts: [] }];
    const { status, body } = await post({ login: PLAYER, rounds }, depsFor({ [PLAYER]: STRONG }));
    expect(status).toBe(422);
    expect(body.error).toBe("torvalds/linux isn't one of greendale's cards today.");
  });

  const cardsInFront = (count: number) => ({ units: Array.from({ length: count }, (_, i) => ({ repo: `${PLAYER}/repo-${i}`, col: i, row: 0 })), boosts: [] });

  it("saves a round 1 board of 3 cards, when the 4 starting gold bought a third slot", async () => {
    // Regression guarded: a run that bought a board slot (the shop's + Slot) could never be shared.
    const { status, body } = await post({ login: PLAYER, rounds: [cardsInFront(3), ...Array.from({ length: 4 }, () => aceOnly())] }, depsFor({ [PLAYER]: STRONG }));
    expect(status).toBe(200);
    expect(body.team.rounds[0].units).toHaveLength(3);
  });

  it("refuses more cards than the round's board could hold with every slot the gold could buy", async () => {
    const { status, body } = await post({ login: PLAYER, rounds: [cardsInFront(4), ...Array.from({ length: 4 }, () => aceOnly())] }, depsFor({ [PLAYER]: STRONG }));
    expect(status).toBe(422);
    expect(body.error).toBe("A team holds 1 to 3 cards in round 1.");
  });

  it("refuses a link for an account that opted out of being played against", async () => {
    // Regression guarded: a stard/no-play account's cards reaching other players through a team link.
    const reads: string[] = [];
    const { status, body } = await post({ login: PLAYER, rounds: Array.from({ length: 5 }, () => aceOnly()) }, depsFor({ [PLAYER]: STRONG }, reads, [PLAYER]));
    expect(status).toBe(422);
    expect(body.error).toBe("greendale has asked not to be played against, so their team gets no link.");
    // A blocked account's stars are never read, not even to be refused.
    expect(reads).toEqual([]);
  });

  it("refuses a boost before the round that offers one", async () => {
    const boosted = { ...aceOnly(), boosts: ["head-start"] };
    const { status, body } = await post({ login: PLAYER, rounds: [aceOnly(), boosted, ...Array.from({ length: 3 }, () => aceOnly())] }, depsFor({ [PLAYER]: STRONG }));
    expect(status).toBe(422);
    expect(body.error).toBe("Round 2's boosts don't follow the run.");
  });

  it("refuses a run that isn't over", async () => {
    const { status, body } = await post({ login: PLAYER, rounds: [aceOnly(), aceOnly()] }, depsFor({ [PLAYER]: STRONG }));
    expect(status).toBe(422);
    expect(body.error).toBe("The run isn't over yet.");
  });

  it("replays 8 rounds rather than refusing them for their length, since a draw counts for neither side", async () => {
    // Regression guarded: a run with a draw in it lasted 8 rounds and its team was refused for its length.
    // A run can't be steered into a draw from here, so this one is won by round 5: the replay, not the length check, refuses it.
    const { status, body } = await post({ login: PLAYER, rounds: Array.from({ length: 8 }, () => aceOnly()) }, depsFor({ [PLAYER]: STRONG }));
    expect(body.error).toBe("The run was over before round 6.");
    expect(status).toBe(422);
  });

  it("refuses more rounds than any run could take to replay", async () => {
    const { status, body } = await post({ login: PLAYER, rounds: Array.from({ length: 21 }, () => aceOnly()) }, depsFor({ [PLAYER]: STRONG }));
    expect(status).toBe(400);
    expect(body.error).toBe("A run has 1 to 20 rounds.");
  });
});

describe("GET /api/run/team", () => {
  it("refuses a team link whose team was edited", async () => {
    // Regression guarded: a player editing their shared team's numbers in the link.
    const token = await savedStrongTeam();
    const [payload, signature] = token.split(".");
    const team = JSON.parse(await inflated(payload)) as { wins: number };
    const edited = await deflated(JSON.stringify({ ...team, wins: 9 }));
    const { status, body } = await read(`${edited}.${signature}`, depsFor({}));
    expect(status).toBe(403);
    expect(body.error).toBe("This team link was changed, so the team can't be trusted.");
  });

  it("refuses a link once the team's account has opted out of being played against", async () => {
    const token = await savedStrongTeam();
    const { status, body } = await read(token, depsFor({}, [], [PLAYER]));
    expect(status).toBe(403);
    expect(body.error).toBe("greendale has asked not to be played against.");
  });

  it("refuses a run's token passed off as a team link", async () => {
    const request = new Request("https://stars-demo.example/api/run/new", { method: "POST", body: JSON.stringify({ login: PLAYER }) });
    const run = (await (await runResponse("new", request, depsFor({}))).json()) as { token: string };
    const { status } = await read(run.token, depsFor({}));
    expect(status).toBe(403);
  });
});

describe("Beat this team", () => {
  it("plays a Worker run's rounds against the saved team, not a well-known account", async () => {
    // Regression guarded: "Beat this team" starting a run against the usual opponents.
    const token = await savedStrongTeam();
    const reads: string[] = [];
    const deps = depsFor({}, reads);
    const start = new Request("https://stars-demo.example/api/run/new", { method: "POST", body: JSON.stringify({ login: CHALLENGER, against: token }) });
    const started = (await (await runResponse("new", start, deps)).json()) as { token: string; run: { opponent: string } };
    expect(started.run.opponent).toBe(PLAYER);

    const fight = new Request("https://stars-demo.example/api/run/act", { method: "POST", body: JSON.stringify({ token: started.token, fight: true }) });
    const played = (await (await runResponse("act", fight, deps)).json()) as { run: { losses: number }; fight: { opponent: { login: string }; teams: [unknown, { units: { card: { attack: number } }[] }] } };
    expect(played.fight.opponent.login).toBe(PLAYER);
    expect(played.fight.teams[1].units.map((unit) => unit.card.attack)).toEqual([400]);
    expect(played.run.losses).toBe(1);
    expect(reads.filter((login) => OPPONENTS.includes(login))).toEqual([]);
  });

  it("saves a run played against a saved team by replaying it against that team", async () => {
    // Against the strong saved team, a weak challenger loses three rounds straight.
    const against = await savedStrongTeam();
    const reads: string[] = [];
    const rounds = Array.from({ length: 3 }, () => aceOnly(CHALLENGER));
    const { status, body } = await post({ login: CHALLENGER, rounds, against }, depsFor({}, reads));
    expect(status).toBe(200);
    expect(body.team).toMatchObject({ login: CHALLENGER, wins: 0, losses: 3 });
    expect(reads).toEqual([CHALLENGER]);
  });

  it("refuses a Worker run against a saved team whose account has opted out since", async () => {
    const token = await savedStrongTeam();
    const start = new Request("https://stars-demo.example/api/run/new", { method: "POST", body: JSON.stringify({ login: CHALLENGER, against: token }) });
    const response = await runResponse("new", start, depsFor({}, [], [PLAYER]));
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: string }).error).toBe("greendale has asked not to be played against.");
  });

  it("refuses a run whose saved team link was made up", async () => {
    const { status, body } = await post({ login: CHALLENGER, rounds: [aceOnly(CHALLENGER)], against: "made.up" }, depsFor({}));
    expect(status).toBe(403);
    expect(body.error).toBe("This team link was changed, so the team can't be trusted.");
  });
});

// The Workers runtime's HTMLRewriter, which Node lacks: it hands the page back as it
// is, and notes the title it set and the tags it added to the head.
const rewritten: { title: string[]; head: string[] } = { title: [], head: [] };
class RecordingRewriter {
  private readonly handlers: [string, { element: (element: { remove: () => void; setInnerContent: (text: string) => void; append: (html: string) => void }) => void }][] = [];
  on(selector: string, handler: RecordingRewriter["handlers"][number][1]) {
    this.handlers.push([selector, handler]);
    return this;
  }
  transform(response: Response) {
    const element = (selector: string) => ({ remove: () => {}, setInnerContent: (text: string) => void rewritten.title.push(text), append: (html: string) => void (selector === "head" && rewritten.head.push(html)) });
    for (const [selector, handler] of this.handlers) handler.element(element(selector));
    return response;
  }
}
beforeEach(() => {
  rewritten.title = [];
  rewritten.head = [];
});
/** GitHub for the opt-out check, and the static host's page for everything else. */
function pagesAndGitHub(): typeof fetch {
  const github = fakeGitHubWhere({ noPlay: [] }).fetch;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const address = input instanceof Request ? input.url : String(input);
    if (address.startsWith("https://api.github.com/")) return github(input, init);
    return new Response("<html><head><title>Stard</title></head></html>", { headers: { "Content-Type": "text/html" } });
  }) as typeof fetch;
}

describe("the team counters", () => {
  it("counts a saved team once the Worker has signed it", async () => {
    // Regression guarded: no count of team links made, so the launch couldn't tell whether anyone shared a team.
    const counted: string[] = [];
    const { status } = await post({ login: PLAYER, rounds: Array.from({ length: 5 }, () => aceOnly()) }, depsFor({ [PLAYER]: STRONG }, [], [], counted));
    expect(status).toBe(200);
    expect(counted).toEqual(["team_saved"]);
  });

  it("doesn't count a team the Worker refused to save", async () => {
    const counted: string[] = [];
    const { status } = await post({ login: PLAYER, rounds: Array.from({ length: 5 }, () => aceOnly()) }, depsFor({ [PLAYER]: WEAK }, [], [], counted));
    expect(status).toBe(422);
    expect(counted).toEqual([]);
  });

  it("counts a team link opened on its page", async () => {
    const token = await savedStrongTeam();
    vi.stubGlobal("fetch", pagesAndGitHub());
    vi.stubGlobal("caches", memoryCaches());
    vi.stubGlobal("HTMLRewriter", RecordingRewriter);
    const events = memoryDataset();
    const { status } = await callWorker(`/team?t=${encodeURIComponent(token)}`, undefined, { EVENTS: events });
    expect(status).toBe(200);
    expect(events.points).toEqual([{ blobs: ["team_opened", "", "stars-demo.example"], doubles: [0], indexes: ["team_opened"] }]);
  });

  it("doesn't count a link whose team can't be opened", async () => {
    // Regression guarded: counting every /team request, made-up links included, as an opened team.
    vi.stubGlobal("fetch", pagesAndGitHub());
    vi.stubGlobal("caches", memoryCaches());
    vi.stubGlobal("HTMLRewriter", RecordingRewriter);
    const events = memoryDataset();
    const { status } = await callWorker("/team?t=made.up", undefined, { EVENTS: events });
    expect(status).toBe(200);
    expect(events.points).toEqual([]);
  });
});

async function openedPage(path: string): Promise<{ title: string[]; head: string[] }> {
  vi.stubGlobal("fetch", pagesAndGitHub());
  vi.stubGlobal("caches", memoryCaches());
  vi.stubGlobal("HTMLRewriter", RecordingRewriter);
  const { status } = await callWorker(path);
  expect(status).toBe(200);
  return rewritten;
}

describe("a challenge link's page", () => {
  it("names the challenger and the friend in the title and keeps the friend on the link", async () => {
    // Regression guarded: a challenge pasted in a chat previews as any team, so the friend can't see it's for them.
    const token = await savedStrongTeam();
    const page = await openedPage(`/team?t=${encodeURIComponent(token)}&to=annie`);
    expect(page.title).toEqual(["@greendale challenges @annie · Stard"]);
    expect(page.head[0]).toContain('<meta property="og:title" content="@greendale challenges @annie · Stard" />');
    expect(page.head[0]).toContain(`<meta property="og:url" content="https://stars-demo.example/team?t=${encodeURIComponent(token)}&amp;to=annie" />`);
  });

  it("ignores a friend that isn't a username", async () => {
    // Regression guarded: markup in "to" written into the page's title and tags.
    const token = await savedStrongTeam();
    const page = await openedPage(`/team?t=${encodeURIComponent(token)}&to=${encodeURIComponent("<script>")}`);
    expect(page.title).toEqual(["A team from @greendale's stars · Stard"]);
    expect(page.head[0]).toContain(`<meta property="og:url" content="https://stars-demo.example/team?t=${encodeURIComponent(token)}" />`);
  });
});

describe("a team link's preview", () => {
  // Regression guarded: the preview read "greendale's team · Stard run", as if greendale
  // had played, when anyone can type any username and draft a team from its stars.
  it("names whose stars the team came from, its record and its cards", async () => {
    const { body } = await post({ login: PLAYER, rounds: Array.from({ length: 5 }, () => aceOnly()) }, depsFor({ [PLAYER]: STRONG }));
    expect(teamPreview(body.team as Parameters<typeof teamPreview>[0])).toEqual({
      title: "A team from @greendale's stars · Stard",
      description: "5 wins, 0 losses, with repo-0. Beat this team on Stard.",
      alt: "A team of repo cards from @greendale's stars, 5 wins, 0 losses",
    });
  });
});

describe("GET /api/card/team.png", () => {
  it("refuses the picture of a team whose account has a stard/no-play file", async () => {
    // Regression guarded: the picture opened the token without asking about the opt-out,
    // so an opted-out account's team kept showing in every chat it was posted to.
    const token = await savedStrongTeam();
    vi.stubGlobal("fetch", fakeGitHubWhere({ noPlay: [PLAYER] }).fetch);
    vi.stubGlobal("caches", memoryCaches());
    const { status, text } = await callWorker(`/api/card/team.png?t=${encodeURIComponent(token)}`);
    expect(status).toBe(403);
    expect(text).toBe("greendale has asked not to be played against.");
  });

  it("refuses a picture already in the edge cache once the account is on the block list", async () => {
    // Regression guarded: the cache was read before the opt-out, so a picture drawn once
    // was served for a day after its account asked not to be played.
    const token = await savedStrongTeam();
    const holdsEveryPicture = { default: { match: async () => new Response("an old picture", { headers: { "Content-Type": "image/png" } }), put: async () => {} } };
    vi.stubGlobal("caches", holdsEveryPicture);
    const { status, text } = await callWorker(`/api/card/team.png?t=${encodeURIComponent(token)}`, undefined, { NO_PLAY: "Greendale" });
    expect(status).toBe(403);
    expect(text).toBe("greendale has asked not to be played against.");
  });
});
