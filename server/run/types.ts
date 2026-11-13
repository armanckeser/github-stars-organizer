// The shapes every part of the run shares: the fight engine, the Worker and the screen.
//
// The board is 4 cells wide and 4 deep. Each side places cards on its own half:
// 4 columns and 2 rows, row 0 in front. Board cell (x, y): y 0 and 1 belong to
// side 0 (y 1 is its front), y 2 and 3 to side 1 (y 2 is its front). Each side
// counts columns from its own left, so side 1's columns are mirrored on the board.

export const COLS = 4;
export const ROWS = 2;
/** One tick of a fight, in milliseconds. Event times are in ticks. */
export const TICK_MS = 100;

export type Card = {
  /** "owner/repo" */
  fullName: string;
  type: string;
  /** Language and up to two topics, lower-case. */
  sets: string[];
  rarity: 0 | 1 | 2 | 3 | 4;
  hp: number;
  attack: number;
  guard: number;
  speed: number;
  /** How many cells away the card can hit: 1 fights up close, 3 from behind. */
  range: 1 | 3;
  /** An id from ABILITIES. */
  ability: string;
  shiny: boolean;
};

export type Placed = { card: Card; col: number; row: number };

/** A team as saved at one round of a run: which cards, and where each stands. */
export type Snapshot = { login: string; round: number; units: Placed[]; boosts: string[] };

export type Side = 0 | 1;

export function cellOf(side: Side, placed: { col: number; row: number }): { x: number; y: number } {
  return side === 0 ? { x: placed.col, y: ROWS - 1 - placed.row } : { x: COLS - 1 - placed.col, y: ROWS + placed.row };
}

/** `unit` and `target` are indexes into that side's `units`. A hit's target is on the other side. */
export type FightEvent =
  | { t: number; kind: "move"; side: Side; unit: number; x: number; y: number }
  | { t: number; kind: "hit"; side: Side; unit: number; target: number; damage: number; critical: boolean }
  | { t: number; kind: "ability"; side: Side; unit: number; ability: string; targets: number[] }
  | { t: number; kind: "condition"; side: Side; unit: number; condition: string; on: boolean }
  /** HP that changes without a hit: a heal (above 0) or a card hurting itself (below 0). `cause` is the ability, set, boost or condition. */
  | { t: number; kind: "hp"; side: Side; unit: number; change: number; cause: string }
  /** The shield a card has left, after it gains one or a hit takes some of it. 0 is no shield. */
  | { t: number; kind: "shield"; side: Side; unit: number; shield: number }
  | { t: number; kind: "faint"; side: Side; unit: number }
  | { t: number; kind: "end"; winner: Side | null };

/** Pure: the same two snapshots and seed always give the same events, in time order. */
export type Fight = (a: Snapshot, b: Snapshot, seed: string) => FightEvent[];
