import type * as THREE from "three";
import type { Effect } from "../../../../../server/run/hooks";
import type { Side } from "../../../../../server/run/types";

// What an ability's effect may touch when it plays on the board (board.ts gives it).
// Every effect kind is one file in this folder that draws with these and nothing else,
// so each can change without the board or the other kinds changing.

/** One creature, as an effect sees it. */
export type EffectActor = {
  readonly side: Side;
  /** Where the creature is drawn now, on the floor. Read it again each frame: it walks. */
  readonly at: THREE.Vector3;
  /** How tall the creature is drawn, in world units. */
  readonly height: number;
  /** Knocked out: draw nothing more on it. */
  readonly out: boolean;
  /** Squashes the creature (0.1 a nudge, 0.3 a heavy hit) and lights it (0 to 1). Never lessens either. */
  jolt(squash: number, flash: number): void;
};

export type EffectStage = {
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  /** The player asked for less motion: show the result in place, without travel, shaking or particles. */
  readonly reduced: boolean;
  /** Calls `update` with 0 to 1 over `duration` fight-seconds, starting after `delay`. Follows the fight's speed. */
  tween(delay: number, duration: number, update: (k: number) => void, done?: () => void): void;
  after(delay: number, done: () => void): void;
  /** A point on the creature: 0 at its feet, 1 at the top of its head. */
  pointOn(actor: EffectActor, height: number): THREE.Vector3;
  /** Puts `object` in the scene for `life` fight-seconds, then removes and frees it. */
  spawn(object: THREE.Object3D, life: number): void;
  /**
   * Keeps `object` on the creature until `detach` with the same key, or until the creature
   * leaves or is knocked out. Its position is set to the creature's feet each frame, so
   * build it around (0, 0, 0). A second attach with the same key replaces the first.
   */
  attach(actor: EffectActor, key: string, object: THREE.Object3D): void;
  detach(actor: EffectActor, key: string): void;
  /** Whether something is attached under `key`. */
  attached(actor: EffectActor, key: string): THREE.Object3D | undefined;
};

/** One effect of an ability, set bonus or boost that just fired. `targets` are who it reaches, standing. */
export type Cast<Kind extends Effect["kind"] = Effect["kind"]> = {
  caster: EffectActor;
  targets: EffectActor[];
  effect: Extract<Effect, { kind: Kind }>;
  /** The ability, set or boost id. */
  source: string;
};

/**
 * Draws one effect kind. The fight's own events still follow on their own: a damage
 * effect's `hit` events stamp the numbers and squash the target, a heal's `hp` event
 * stamps "+n", a condition's `condition` event shows the badge. A player only adds the
 * look: what travels, what glows, what rises.
 */
export type EffectPlayer<Kind extends Effect["kind"] = Effect["kind"]> = (stage: EffectStage, cast: Cast<Kind>) => void;

/** When the effect starts after the cast ring, in fight-seconds, so the caster is seen first. */
export const CAST_LEAD = 0.08;

/**
 * One meaning per colour (docs/GAME-UI.md §9). Conditions keep CONDITION_COLOR in board.ts.
 * - `fired`: something fired: the cast ring and the name.
 * - `damage`: white.
 * - `shield`: pale blue-white, on the creature and on the HP bar.
 * - `heal`: the green the "+n" numbers already use.
 * - `up` / `down`: a stat up, a stat down.
 */
export const EFFECT_COLOR = {
  fired: 0xc9a45c,
  damage: 0xffffff,
  shield: 0xdff3ff,
  heal: 0x5be37a,
  up: 0xffcf5a,
  down: 0xff6b6b,
} as const;
