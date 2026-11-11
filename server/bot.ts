// The computer player for the demo's game (docs/GAME-DESIGN.md, change 1). It plays
// by the same rules as a person (server/game.ts) and sees the same public dice.
//
// Most turns it takes the hit that does the most damage now. Otherwise it picks any
// legal action, so it can be beaten. It also switches out of a bad type matchup while
// its card is healthy, and now and then guards when the next roll is a critical for
// the other side.

import { matchup, type Side } from "./battle.ts";
import { applyAction, legalActions, rollFor, type Action, type GameState } from "./game.ts";

export const BOT_SKILL = 0.7;
const GUARD_ODDS = 0.5;

const other = (side: Side): Side => (side === "a" ? "b" : "a");

/** The damage an attack or special would do now, capped at what the target has left. */
export function expectedDamage(state: GameState, seed: string, side: Side, action: Action): number {
  if (action.kind !== "attack" && action.kind !== "special") return 0;
  const event = applyAction(state, seed, side, action, "bot", "").events.at(-1)!;
  const left = state.sides[other(side)].hp[state.sides[other(side)].active];
  return Math.min(event.damage ?? 0, left);
}

// How well one card fares against another: 2 when only it has the edge, -2 the other way round.
function edge(state: GameState, side: Side, card: number): number {
  const mine = state.teams[side][card].type;
  const foe = state.teams[other(side)][state.sides[other(side)].active].type;
  return matchup(mine, foe) - matchup(foe, mine);
}

/** What the computer does on its turn, or null when it isn't its turn. */
export function botAction(state: GameState, seed: string, side: Side, random: () => number): Action | null {
  const legal = legalActions(state, side);
  if (legal.length === 0) return null;
  if (random() >= BOT_SKILL) return legal[Math.floor(random() * legal.length)];

  const mine = state.sides[side];
  const active = state.teams[side][mine.active];

  // Out of a bad matchup, while the card is still worth saving for later.
  if (edge(state, side, mine.active) < 0 && mine.hp[mine.active] > active.hp / 2) {
    const switches = legal.filter((action): action is { kind: "switch"; to: number } => action.kind === "switch");
    const best = switches.reduce<{ action: Action; score: number } | null>((found, action) => {
      const score = edge(state, side, action.to);
      return score > edge(state, side, mine.active) && (!found || score > found.score) ? { action, score } : found;
    }, null);
    if (best) return best.action;
  }

  // The other side rolls a critical next turn, and this turn's roll isn't one.
  const canGuard = legal.some((action) => action.kind === "guard");
  if (canGuard && rollFor(seed, state.turn + 1).critical && !rollFor(seed, state.turn).critical && random() < GUARD_ODDS) return { kind: "guard" };

  // The hit that does the most now; a tie keeps the charge.
  const hits = legal.filter((action) => action.kind === "attack" || action.kind === "special");
  return hits.reduce((best, action) => (expectedDamage(state, seed, side, action) > expectedDamage(state, seed, side, best) ? action : best));
}
