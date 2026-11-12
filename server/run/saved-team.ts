import type { Character } from "../character.ts";
import type { RunFighter, Unit } from "./rules.ts";
import type { Snapshot } from "./types.ts";

// A finished run's team, as a share link carries it. The Worker signs one only after
// replaying the run's fights itself (worker/src/team.ts), and every card keeps the
// numbers it had in the run, so a fight against the team plays the same however the
// repos change later. A run started from the link ("Beat this team") meets the team
// as it stood at each round.

export const SAVED_TEAM_VERSION = 1;

/** One round as the team stood: `fighter` is an index into the saved team's `fighters`. */
export type SavedRound = { units: { fighter: number; col: number; row: number }[]; boosts: string[] };

export type SavedTeam = {
  v: typeof SAVED_TEAM_VERSION;
  login: string;
  avatarUrl: string | null;
  character: Character & { level: number };
  /** The day the run was played (UTC). */
  day: string;
  wins: number;
  losses: number;
  /** Every card fielded in any round, numbers frozen. */
  fighters: RunFighter[];
  /** The team at each round, round 1 first. */
  rounds: SavedRound[];
};

// A run against the team can last longer than the run that saved it; past its last round the team stays as it ended.
const roundOf = (saved: SavedTeam, round: number): SavedRound => saved.rounds[Math.min(Math.max(round, 1), saved.rounds.length) - 1];

/** The saved team at a round, with each card where it stood: what the board draws. */
export function savedUnitsAt(saved: SavedTeam, round: number): Unit[] {
  return roundOf(saved, round).units.map((unit) => ({ fighter: saved.fighters[unit.fighter], col: unit.col, row: unit.row }));
}

/** The saved team at a round, as the fight engine reads a team. */
export function savedSnapshotAt(saved: SavedTeam, round: number): Snapshot {
  return {
    login: saved.login,
    round,
    units: savedUnitsAt(saved, round).map((unit) => ({ card: unit.fighter.card, col: unit.col, row: unit.row })),
    boosts: roundOf(saved, round).boosts,
  };
}

/** The team the run ended with. */
export const finalUnits = (saved: SavedTeam): Unit[] => savedUnitsAt(saved, saved.rounds.length);

/** "5 wins, 1 loss" */
export const recordOf = (wins: number, losses: number) => `${wins} ${wins === 1 ? "win" : "wins"}, ${losses} ${losses === 1 ? "loss" : "losses"}`;
