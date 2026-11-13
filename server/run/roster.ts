import { BENCH_SIZE, inHalf, type RunFighter, type Unit } from "./rules.ts";

// The player's cards between fights: the ones on the board, which fight, and the ones
// on the bench, which wait. Each change gives a new roster, or null when the rules
// refuse it. Only the board counts toward the team limit.

export type Roster = { board: Unit[]; bench: (RunFighter | null)[] };

export const emptyBench = (): (RunFighter | null)[] => Array.from({ length: BENCH_SIZE }, () => null);

/** Every card the player holds, board first. */
export const cardsOf = (roster: Roster): RunFighter[] => [...roster.board.map((unit) => unit.fighter), ...roster.bench.filter((fighter) => fighter !== null)];

/** A bought card goes to the first free bench slot. Null when the bench is full. */
export function toBench(roster: Roster, fighter: RunFighter): Roster | null {
  const free = roster.bench.indexOf(null);
  if (free === -1) return null;
  return { ...roster, bench: roster.bench.map((other, i) => (i === free ? fighter : other)) };
}

/**
 * A bench card onto a board cell. On a taken cell the two trade places, so the board
 * keeps its size; on a free cell the board grows, up to `limit`.
 */
export function benchToBoard(roster: Roster, slot: number, col: number, row: number, limit: number): Roster | null {
  const fighter = roster.bench[slot];
  if (!fighter || !inHalf(col, row)) return null;
  const standing = roster.board.find((unit) => unit.col === col && unit.row === row);
  if (!standing && roster.board.length >= limit) return null;
  const board = standing ? roster.board.map((unit) => (unit === standing ? { fighter, col, row } : unit)) : [...roster.board, { fighter, col, row }];
  return { board, bench: roster.bench.map((other, i) => (i === slot ? (standing?.fighter ?? null) : other)) };
}

/** A board card onto a bench slot. A card already in the slot takes its cell on the board. */
export function boardToBench(roster: Roster, fullName: string, slot: number): Roster | null {
  const moved = roster.board.find((unit) => unit.fighter.fullName === fullName);
  if (!moved || slot < 0 || slot >= roster.bench.length) return null;
  const waiting = roster.bench[slot];
  const board = waiting ? roster.board.map((unit) => (unit === moved ? { ...unit, fighter: waiting } : unit)) : roster.board.filter((unit) => unit !== moved);
  return { board, bench: roster.bench.map((other, i) => (i === slot ? moved.fighter : other)) };
}

/** Two bench slots trade cards. */
export function swapBench(roster: Roster, from: number, to: number): Roster | null {
  if (from === to || to < 0 || to >= roster.bench.length || !roster.bench[from]) return null;
  const bench = [...roster.bench];
  [bench[from], bench[to]] = [bench[to], bench[from]];
  return { ...roster, bench };
}

/** The card leaves the roster, from the board or the bench. Null when the player does not hold it. */
export function without(roster: Roster, fullName: string): Roster | null {
  const held = cardsOf(roster).some((fighter) => fighter.fullName === fullName);
  if (!held) return null;
  return { board: roster.board.filter((unit) => unit.fighter.fullName !== fullName), bench: roster.bench.map((fighter) => (fighter?.fullName === fullName ? null : fighter)) };
}
