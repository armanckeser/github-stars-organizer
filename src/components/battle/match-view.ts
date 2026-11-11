import { repoName, type SideView, type Stance } from "@/components/battle/arena";
import type { Side } from "../../../server/battle";
import type { GameEvent, GameState } from "../../../server/game";

// How a turn-based match reads and looks, for both screens that show one: a match over
// a GitHub thread (routes/game.tsx) and a game against the computer (routes/battle.tsx).

const other = (side: Side): Side => (side === "a" ? "b" : "a");

/** One line for what just happened. */
export function describeEvent(state: GameState, event: GameEvent): string {
  const who = state.players[event.side].name;
  const card = repoName(state.teams[event.side][event.card]);
  if (event.action === "guard") return `${who}'s ${card} guards.`;
  if (event.action === "switch") return `${who} switches to ${repoName(state.teams[event.side][event.to ?? 0])}.`;
  const target = repoName(state.teams[other(event.side)][event.target ?? 0]);
  return [
    `${card} uses ${event.move} on ${target}: ${event.damage} damage.`,
    event.critical ? "A critical hit." : "",
    event.guarded ? "The guard took half." : "",
    event.knockedOut ? `${target} is out.` : "",
  ].filter(Boolean).join(" ");
}

/** What one side's creature in the arena is doing after the last move. */
export function sideView(state: GameState, side: Side): SideView {
  const last = state.events.at(-1);
  const stance = ((): Stance => {
    if (!last) return state.status === "active" ? "enter" : "idle";
    const attacked = last.action === "attack" || last.action === "special";
    if (last.side === side) return attacked ? "lunge" : last.action === "switch" ? "enter" : "idle";
    if (!attacked) return "idle";
    // A knocked-out card has already been replaced by the next in line.
    return last.knockedOut ? (state.status === "won" ? "ko" : "enter") : "hit";
  })();
  const hit = last && last.side !== side && last.damage !== undefined ? { damage: last.damage, critical: last.critical ?? false } : undefined;
  return {
    fighter: state.teams[side][state.sides[side].active],
    look: state.players[side].look,
    stance,
    hit,
    special: last?.side === side && last.action === "special",
    guarding: state.sides[side].guarding,
    won: state.status === "won" && state.winner === side,
  };
}

