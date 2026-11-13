import type { BoardFight, Spot } from "../components/battle/three/board";
import { BOOST_ROUNDS, boostOffer } from "../../server/run/boosts";
import { fight as playFight } from "../../server/run/fight";
import { benchToBoard, boardToBench, cardsOf, emptyBench, swapBench, toBench, without, type Roster } from "../../server/run/roster";
import { SLOT_COST, boardLimit } from "../../server/run/rules";
import type { Side, Snapshot } from "../../server/run/types";
import type { RoundResult } from "./challenge";
import { LOSSES_TO_END, NEW_TALLY, REROLL_COST, START_GOLD, WINS_TO_FINISH, costOf, countRound, inHalf, shopFor, snapshot, winnerOf, type Player, type RunFighter, type Tally, type Unit } from "./run";
import { savedSnapshotAt, type SavedTeam } from "./saved-team";

// The Play run as one state machine (src/routes/run.tsx holds it in a useReducer). The
// phase says what is on the board and which actions count: an action from another phase
// is ignored, so a late button press can't buy from a shop that is gone. Every read's
// answer carries the seed of the run that asked for it, and a newer run drops it.

/** The id a creature has on the board, on its side. */
export const idOf = (side: Side, fighter: RunFighter) => `${side}:${fighter.fullName}`;

/** A round's opponent and their team at that round. */
export type Round = { number: number; opponent: Player; theirs: Unit[] };
/** What a run keeps from round to round. `bought` is board slots bought on top of the round's limit. */
export type Run = { player: Player; against: SavedTeam | null; units: Unit[]; bench: (RunFighter | null)[]; bought: number; tally: Tally; gold: number; boosts: string[]; history: Snapshot[]; results: RoundResult[] };
/** The round's shop and how often it was rerolled. */
export type Shelf = { cards: (RunFighter | null)[]; rerolls: number };
/** Three boosts to pick one from, after a round in BOOST_ROUNDS. */
export type Offer = { round: number; ids: string[] };
export type Fought = { round: Round; fight: BoardFight; winner: Side | null };
type Building = { run: Run; round: Round; shelf: Shelf };

/** What a failed read retries: the whole run (with the trainer to keep on the board), or the next round. */
export type Retry = { kind: "run"; login: string; trainer: Player | null } | { kind: "round"; run: Run; number: number; offer: Offer | null };

export type Phase =
  | { kind: "start" }
  /** The player's cards and round 1 are being read. `trainer` is the player from the run before, the only thing left on the board. */
  | { kind: "loading-run"; login: string; trainer: Player | null }
  | ({ kind: "shop" } & Building)
  /** The pick covers the shop; `peeking` folds it away to look at the board and use the shop. */
  | ({ kind: "boost-pick"; offer: Offer; peeking: boolean } & Building)
  | ({ kind: "fighting"; run: Run } & Fought)
  | ({ kind: "round-result"; run: Run } & Fought)
  /** The next round's opponent is being read. `after` is the round just played, kept on the board; none on a retry. */
  | { kind: "loading-round"; run: Run; number: number; offer: Offer | null; after: Fought | null }
  | { kind: "end"; run: Run; round: Round }
  | { kind: "failed"; message: string; retry: Retry };

/** The card being looked at: one in the shop, one of the player's on the board or the Drafts shelf, or one of the other team's. */
export type Viewing = { kind: "shop"; fighter: RunFighter; slot: number } | { kind: "board"; fighter: RunFighter } | { kind: "drafts"; fighter: RunFighter } | { kind: "theirs"; fighter: RunFighter };

/** `seed` is the current run's, "" before the first one. */
export type RunState = { seed: string; phase: Phase; selected: string | null; viewing: Viewing | null };
export const NO_RUN: RunState = { seed: "", phase: { kind: "start" }, selected: null, viewing: null };

export type RunAction =
  | { type: "start"; seed: string; login: string }
  | { type: "run-read"; seed: string; player: Player; against: SavedTeam | null; opponent: Player; theirs: Unit[] }
  | { type: "round-read"; seed: string; number: number; opponent: Player; theirs: Unit[] }
  | { type: "read-failed"; seed: string; message: string }
  | { type: "retry-round" }
  | { type: "buy"; slot: number }
  | { type: "sell"; id: string }
  | { type: "buy-slot" }
  | { type: "move"; id: string; spot: Spot }
  | { type: "reroll" }
  | { type: "fight" }
  | { type: "fight-ended"; key: string }
  | { type: "continue" }
  /** Opens the boost pick for a round out of turn, for screenshots (development builds). */
  | { type: "offer"; round: number }
  | { type: "peek"; peeking: boolean }
  | { type: "pick"; id: string }
  | { type: "look"; id: string | null }
  | { type: "look-shop"; slot: number }
  | { type: "close" };

type BuildAction = Extract<RunAction, { type: "buy" | "sell" | "buy-slot" | "move" | "reroll" }>;

/** What the board shows in a phase. */
export type Scene = { player: Player | null; run: Run | null; round: Round | null; fight: BoardFight | null };

export function sceneOf(phase: Phase): Scene {
  switch (phase.kind) {
    case "start":
      return { player: null, run: null, round: null, fight: null };
    case "loading-run":
      return { player: phase.trainer, run: null, round: null, fight: null };
    case "shop":
    case "boost-pick":
    case "end":
      return { player: phase.run.player, run: phase.run, round: phase.round, fight: null };
    case "fighting":
    case "round-result":
      return { player: phase.run.player, run: phase.run, round: phase.round, fight: phase.fight };
    case "loading-round":
      return { player: phase.run.player, run: phase.run, round: phase.after?.round ?? null, fight: phase.after?.fight ?? null };
    case "failed":
      return phase.retry.kind === "run" ? { player: phase.retry.trainer, run: null, round: null, fight: null } : { player: phase.retry.run.player, run: phase.retry.run, round: null, fight: null };
  }
}

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case "start":
      return { seed: action.seed, phase: { kind: "loading-run", login: action.login, trainer: trainerFor(state.phase, action.login) }, selected: null, viewing: null };
    case "run-read":
      return state.seed === action.seed && state.phase.kind === "loading-run" ? cleared(state, firstRound(action)) : state;
    case "round-read":
      return roundRead(state, action);
    case "read-failed":
      return readFailed(state, action);
    case "retry-round":
      return state.phase.kind === "failed" && state.phase.retry.kind === "round" ? cleared(state, { kind: "loading-round", run: state.phase.retry.run, number: state.phase.retry.number, offer: state.phase.retry.offer, after: null }) : state;
    case "buy":
    case "sell":
    case "buy-slot":
    case "move":
    case "reroll":
      return build(state, action);
    case "fight":
      return state.phase.kind === "shop" && state.phase.run.units.length > 0 ? cleared(state, fought(state.phase, state.seed)) : state;
    case "fight-ended":
      return state.phase.kind === "fighting" && state.phase.fight.key === action.key ? { ...state, selected: null, phase: { ...state.phase, kind: "round-result" } } : state;
    case "continue":
      return state.phase.kind === "round-result" ? cleared(state, continued(state.phase, state.seed)) : state;
    case "offer":
      return state.phase.kind === "shop" ? { ...state, phase: { ...state.phase, kind: "boost-pick", offer: offerAt(state.phase.run, action.round, state.seed), peeking: false } } : state;
    case "peek":
      return state.phase.kind === "boost-pick" ? { ...state, phase: { ...state.phase, peeking: action.peeking } } : state;
    case "pick":
      return picked(state, action.id);
    case "look":
      return looked(state, action.id);
    case "look-shop":
      return lookedAtShop(state, action.slot);
    case "close":
      return { ...state, selected: null, viewing: null };
  }
}

/** A new phase with nothing selected or open. */
const cleared = (state: RunState, phase: Phase): RunState => ({ ...state, phase, selected: null, viewing: null });

/** The trainer kept on the board while a new run is read: the last run's player, when the new run is theirs. */
function trainerFor(phase: Phase, login: string): Player | null {
  const player = sceneOf(phase).player;
  return player?.login.toLowerCase() === login.toLowerCase() ? player : null;
}

function firstRound(action: Extract<RunAction, { type: "run-read" }>): Phase {
  const units: Unit[] = action.player.team.slice(0, 1).map((fighter) => ({ fighter, col: 1, row: 0 }));
  const run: Run = { player: action.player, against: action.against, units, bench: emptyBench(), bought: 0, tally: NEW_TALLY, gold: START_GOLD, boosts: [], history: [], results: [] };
  return opened(run, { number: 1, opponent: action.opponent, theirs: action.theirs }, null, action.seed);
}

function opened(run: Run, round: Round, offer: Offer | null, seed: string): Phase {
  const shelf: Shelf = { cards: shopFor(run.player, cardsOf({ board: run.units, bench: run.bench }), round.number, 0, seed), rerolls: 0 };
  return offer ? { kind: "boost-pick", offer, peeking: false, run, round, shelf } : { kind: "shop", run, round, shelf };
}

function roundRead(state: RunState, action: Extract<RunAction, { type: "round-read" }>): RunState {
  const phase = state.phase;
  if (state.seed !== action.seed || phase.kind !== "loading-round" || phase.number !== action.number) return state;
  return cleared(state, opened(phase.run, { number: action.number, opponent: action.opponent, theirs: action.theirs }, phase.offer, state.seed));
}

function readFailed(state: RunState, action: Extract<RunAction, { type: "read-failed" }>): RunState {
  const phase = state.phase;
  if (state.seed !== action.seed) return state;
  switch (phase.kind) {
    case "loading-run":
      return cleared(state, { kind: "failed", message: action.message, retry: { kind: "run", login: phase.login, trainer: phase.trainer } });
    case "loading-round":
      return cleared(state, { kind: "failed", message: action.message, retry: { kind: "round", run: phase.run, number: phase.number, offer: phase.offer } });
    default:
      return state;
  }
}

function build(state: RunState, action: BuildAction): RunState {
  const phase = state.phase;
  switch (phase.kind) {
    case "shop":
      return rebuiltInto(state, phase, rebuilt(phase, action, state.seed), action);
    case "boost-pick":
      return phase.peeking ? rebuiltInto(state, phase, rebuilt(phase, action, state.seed), action) : state;
    default:
      return state;
  }
}

function rebuiltInto(state: RunState, phase: Extract<Phase, { kind: "shop" | "boost-pick" }>, next: Building | null, action: BuildAction): RunState {
  if (!next) return state;
  const changed: RunState = { ...state, phase: { ...phase, ...next } };
  // A sold card is gone from the board, so nothing stays selected on it.
  return action.type === "sell" || (action.type === "move" && action.spot.kind === "archive") ? { ...changed, selected: null, viewing: null } : changed;
}

/** The board, Drafts, gold and shop after one of the shop's actions; null when the rules refuse it. */
function rebuilt(building: Building, action: BuildAction, seed: string): Building | null {
  const { run, round, shelf } = building;
  switch (action.type) {
    case "buy":
      return bought(building, action.slot);
    case "sell":
      return sold(building, action.id);
    case "buy-slot":
      if (run.gold < SLOT_COST || boardLimit(round.number, run.bought) >= boardLimit(round.number, run.bought + 1)) return null;
      return { ...building, run: { ...run, gold: run.gold - SLOT_COST, bought: run.bought + 1 } };
    case "move":
      return moved(building, action.id, action.spot);
    case "reroll": {
      if (run.gold < REROLL_COST) return null;
      const rerolls = shelf.rerolls + 1;
      return { round, run: { ...run, gold: run.gold - REROLL_COST }, shelf: { rerolls, cards: shopFor(run.player, cardsOf(rosterOf(run)), round.number, rerolls, seed) } };
    }
  }
}

const rosterOf = (run: Run): Roster => ({ board: run.units, bench: run.bench });
const withRoster = (run: Run, roster: Roster): Run => ({ ...run, units: roster.board, bench: roster.bench });

function bought(building: Building, slot: number): Building | null {
  const { run, shelf } = building;
  const fighter = shelf.cards[slot];
  if (!fighter || run.gold < costOf(fighter)) return null;
  const roster = toBench(rosterOf(run), fighter);
  if (!roster) return null;
  return { ...building, run: { ...withRoster(run, roster), gold: run.gold - costOf(fighter) }, shelf: { ...shelf, cards: shelf.cards.map((card, index) => (index === slot ? null : card)) } };
}

function sold(building: Building, id: string): Building | null {
  const { run, shelf } = building;
  const fighter = cardsOf(rosterOf(run)).find((card) => idOf(0, card) === id);
  const roster = fighter ? without(rosterOf(run), fighter.fullName) : null;
  if (!fighter || !roster) return null;
  // The card goes back on an empty shelf, so a purchase can be taken back.
  const empty = shelf.cards.indexOf(null);
  const cards = empty === -1 ? shelf.cards : shelf.cards.map((card, index) => (index === empty ? fighter : card));
  return { ...building, run: { ...withRoster(run, roster), gold: run.gold + costOf(fighter) }, shelf: { ...shelf, cards } };
}

/** One of the player's creatures put down on a cell, a Drafts slot or the Archive, by the roster's rules. */
function moved(building: Building, id: string, spot: Spot): Building | null {
  const { run, round } = building;
  const onBoard = run.units.find((unit) => idOf(0, unit.fighter) === id);
  const slot = run.bench.findIndex((fighter) => fighter !== null && idOf(0, fighter) === id);
  if (!onBoard && slot === -1) return null;
  if (spot.kind === "archive") return sold(building, id);
  const roster = rosterOf(run);
  const settle = (next: Roster | null): Building | null => (next ? { ...building, run: withRoster(run, next) } : null);
  if (onBoard && spot.kind === "cell") return placed(building, onBoard, spot.col, spot.row);
  if (onBoard && spot.kind === "bench") return settle(boardToBench(roster, onBoard.fighter.fullName, spot.slot));
  if (spot.kind === "bench") return settle(swapBench(roster, slot, spot.slot));
  return settle(benchToBoard(roster, slot, spot.col, spot.row, boardLimit(round.number, run.bought)));
}

// A creature dropped on a taken cell trades places with the one standing there.
function placed(building: Building, moving: Unit, col: number, row: number): Building | null {
  if (!inHalf(col, row)) return null;
  const units = building.run.units.map((unit) => (unit === moving ? { ...unit, col, row } : unit.col === col && unit.row === row ? { ...unit, col: moving.col, row: moving.row } : unit));
  return { ...building, run: { ...building.run, units } };
}

function fought(phase: Extract<Phase, { kind: "shop" }>, seed: string): Phase {
  const { run, round } = phase;
  const fightSeed = `${run.player.login}|${round.opponent.login}|${round.number}|${seed}`;
  const mine = snapshot(run.player.login, round.number, run.units, run.boosts);
  // A saved team fights with the boosts it had at that round, as the Worker replays it (worker/src/team.ts).
  const theirs = run.against ? savedSnapshotAt(run.against, round.number) : snapshot(round.opponent.login, round.number, round.theirs);
  const events = playFight(mine, theirs, fightSeed);
  const winner = winnerOf(events);
  const result: RoundResult = { round: round.number, opponent: round.opponent.login, outcome: winner === 0 ? "won" : winner === 1 ? "lost" : "draw" };
  const fight: BoardFight = { key: `${fightSeed}|${run.tally.wins}|${run.tally.losses}`, ids: [run.units.map((unit) => idOf(0, unit.fighter)), round.theirs.map((unit) => idOf(1, unit.fighter))], events };
  return { kind: "fighting", run: { ...run, history: [...run.history, mine], results: [...run.results, result] }, round, fight, winner };
}

function continued(phase: Extract<Phase, { kind: "round-result" }>, seed: string): Phase {
  const { round, winner } = phase;
  const counted = countRound(phase.run.tally, round.number, winner);
  const run: Run = { ...phase.run, tally: counted.tally, gold: phase.run.gold + counted.earned };
  const over = counted.tally.wins >= WINS_TO_FINISH || counted.tally.losses >= LOSSES_TO_END;
  if (over) return { kind: "end", run, round };
  const offer = (BOOST_ROUNDS as readonly number[]).includes(round.number) ? offerAt(run, round.number, seed) : null;
  return { kind: "loading-round", run, number: round.number + 1, offer, after: { round, fight: phase.fight, winner } };
}

// The same seed as the Worker's offer (worker/src/run.ts), so both offer the same three.
const offerAt = (run: Run, round: number, seed: string): Offer => ({ round, ids: boostOffer(`${run.player.login}|${seed}|${round}`, run.boosts) });

function picked(state: RunState, id: string): RunState {
  const phase = state.phase;
  if (phase.kind !== "boost-pick" || !phase.offer.ids.includes(id)) return state;
  return { ...state, phase: { kind: "shop", run: { ...phase.run, boosts: [...phase.run.boosts, id] }, round: phase.round, shelf: phase.shelf } };
}

function looked(state: RunState, id: string | null): RunState {
  const { run, round } = sceneOf(state.phase);
  if (id === null || !run) return { ...state, selected: id };
  // A fight's creatures are selected to follow them, but no card opens over the fight.
  if (state.phase.kind === "fighting") return { ...state, selected: id };
  const mine = run.units.find((unit) => idOf(0, unit.fighter) === id);
  const drafted = run.bench.find((fighter) => fighter !== null && idOf(0, fighter) === id);
  const theirs = round?.theirs.find((unit) => idOf(1, unit.fighter) === id);
  if (mine) return { ...state, selected: id, viewing: { kind: "board", fighter: mine.fighter } };
  if (drafted) return { ...state, selected: id, viewing: { kind: "drafts", fighter: drafted } };
  if (theirs) return { ...state, selected: id, viewing: { kind: "theirs", fighter: theirs.fighter } };
  return { ...state, selected: id };
}

function lookedAtShop(state: RunState, slot: number): RunState {
  const phase = state.phase;
  if (phase.kind !== "shop" && phase.kind !== "boost-pick") return state;
  const fighter = phase.shelf.cards[slot];
  return fighter ? { ...state, viewing: { kind: "shop", fighter, slot } } : state;
}
