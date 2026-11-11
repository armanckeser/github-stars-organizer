import { describe, expect, test } from "vitest";
import { fighterFor, type RepoFacts } from "./battle.ts";
import { botAction, expectedDamage } from "./bot.ts";
import { defaultLook } from "./character.ts";
import { ENERGY_FOR_SPECIAL, legalActions, rollFor, startGame, type GameState, type Opening } from "./game.ts";

const NOW = Date.parse("2026-11-10T00:00:00Z");

function facts(fullName: string, extra: Partial<RepoFacts> = {}): RepoFacts {
  return {
    fullName, description: null, stars: 5000, forks: 300, language: "TypeScript", color: null, avatarUrl: null,
    isArchived: false, createdAt: "2022-01-01T00:00:00Z", pushedAt: "2026-11-07T00:00:00Z", openIssues: 50, closedIssues: 450,
    releases: 12, contributors: 40, commits: 2000, ...extra,
  };
}
const card = (name: string, extra: Partial<RepoFacts> = {}) => fighterFor(facts(name, extra), "nobody", NOW);
const player = (login: string) => ({ login, name: login, klass: "rookie" as const, look: defaultLook(login), level: 1, avatarUrl: null });

// Always the smart branch (0 is under the skill), and never the random guard.
const smart = () => 0;
const always = (value: number) => () => value;

function game(a: ReturnType<typeof card>[], b: ReturnType<typeof card>[], seed = "seed"): GameState {
  const opening: Opening = { v: 1, players: { a: player("me"), b: player("bot") }, teams: { a, b } };
  const state = startGame(opening, seed);
  // The bot plays b; make it b's turn.
  return { ...state, next: "b" };
}

describe("the bot", () => {
  test("waits when it isn't its turn", () => {
    const state = game([card("a/x")], [card("b/x")]);
    expect(botAction({ ...state, next: "a" }, "seed", "b", smart)).toBeNull();
  });

  test("uses the special when charged, since the special hits harder", () => {
    const state = game([card("a/x")], [card("b/x")]);
    const charged = { ...state, sides: { ...state.sides, b: { ...state.sides.b, energy: [ENERGY_FOR_SPECIAL] } } };
    expect(expectedDamage(charged, "seed", "b", { kind: "special" })).toBeGreaterThan(expectedDamage(charged, "seed", "b", { kind: "attack" }));
    const seed = Array.from({ length: 50 }, (_, i) => `s${i}`).find((s) => !rollFor(s, charged.turn + 1).critical)!;
    expect(botAction(charged, seed, "b", smart)).toEqual({ kind: "special" });
  });

  test("keeps the charge when a plain attack already knocks the card out", () => {
    const state = game([card("a/x")], [card("b/x")]);
    const finishing = { ...state, sides: { a: { ...state.sides.a, hp: [1] }, b: { ...state.sides.b, energy: [ENERGY_FOR_SPECIAL] } } };
    const seed = Array.from({ length: 50 }, (_, i) => `s${i}`).find((s) => !rollFor(s, finishing.turn + 1).critical)!;
    expect(botAction(finishing, seed, "b", smart)).toEqual({ kind: "attack" });
  });

  test("switches out of a bad matchup while its card is above half HP", () => {
    // Python (data) beats Rust (systems); the bot leads with Rust and has Shell on the bench, which Python doesn't beat.
    const state = game([card("a/py", { language: "Python" })], [card("b/rust", { language: "Rust" }), card("b/sh", { language: "Shell" })]);
    expect(botAction(state, "seed", "b", smart)).toEqual({ kind: "switch", to: 1 });
    const hurt = { ...state, sides: { ...state.sides, b: { ...state.sides.b, hp: [Math.floor(state.teams.b[0].hp / 2), state.teams.b[1].hp] } } };
    expect(botAction(hurt, "seed", "b", smart)?.kind).not.toBe("switch");
  });

  test("guards some of the time when the other side's next roll is a critical", () => {
    const seed = Array.from({ length: 400 }, (_, i) => `g${i}`).find((s) => rollFor(s, 2).critical && !rollFor(s, 1).critical)!;
    const state = game([card("a/x")], [card("b/x")], seed);
    expect(botAction(state, seed, "b", always(0.4))).toEqual({ kind: "guard" });
    expect(botAction(state, seed, "b", always(0.6))?.kind).toBe("attack");
  });

  test("otherwise plays a random legal action", () => {
    const state = game([card("a/x")], [card("b/x"), card("b/y")]);
    const legal = legalActions(state, "b");
    const seen = new Set(Array.from({ length: 40 }, (_, i) => {
      let calls = 0;
      // The first draw misses the skill check; the second picks the action.
      const random = () => (calls++ === 0 ? 0.9 : i / 40);
      return JSON.stringify(botAction(state, "seed", "b", random));
    }));
    expect(seen.size).toBe(legal.length);
  });
});
