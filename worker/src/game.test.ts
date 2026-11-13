import { afterEach, describe, expect, test, vi } from "vitest";
import type { Fighter } from "../../server/battle.ts";
import { NoFactsError, readOpening, replay, teamsFromFacts, type Opening } from "../../server/game.ts";
import { GUEST, HOST, fakeGitHub, unreachable } from "./fake-github.test-helper.ts";
import { gameResponse, openingIn } from "./game.ts";
import { STORED_KEY, STORED_V1, STORED_V2 } from "./stored-openings.test-helper.ts";

const READ_AT = "2026-11-10T12:00:00.000Z";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function opened(body: string): Promise<Opening> {
  const opening = await openingIn(body, STORED_KEY);
  if (typeof opening === "string") throw new Error(opening);
  return opening;
}

describe("a stored opening post", () => {
  // Regression guarded: a match's teams can only be worked out again while GitHub still
  // answers and still says what it said then; repos change, so old results drift.
  test("rebuilds the same teams from its facts when GitHub is unreachable", async () => {
    vi.stubGlobal("fetch", unreachable);
    const opening = await opened(STORED_V2);
    const rebuilt = teamsFromFacts(opening);

    // The post was written before cards had a `home` mark. The mark changes no number,
    // so a rebuild that adds it still plays the same match.
    const withoutHome = (team: Fighter[]) => team.map((fighter) => {
      const copy: Partial<Fighter> = { ...fighter };
      delete copy.home;
      return copy;
    });
    expect({ a: withoutHome(rebuilt.a), b: withoutHome(rebuilt.b) }).toEqual(opening.teams);
    expect([...rebuilt.a, ...rebuilt.b].map((f) => f.home)).toEqual([false, false, false, false, false, false]);
    // The host fielded four cards and was cut to three: the specialist perk counted the
    // three web cards among all four, so the two web cards left still carry it.
    expect(rebuilt.a.map((f) => [f.fullName, f.attack, f.perk, f.wildcard ?? false])).toEqual([
      ["greendale/dreamatorium", 103, true, false],
      ["troy-barnes/blanket-fort", 67, true, true],
      ["inspector-spacetime/constables", 101, false, true],
    ]);
    expect(rebuilt.b.map((f) => f.fullName)).toEqual(["greendale/paintball-assassin", "greendale/human-being", "city-college/mascot"]);
  });

  test("carries what GitHub said when the match opened", async () => {
    vi.stubGlobal("fetch", unreachable);
    const opening = await opened(STORED_V2);
    if (opening.v !== 2) throw new Error(`expected a v2 opening, got v${opening.v}`);
    const { a, b } = opening.facts;

    expect([a.readAt, a.ace, a.source, a.character?.name, a.character?.klass]).toEqual([READ_AT, "greendale/dreamatorium", "profile", "Abed", "specialist"]);
    expect([b.readAt, b.ace, b.source, b.character]).toEqual([READ_AT, "greendale/paintball-assassin", "pinned", null]);
    // The post holds looks in the old six-number shape; they come back as today's parts.
    expect(opening.players.a.look).toEqual({ skin: "#6b4429", hair: "side-part", hairColor: "#3f6fd8", top: "sweater", topColor: "#d9482b", beard: "full", glasses: "none", hat: "none", headphones: "no" });
    expect(a.character?.look).toEqual(opening.players.a.look);
    expect(opening.players.b.look).toEqual({ skin: "#ecc09c", hair: "bun", hairColor: "#1d1b1a", top: "sweater", topColor: "#3a4049", beard: "none", glasses: "round", hat: "none", headphones: "no" });
    expect(a.repos.map((r) => [r.fullName, r.stars, r.forks, r.language, r.topics, r.pushedAt])).toEqual([
      ["greendale/dreamatorium", 4200, 310, "TypeScript", ["simulation", "game"], "2026-11-01T09:00:00Z"],
      ["troy-barnes/blanket-fort", 260, 12, "JavaScript", ["web"], "2025-02-02T00:00:00Z"],
      ["inspector-spacetime/constables", 15000, 2100, "Python", ["ai", "data"], "2026-10-30T00:00:00Z"],
      ["cougar-town/kickpuncher", 830, 41, "TypeScript", ["cli"], "2026-06-15T00:00:00Z"],
    ]);
  });

  test("from before the facts were stored still verifies and plays, and raises NoFactsError when rebuilt", async () => {
    vi.stubGlobal("fetch", unreachable);
    const opening = await opened(STORED_V1);

    expect(opening.v).toBe(1);
    const state = replay(opening, "D_thread", [], Date.parse(READ_AT));
    expect([state.status, state.teams.a.length, state.teams.b.length]).toEqual(["waiting", 3, 3]);
    expect(() => teamsFromFacts(opening)).toThrow(NoFactsError);
  });

  test("is refused when its facts were edited", async () => {
    const found = readOpening(STORED_V2)!;
    const json = atob(found.payload.replace(/-/g, "+").replace(/_/g, "/"));
    const edited = btoa(json.replace('"stars":4200', '"stars":99999')).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(edited).not.toBe(found.payload);

    expect(await openingIn(STORED_V2.replace(found.payload, edited), STORED_KEY)).toBe("This battle's opening post was changed, so the match can't be trusted.");
  });
});

describe("a new challenge", () => {
  // Regression guarded: the Worker writes an opening whose facts don't rebuild its own
  // teams (a fact missed, the time of reading lost, the facts cut with the teams).
  test("writes facts that rebuild its own teams when GitHub is unreachable afterwards", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(READ_AT));
    vi.stubGlobal("fetch", fakeGitHub);
    const response = await gameResponse("game/new", new URLSearchParams({ a: HOST, b: GUEST }), "token", STORED_KEY);
    const { body } = (await response.json()) as { body: string };

    vi.setSystemTime(new Date("2027-05-01T00:00:00Z"));
    vi.stubGlobal("fetch", unreachable);
    const opening = await opened(body);

    if (opening.v !== 2) throw new Error(`expected a v2 opening, got v${opening.v}`);
    expect(opening.facts.a.repos.map((r) => r.topics)).toEqual([["simulation", "game"], ["web"], ["ai", "data"], ["cli"]]);
    expect(teamsFromFacts(opening)).toEqual(opening.teams);
    expect(opening.teams.a.map((f) => f.attack)).toEqual([103, 67, 101]);
  });
});
