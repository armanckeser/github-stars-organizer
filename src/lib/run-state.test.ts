import { describe, expect, it } from "vitest";
import type { Fighter } from "../../server/battle";
import { defaultCharacter } from "../../server/character";
import type { Card } from "../../server/run/types";
import type { Player, RunFighter, Unit } from "./run";
import { NO_RUN, runReducer, sceneOf, type Phase, type RunAction, type RunState } from "./run-state";

// The Play run's phases: what each one takes, what it ignores, and that a read for an
// older run never lands on a newer one.

const fighter = (fullName: string, over: Partial<Card> = {}): RunFighter => {
  const base = { fullName, type: "web", hp: 150, attack: 100, defense: 100, speed: 100 } as Fighter;
  return { ...base, card: { fullName, type: "web", sets: [], rarity: 0, hp: 150, attack: 100, guard: 100, speed: 100, range: 1, ability: "none", shiny: false, ...over } };
};
const player = (login: string, names: string[], over: Partial<Card> = {}): Player => ({ login, avatarUrl: null, character: { ...defaultCharacter(login), level: 1 }, team: names.map((name) => fighter(`${login}/${name}`, over)) });

// Abed's ace hits hard enough to win every round against Chang's one card.
const ABED = player("abed", ["dreamatorium", "kickpuncher", "blanket-fort", "paintball", "inspector-spacetime", "cool-cool", "troy-and-abed"], { hp: 5000, attack: 5000 });
const CHANG = player("chang", ["el-tigre", "kevin"]);
const CHANGS_TEAM: Unit[] = [{ fighter: CHANG.team[0], col: 1, row: 0 }];
const PIERCE = player("pierce", ["hawthorne-wipes"]);
const PIERCES_TEAM: Unit[] = [{ fighter: PIERCE.team[0], col: 1, row: 0 }];

const play = (state: RunState, ...actions: RunAction[]) => actions.reduce(runReducer, state);
const begun = (seed: string): RunAction => ({ type: "start", seed, login: "abed" });
const runRead = (seed: string): RunAction => ({ type: "run-read", seed, player: ABED, against: null, opponent: CHANG, theirs: CHANGS_TEAM });
const roundRead = (seed: string, number: number): RunAction => ({ type: "round-read", seed, number, opponent: PIERCE, theirs: PIERCES_TEAM });
/** Fights the round on the board and lets the fight play out. */
const fought = (state: RunState): RunState => {
  const fighting = runReducer(state, { type: "fight" });
  return fighting.phase.kind === "fighting" ? runReducer(fighting, { type: "fight-ended", key: fighting.phase.fight.key }) : fighting;
};
const shopping = () => play(NO_RUN, begun("greendale"), runRead("greendale"));

describe("a new run", () => {
  it("clears the last run's round, opponent, shop and open card at once, keeping only the trainer", () => {
    // Regression guarded: New run left the old opponent, their creatures, the "Round N" HUD
    // and the old shop on screen until the new run's first opponent was read.
    const looking = play(shopping(), { type: "look-shop", slot: 0 }, { type: "look", id: "1:chang/el-tigre" });
    expect(looking.viewing?.kind).toBe("theirs");

    const next = runReducer(looking, begun("city-college"));

    expect(next).toEqual({ seed: "city-college", phase: { kind: "loading-run", login: "abed", trainer: ABED }, selected: null, viewing: null });
    expect(sceneOf(next.phase)).toEqual({ player: ABED, run: null, round: null, fight: null });
  });

  it("keeps no trainer when the new run is someone else's", () => {
    const next = runReducer(shopping(), { type: "start", seed: "city-college", login: "annie" });
    expect(next.phase).toEqual({ kind: "loading-run", login: "annie", trainer: null });
  });

  it.each<RunAction>([
    { type: "buy", slot: 0 },
    { type: "reroll" },
    { type: "buy-slot" },
    { type: "fight" },
    { type: "continue" },
    { type: "move", id: "0:abed/dreamatorium", spot: { kind: "archive" } },
  ])("ignores $type while it is read", (action) => {
    // Regression guarded: the old shop stayed live while a new run was read, so a card could be bought from it.
    const loading = runReducer(shopping(), begun("city-college"));
    expect(runReducer(loading, action)).toBe(loading);
  });

  it("drops the answer to an older run's read", () => {
    // Regression guarded: StrictMode starts a ?me= run twice, and whichever read landed last won.
    const loading = play(NO_RUN, begun("greendale"), begun("city-college"));
    expect(runReducer(loading, runRead("greendale"))).toBe(loading);
    expect(runReducer(loading, { type: "read-failed", seed: "greendale", message: "Streets ahead" })).toBe(loading);
  });

  it("opens round 1 with the player's ace on the board and the start gold", () => {
    const { phase } = shopping();
    expect(phase.kind).toBe("shop");
    const scene = sceneOf(phase);
    expect(scene.round?.number).toBe(1);
    expect(scene.round?.opponent.login).toBe("chang");
    expect(scene.run?.units.map((unit) => unit.fighter.fullName)).toEqual(["abed/dreamatorium"]);
    expect(scene.run?.gold).toBe(4);
  });
});

describe("the shop", () => {
  it("buys a card onto the Drafts shelf for its price", () => {
    const next = runReducer(shopping(), { type: "buy", slot: 0 });
    const run = sceneOf(next.phase).run!;
    expect(run.gold).toBe(3);
    expect(run.bench.filter((card) => card !== null)).toHaveLength(1);
    expect(next.phase.kind === "shop" && next.phase.shelf.cards[0]).toBeNull();
  });

  it("refuses a buy it can't afford", () => {
    const broke = play(shopping(), { type: "buy-slot" });
    expect(sceneOf(broke.phase).run?.gold).toBe(0);
    expect(runReducer(broke, { type: "buy", slot: 0 })).toBe(broke);
  });
});

describe("a round", () => {
  it("plays a fight, shows the result, then reads the next round on Continue", () => {
    const result = fought(shopping());
    expect(result.phase.kind).toBe("round-result");
    expect(result.phase.kind === "round-result" && result.phase.winner).toBe(0);

    const next = runReducer(result, { type: "continue" });
    expect(next.phase.kind).toBe("loading-round");
    expect(next.phase.kind === "loading-round" && next.phase.number).toBe(2);
    expect(sceneOf(next.phase).run?.tally).toEqual({ wins: 1, losses: 0, counted: 1 });
    // A second press while the round is read counts nothing again.
    expect(runReducer(next, { type: "continue" })).toBe(next);
  });

  it("lets go of the creature followed in a fight when the fight ends", () => {
    // Regression guarded: the creature panel (fight-inspect.tsx) stayed open over the result bar
    // after the fight, showing a creature from a board that had stopped.
    const fighting = play(shopping(), { type: "fight" }, { type: "look", id: "1:chang/el-tigre" });
    expect(fighting.selected).toBe("1:chang/el-tigre");
    const over = fighting.phase.kind === "fighting" ? runReducer(fighting, { type: "fight-ended", key: fighting.phase.fight.key }) : fighting;
    expect(over.phase.kind).toBe("round-result");
    expect(over.selected).toBeNull();
  });

  it("ignores the end of a fight it isn't playing", () => {
    const fighting = runReducer(shopping(), { type: "fight" });
    expect(runReducer(fighting, { type: "fight-ended", key: "the-darkest-timeline" })).toBe(fighting);
  });

  it("opens the next round only for the round and the run it read", () => {
    const loading = play(fought(shopping()), { type: "continue" });
    expect(runReducer(loading, roundRead("city-college", 2))).toBe(loading);
    expect(runReducer(loading, roundRead("greendale", 3))).toBe(loading);
    const opened = runReducer(loading, roundRead("greendale", 2));
    expect(opened.phase.kind).toBe("shop");
    expect(sceneOf(opened.phase).round?.opponent.login).toBe("pierce");
  });

  it("lands a failed read in a phase with no opponent and no Fight, and retries the same round", () => {
    // Regression guarded: a failed read left the last round up with Fight enabled against the previous opponent.
    const failed = play(fought(shopping()), { type: "continue" }, { type: "read-failed", seed: "greendale", message: "The next team couldn't be read." });
    expect(failed.phase.kind).toBe("failed");
    expect(sceneOf(failed.phase).round).toBeNull();
    expect(runReducer(failed, { type: "fight" })).toBe(failed);
    expect(runReducer(failed, { type: "buy", slot: 0 })).toBe(failed);

    const retried = runReducer(failed, { type: "retry-round" });
    expect(retried.phase.kind === "loading-round" && retried.phase.number).toBe(2);
  });

  it("ends the run at the fifth win instead of reading a sixth round", () => {
    let state = shopping();
    for (let round = 2; round <= 5; round++) state = nextRound(state, round);
    const ended = play(fought(state), { type: "continue" });
    expect(ended.phase.kind).toBe("end");
    expect(sceneOf(ended.phase).run?.tally).toEqual({ wins: 5, losses: 0, counted: 5 });
  });
});

/** Plays the round on the board and opens round `number`, taking the first boost when one is offered. */
function nextRound(state: RunState, number: number): RunState {
  const opened = play(fought(state), { type: "continue" }, roundRead("greendale", number));
  return opened.phase.kind === "boost-pick" ? runReducer(opened, { type: "pick", id: opened.phase.offer.ids[0] }) : opened;
}

describe("the boost pick", () => {
  const afterRoundTwo = () => {
    return play(fought(nextRound(shopping(), 2)), { type: "continue" });
  };

  it("waits for round 3 to open before it shows", () => {
    // Regression guarded: the offer was set before the next round was read, so a failed read still offered it.
    const loading = afterRoundTwo();
    expect(loading.phase.kind).toBe("loading-round");
    const opened = runReducer(loading, roundRead("greendale", 3));
    expect(opened.phase.kind).toBe("boost-pick");
    expect(opened.phase.kind === "boost-pick" && opened.phase.offer.round).toBe(2);
  });

  it("holds the shop and Fight until the board is peeked at, and takes the picked boost for the run", () => {
    const picking = runReducer(afterRoundTwo(), roundRead("greendale", 3));
    const offered = picking.phase.kind === "boost-pick" ? picking.phase.offer.ids : [];
    expect(offered).toHaveLength(3);
    expect(runReducer(picking, { type: "buy", slot: 0 })).toBe(picking);
    expect(runReducer(picking, { type: "fight" })).toBe(picking);

    const peeking = runReducer(picking, { type: "peek", peeking: true });
    expect(sceneOf(runReducer(peeking, { type: "buy", slot: 0 }).phase).run?.gold).toBeLessThan(sceneOf(peeking.phase).run!.gold);
    expect(runReducer(peeking, { type: "fight" })).toBe(peeking);

    const picked = runReducer(peeking, { type: "pick", id: offered[0] });
    expect(picked.phase.kind).toBe("shop");
    expect(sceneOf(picked.phase).run?.boosts).toEqual([offered[0]]);
    expect(runReducer(picking, { type: "pick", id: "a-boost-on-no-offer" })).toBe(picking);
  });
});

it("sceneOf shows nothing of a run before the first one starts", () => {
  const phase: Phase = { kind: "start" };
  expect(sceneOf(phase)).toEqual({ player: null, run: null, round: null, fight: null });
});
