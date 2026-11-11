// The shapes every part of the run shares: the fight engine, the Worker and the screen.

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
  /** An id from ABILITIES. */
  ability: string;
  shiny: boolean;
};

/** A team as saved at one round of a run. Cards are in order, front first. */
export type Snapshot = { login: string; round: number; cards: Card[]; boosts: string[] };

export type Side = 0 | 1;

export type FightEvent =
  | { kind: "enter"; side: Side; slot: number }
  | { kind: "hit"; side: Side; slot: number; target: number; damage: number; critical: boolean }
  | { kind: "ability"; side: Side; slot: number; ability: string; targets: number[] }
  | { kind: "condition"; side: Side; slot: number; condition: string; on: boolean }
  | { kind: "faint"; side: Side; slot: number }
  | { kind: "end"; winner: Side | null };

/** Pure: the same two snapshots and seed always give the same events. */
export type Fight = (a: Snapshot, b: Snapshot, seed: string) => FightEvent[];
