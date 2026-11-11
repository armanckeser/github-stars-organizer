import { describe, expect, test } from "vitest";
import { fighterFor, type RepoFacts } from "./battle.ts";
import { defaultLook } from "./character.ts";
import {
  ENERGY_FOR_SPECIAL, TURN_CLOCK_MS, applyAction, decodeOpening, encodeOpening, legalActions, moveComment, openingBody, readOpening, replay, replyComment, rollFor, startGame,
  type Action, type GameComment, type GameState, type Opening,
} from "./game.ts";

const NOW = Date.parse("2026-11-10T00:00:00Z");
const SEED = "D_thread";

function facts(fullName: string, extra: Partial<RepoFacts> = {}): RepoFacts {
  return {
    fullName, description: "A tool — with “quotes” and -->", stars: 5000, forks: 300, language: "TypeScript", color: "#3178c6", avatarUrl: null,
    isArchived: false, createdAt: "2022-01-01T00:00:00Z", pushedAt: "2026-11-07T00:00:00Z", openIssues: 50, closedIssues: 450,
    releases: 12, contributors: 40, commits: 2000, ...extra,
  };
}

const player = (login: string) => ({ login, name: login, klass: "rookie" as const, look: defaultLook(login), level: 10, avatarUrl: null });
const team = (owner: string, lead: Partial<RepoFacts> = {}) => [
  fighterFor(facts(`${owner}/one`, lead), "nobody", NOW),
  fighterFor(facts(`${owner}/two`, { language: "Rust" }), "nobody", NOW),
];
// The host's lead card is the quiet one, so the guest moves first unless a test says otherwise.
const opening: Opening = { v: 1, players: { a: player("host"), b: player("guest") }, teams: { a: team("host", { pushedAt: "2024-01-01T00:00:00Z" }), b: team("guest") } };

let clock = 0;
function comment(author: string, body: string, extra: Partial<GameComment> = {}): GameComment {
  clock += 60_000;
  const id = `C${clock}`;
  return { id, author, avatarUrl: null, body, createdAt: new Date(NOW - 3_600_000 + clock).toISOString(), editedBy: null, url: `https://x/${id}`, ...extra };
}

/** Builds a thread move by move, each naming the one before it, as the app does. */
function thread(...moves: [string, Action][]): GameComment[] {
  const comments = [comment("guest", replyComment("accept", "I accept."))];
  let state = replay(opening, SEED, comments, NOW);
  for (const [author, action] of moves) {
    comments.push(comment(author, moveComment(state.turn, action, state.last, `${author} plays.`)));
    state = replay(opening, SEED, comments, NOW);
  }
  return comments;
}

const play = (comments: GameComment[], now = NOW): GameState => replay(opening, SEED, comments, now);
const attack: Action = { kind: "attack" };

describe("the opening post", () => {
  test("carries both teams through an encode and a decode, whatever their text holds", () => {
    const payload = encodeOpening(opening);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeOpening(payload)).toEqual(opening);
    expect(decodeOpening("not-json")).toBeNull();
  });

  test("mentions the challenged player and hides the signed teams", () => {
    const body = openingBody(opening, encodeOpening(opening), "a".repeat(64), "https://app/game");
    expect(body).toContain("@guest, @host challenges you");
    expect(body).toContain("[Play or watch the match](https://app/game)");
    expect(readOpening(body)).toEqual({ payload: encodeOpening(opening), signature: "a".repeat(64) });
    expect(readOpening("just a post")).toBeNull();
  });
});

describe("starting", () => {
  test("waits until the challenged player accepts; the host can't accept for them", () => {
    expect(play([]).status).toBe("waiting");
    expect(play([comment("host", replyComment("accept", "Sure."))]).status).toBe("waiting");
    const started = play([comment("guest", replyComment("accept", "Sure."))]);
    expect(started.status).toBe("active");
    expect(started.next).toBe("b");
    expect(started.forecast.map((r) => r.turn)).toEqual([1, 2, 3]);
  });

  test("the faster lead card moves first", () => {
    const fastHost: Opening = { ...opening, teams: { a: team("host"), b: team("guest", { pushedAt: "2024-01-01T00:00:00Z" }) } };
    expect(replay(fastHost, SEED, [comment("guest", replyComment("accept", "Ok."))], NOW).next).toBe("a");
  });

  test("the side moving second starts with its lead card's special charged", () => {
    const state = replay(opening, SEED, [comment("guest", replyComment("accept", "Ok."))], NOW);
    expect(state.next).toBe("b");
    expect(state.sides.a.energy).toEqual([ENERGY_FOR_SPECIAL, 0]);
    expect(state.sides.b.energy).toEqual([0, 0]);
  });

  test("a game against the computer starts at once, as an accepted challenge would", () => {
    const accepted = replay(opening, SEED, [comment("guest", replyComment("accept", "Ok."))], NOW);
    const started = startGame(opening, SEED);
    expect(started.status).toBe("active");
    expect([started.next, started.sides, started.forecast]).toEqual([accepted.next, accepted.sides, accepted.forecast]);
  });

  test("a decline ends the challenge", () => {
    expect(play([comment("guest", replyComment("decline", "No thanks."))]).status).toBe("declined");
  });
});

describe("turns", () => {
  test("players alternate, an attack hurts the other side's card and charges the special", () => {
    const state = play(thread(["guest", attack], ["host", attack]));
    expect(state.turn).toBe(3);
    expect(state.next).toBe("b");
    expect(state.sides.a.hp[0]).toBeLessThan(opening.teams.a[0].hp);
    expect(state.sides.b.hp[0]).toBeLessThan(opening.teams.b[0].hp);
    expect(state.sides.b.energy[0]).toBe(1);
    expect(state.events.map((e) => [e.side, e.action, e.move])).toEqual([["b", "attack", "Hot Reload"], ["a", "attack", "Hot Reload"]]);
  });

  test("the special needs two attacks first, hits harder and spends the charge", () => {
    expect(legalActions(play(thread(["guest", attack], ["host", attack])), "b").map((a) => a.kind)).not.toContain("special");
    const charged = play(thread(["guest", attack], ["host", attack], ["guest", attack], ["host", attack]));
    expect(legalActions(charged, "b").map((a) => a.kind)).toContain("special");
    const basic = applyAction(charged, SEED, "b", attack, "x", "t").events.at(-1)!;
    const special = applyAction(charged, SEED, "b", { kind: "special" }, "x", "t");
    expect(special.events.at(-1)!.damage).toBeGreaterThan(basic.damage!);
    expect(special.sides.b.energy[0]).toBe(0);
  });

  test("a guard halves the next hit, lasts one turn and can't be repeated", () => {
    const guarded = play(thread(["guest", { kind: "guard" }]));
    const hit = applyAction(guarded, SEED, "a", attack, "x", "t");
    expect(hit.events.at(-1)!.guarded).toBe(true);
    const open = { ...guarded, sides: { ...guarded.sides, b: { ...guarded.sides.b, guarding: false } } };
    const full = applyAction(open, SEED, "a", attack, "x", "t").events.at(-1)!.damage!;
    expect(Math.abs(hit.events.at(-1)!.damage! - full / 2)).toBeLessThanOrEqual(1);
    expect(legalActions(hit, "b").map((a) => a.kind)).not.toContain("guard");
    const after = applyAction(hit, SEED, "b", attack, "x", "t");
    expect(after.sides.b.guarding).toBe(false);
  });

  test("a switch brings in another card and uses the turn", () => {
    const state = play(thread(["guest", { kind: "switch", to: 1 }]));
    expect(state.sides.b.active).toBe(1);
    expect(state.next).toBe("a");
    expect(legalActions(state, "a")).toContainEqual({ kind: "switch", to: 1 });
  });

  test("a knocked-out card is replaced by the next, and the last knockout wins", () => {
    const weak: Opening = { ...opening, teams: { a: opening.teams.a.map((f) => ({ ...f, hp: 1 })), b: opening.teams.b } };
    const comments = [comment("guest", replyComment("accept", "Ok."))];
    let state = replay(weak, SEED, comments, NOW);
    for (const author of ["guest", "host", "guest"]) {
      comments.push(comment(author, moveComment(state.turn, attack, state.last, "hit")));
      state = replay(weak, SEED, comments, NOW);
    }
    expect(state.events[0].knockedOut).toBe(true);
    expect(state.status).toBe("won");
    expect(state.winner).toBe("b");
    expect(state.next).toBeNull();
    expect(legalActions(state, "a")).toEqual([]);
  });

  test("the dice for a turn are the same for everyone and listed ahead", () => {
    expect(rollFor(SEED, 4)).toEqual(rollFor(SEED, 4));
    expect(rollFor(SEED, 4)).not.toEqual(rollFor("other", 4));
    const state = play(thread(["guest", attack]));
    expect(state.forecast[0]).toEqual(rollFor(SEED, 2));
    const roll = rollFor(SEED, 1);
    expect(roll.variance).toBeGreaterThanOrEqual(0.85);
    expect(roll.variance).toBeLessThanOrEqual(1.15);
  });
});

describe("what doesn't count", () => {
  test("a move out of turn, for the wrong turn, or not allowed is ignored", () => {
    const started = thread();
    const state = play(started);
    const tries = [
      comment("host", moveComment(1, attack, state.last, "me first")),
      comment("guest", moveComment(7, attack, state.last, "wrong turn")),
      comment("guest", moveComment(1, { kind: "special" }, state.last, "no charge")),
      comment("guest", moveComment(1, { kind: "switch", to: 0 }, state.last, "already out")),
      comment("guest", moveComment(1, { kind: "switch", to: 9 }, state.last, "no such card")),
    ];
    expect(play([...started, ...tries]).turn).toBe(1);
  });

  test("comments from other people, and players' comments without a move, are chat", () => {
    const comments = [...thread(["guest", attack]), comment("fan", "Go guest! <!-- note -->"), comment("host", "nice one")];
    const state = play(comments);
    expect(state.turn).toBe(2);
    expect(state.chat.map((c) => [c.author, c.text])).toEqual([["guest", "I accept."], ["guest", "guest plays."], ["fan", "Go guest!"], ["host", "nice one"]].filter(([author]) => author === "fan" || author === "host"));
  });

  test("a spectator can't move for a player", () => {
    const started = thread();
    expect(play([...started, comment("fan", moveComment(1, attack, play(started).last, "sneaky"))]).turn).toBe(1);
  });

  test("a repeated move for a turn already played changes nothing", () => {
    const comments = thread(["guest", attack]);
    const repeat = comment("guest", comments[1].body);
    const state = play([...comments, repeat]);
    expect(state.turn).toBe(2);
    expect(state.status).toBe("active");
  });
});

describe("cheating", () => {
  test("a move taken back before the answer is only a take-back", () => {
    const comments = thread(["guest", attack]);
    const retry = [comments[0], comment("guest", moveComment(1, { kind: "guard" }, comments[0].id, "on second thought"))];
    const state = play(retry);
    expect(state.status).toBe("active");
    expect(state.events[0].action).toBe("guard");
  });

  test("removing a move that was answered voids the match", () => {
    const comments = thread(["guest", attack], ["host", attack], ["guest", attack]);
    const state = play(comments.filter((_, i) => i !== 2));
    expect(state.status).toBe("void");
    expect(state.winner).toBeNull();
    expect(state.reason).toMatch(/removed/);
  });

  test("an edited move forfeits for whoever edited, even when the host edits the guest's", () => {
    const comments = thread(["guest", attack], ["host", attack]);
    const selfEdit = comments.map((c, i) => (i === 2 ? { ...c, editedBy: "host" } : c));
    expect(play(selfEdit).winner).toBe("b");
    const hostEditsGuest = comments.map((c, i) => (i === 1 ? { ...c, editedBy: "host" } : c));
    const state = play(hostEditsGuest);
    expect(state.status).toBe("won");
    expect(state.winner).toBe("b");
    expect(state.reason).toMatch(/host edited a move/);
  });

  test("editing the move out of an answered comment is still a forfeit", () => {
    const comments = thread(["guest", attack], ["host", attack]);
    const stripped = comments.map((c, i) => (i === 1 ? { ...c, body: "oops", editedBy: "guest" } : c));
    const state = play(stripped);
    expect(state.status).toBe("won");
    expect(state.winner).toBe("a");
  });

  test("a player who doesn't move for a week loses on the clock", () => {
    const comments = thread(["guest", attack]);
    const late = Date.parse(comments.at(-1)!.createdAt) + TURN_CLOCK_MS + 1;
    const state = play(comments, late);
    expect(state.status).toBe("won");
    expect(state.winner).toBe("b");
    expect(state.reason).toMatch(/7 days/);
    expect(play(comments, late - 2).status).toBe("active");
  });
});
