import type { Body, CreatureRecipe, Emblem, Paints, Sash } from "./creature-recipe.ts";

// A creature's parts, listed once: what each part is, where it sits, its paint and its
// outline. The arena builds them in 3D (src/components/battle/three/creature.ts) and the
// share pictures draw them flat (server/creature-sticker.ts), so a body added here is the
// same creature in both, and the two can't drift apart.

export type Vector = [number, number, number];
export type Point = [number, number];

type Common = {
  at: Vector;
  /** sRGB hex. */
  paint: string;
  turn?: Vector;
  scale?: Vector;
  /** False: no ink edge, for parts small enough that an edge would swallow them. */
  outline?: boolean;
  /** Limbs swing a little while idle; spinners turn slowly. */
  motion?: "limb" | "spinner";
  /** "face": drawn over the eyes in the flat picture, as glasses sit over them. */
  layer?: "face";
  /** "none": lit by nothing, as an eye's glint. */
  shading?: "none";
};

/** The 3D detail fields (`detail`, `sides`, `caps`, `steps`) only set how round the model is; the flat picture reads the outline alone. */
export type Shape =
  | (Common & { kind: "sphere"; radius: number; detail?: number })
  | (Common & { kind: "box"; size: Vector; round?: { radius: number; segments: number } })
  | (Common & { kind: "cone"; radius: number; height: number; sides?: number })
  | (Common & { kind: "cylinder"; top: number; bottom: number; height: number; sides?: number })
  | (Common & { kind: "capsule"; radius: number; length: number; caps: number; sides: number })
  | (Common & { kind: "octahedron"; radius: number })
  | (Common & { kind: "slice"; points: Point[]; depth: number })
  | (Common & { kind: "ring"; radius: number; tube: number; sides: number; steps: number; arc?: number });

/** A face as the body puts it: its height, how far forward, how far apart the eyes are, and their size. */
export type Face = { y: number; z: number; spread: number; size: number };

/** Parts that move as one around their own middle `at`: an emblem turns, an eye blinks. */
export type Cluster = { at: Vector; shapes: Shape[] };

export type Assembly = {
  /** The body's parts, in the order the model adds them. */
  body: Shape[];
  emblem: Cluster | null;
  eyes: Cluster[];
  mouth: Shape;
  /**
   * The contribution sash as flat pieces, or none for a creature with no cost: the ink edge and
   * the band, then its rows of squares, five at a time, each row from its viewer's left.
   */
  sash: Quad[];
  /** The body's height before the creature's scale, its head's top bits included. */
  height: number;
  floats: boolean;
};

/**
 * Where a body wears its sash: a band round it at `at`, `radii` across and deep, as square
 * as `roundness` (2 is an ellipse, higher hugs a box), rolled by `tilt` so it runs from one
 * hip up toward the other shoulder. A flat-fronted body shows its squares on its front and
 * back; a round one on its raised left flank (see `rowsOf`). A band on a ball's upper half
 * `leans` back by that angle and lies on it, facing up; one on the lower half stands upright,
 * which keeps its face out from under the ball's bulge, toward a camera above.
 */
type SashFit = { at: Vector; radii: [number, number]; roundness: number; tilt: number; leans: number; squares: "front" | "side" };

/**
 * A sash round a ball of `radius` at `centre`: the band's plane rolled by `tilt` and dropped
 * `drop` below the middle (or above it, when negative) meets the ball in a circle, which the
 * band sits just outside.
 */
function aroundBall(centre: Vector, radius: number, drop: number, tilt: number, deep = radius): SashFit {
  const up: Vector = [-Math.sin(tilt), Math.cos(tilt), 0];
  const across = Math.sqrt(radius ** 2 - drop ** 2) + SASH_CLEARANCE;
  const depth = Math.sqrt(Math.max(0, deep ** 2 - drop ** 2)) + SASH_CLEARANCE;
  return { at: [centre[0] - up[0] * drop, centre[1] - up[1] * drop, centre[2]], radii: [across, depth], roundness: 2, tilt, leans: Math.asin(Math.max(0, -drop) / radius), squares: "side" };
}

/** A flat piece of the sash: part of the band (or its ink edge), or one of its squares. */
export type Quad = { piece: "band" | "square"; corners: [Vector, Vector, Vector, Vector]; normal: Vector; paint: string };

type Plan = { shapes: Shape[]; face: Face; height: number; floats: boolean; sash: SashFit };

const GOLD = "#f5c84b";
const BEAK = "#e9a23b";
const PAGES = "#eceae4";
const RED = "#e5484d";
const GLASSES = "#1b1d21";
const EYE_WHITE = "#ffffff";
const PUPIL = "#15171b";
const CLOUD = "#eef2f6";
const LENS = "#2a2f37";
const GLASS = "#8fd3ff";
const STEEL = "#9aa0a6";
/** How far over the head an emblem floats, over a standing body and over a floating one. */
const EMBLEM_OVER = 0.45;
const EMBLEM_OVER_FLOATING = 0.25;

/** Each body, part for part. */
function planOf(body: Body, { base, light, dark, accent }: Paints): Plan {
  switch (body.plan) {
    case "golem": {
      // A block on legs with heavy arms.
      const shapes: Shape[] = [
        { kind: "box", size: [0.92, 0.8, 0.72], round: { segments: 3, radius: 0.14 }, at: [0, 0.68, 0], paint: base },
        { kind: "box", size: [0.98, 0.16, 0.78], round: { segments: 2, radius: 0.06 }, at: [0, 1.04, 0], turn: [0.08, 0, 0], paint: dark },
        ...[-1, 1].flatMap((x): Shape[] => [
          { kind: "box", size: [0.28, 0.6, 0.34], round: { segments: 2, radius: 0.1 }, at: [x * 0.64, 0.56, 0.02], paint: dark, motion: "limb" },
          { kind: "box", size: [0.3, 0.28, 0.36], round: { segments: 2, radius: 0.08 }, at: [x * 0.24, 0.14, 0], paint: dark },
        ]),
      ];
      if (body.top === "chimneys") for (const x of [-0.24, 0.2]) shapes.push({ kind: "cylinder", top: 0.09, bottom: 0.11, height: 0.3, at: [x, 1.24, -0.1], paint: accent });
      if (body.top === "horns") for (const x of [-1, 1]) shapes.push({ kind: "cone", radius: 0.11, height: 0.36, at: [x * 0.32, 1.26, 0], turn: [0, 0, -x * 0.35], paint: accent });
      if (body.top === "antenna") {
        shapes.push({ kind: "cylinder", top: 0.025, bottom: 0.025, height: 0.34, at: [0, 1.28, 0], paint: dark, outline: false });
        shapes.push({ kind: "sphere", radius: 0.09, detail: 12, at: [0, 1.48, 0], paint: accent });
      }
      if (body.top === "fins") for (const z of [-0.22, 0, 0.22]) shapes.push({ kind: "box", size: [0.08, 0.24 - Math.abs(z) * 0.4, 0.16], at: [0, 1.2, z], paint: accent });
      return { shapes, face: { y: 0.78, z: 0.37, spread: 0.2, size: 0.13 }, height: 1.3, floats: false, sash: { at: [0, 0.46, 0], radii: [0.51, 0.41], roundness: 4, tilt: 0.22, leans: 0, squares: "front" } };
    }
    case "turtle": {
      // A low dome of a shell on four stubby legs, its head poking out in front.
      const shapes: Shape[] = [
        { kind: "sphere", radius: 0.62, detail: 24, at: [0, 0.5, 0], scale: [1.15, 0.55, 1], paint: base },
        { kind: "cylinder", top: 0.66, bottom: 0.7, height: 0.08, sides: 24, at: [0, 0.46, 0], scale: [1.08, 1, 0.92], paint: dark },
        { kind: "sphere", radius: 0.28, at: [0, 0.68, 0.62], paint: light },
        ...[-1, 1].flatMap((x) => [-1, 1].map((z): Shape => ({ kind: "cylinder", top: 0.12, bottom: 0.13, height: 0.3, at: [x * 0.34, 0.15, z * 0.24], paint: light, motion: z > 0 ? "limb" : undefined }))),
        { kind: "cone", radius: 0.08, height: 0.2, at: [0, 0.32, -0.66], turn: [-Math.PI / 2, 0, 0], paint: light },
      ];
      if (body.shell === "dome") {
        shapes.push({ kind: "sphere", radius: 0.16, detail: 14, at: [0, 0.82, -0.04], scale: [1, 0.35, 1], paint: dark });
        for (const x of [-1, 1]) shapes.push({ kind: "sphere", radius: 0.12, detail: 12, at: [x * 0.38, 0.72, -0.08], scale: [1, 0.35, 1], turn: [0, 0, -x * 0.55], paint: dark });
      }
      if (body.shell === "spikes") for (const x of [-0.3, 0, 0.3]) shapes.push({ kind: "cone", radius: 0.09, height: 0.24, at: [x, x ? 0.86 : 0.94, -0.06], turn: [0, 0, -x * 1.4], paint: accent });
      if (body.shell === "ridge") for (const z of [-0.26, 0, 0.26]) shapes.push({ kind: "box", size: [0.08, 0.2 - Math.abs(z) * 0.3, 0.16], at: [0, 0.88 - Math.abs(z) * 0.2, z - 0.06], turn: [z * 0.8, 0, 0], paint: accent });
      return { shapes, face: { y: 0.74, z: 0.86, spread: 0.12, size: 0.1 }, height: 1.0, floats: false, sash: { at: [0, 0.42, 0], radii: [0.8, 0.69], roundness: 2.2, tilt: -0.3, leans: 0, squares: "side" } };
    }
    case "warden": {
      // A squat block with a round shield on one arm.
      const shapes: Shape[] = [
        { kind: "box", size: [1.06, 0.72, 0.7], round: { segments: 3, radius: 0.16 }, at: [0, 0.56, 0], paint: base },
        ...[-1, 1].map((x): Shape => ({ kind: "box", size: [0.3, 0.22, 0.34], round: { segments: 2, radius: 0.08 }, at: [x * 0.26, 0.11, 0], paint: dark })),
        { kind: "cylinder", top: 0.31, bottom: 0.31, height: 0.08, sides: 24, at: [-0.62, 0.54, 0.08], turn: [0, 0.35, Math.PI / 2], paint: accent },
        { kind: "sphere", radius: 0.09, detail: 12, at: [-0.66, 0.54, 0.1], scale: [0.5, 1, 1], paint: dark },
        { kind: "box", size: [0.24, 0.5, 0.3], round: { segments: 2, radius: 0.09 }, at: [0.7, 0.5, 0.04], paint: dark, motion: "limb" },
      ];
      if (body.top === "helm") {
        shapes.push({ kind: "sphere", radius: 0.4, at: [0, 0.92, 0], scale: [1.2, 0.55, 1], paint: dark });
        shapes.push({ kind: "box", size: [0.08, 0.16, 0.5], at: [0, 1.12, -0.02], paint: accent });
      }
      if (body.top === "horns") for (const x of [-1, 1]) shapes.push({ kind: "cone", radius: 0.1, height: 0.32, at: [x * 0.4, 1.04, 0], turn: [0, 0, -x * 0.5], paint: accent });
      if (body.top === "visor") shapes.push({ kind: "box", size: [1.0, 0.14, 0.76], round: { segments: 2, radius: 0.05 }, at: [0, 0.9, 0], paint: dark });
      return { shapes, face: { y: 0.66, z: 0.35, spread: 0.2, size: 0.12 }, height: 1.2, floats: false, sash: { at: [0, 0.34, 0], radii: [0.59, 0.4], roundness: 4, tilt: -0.2, leans: 0, squares: "front" } };
    }
    case "wisp": {
      // A head trailing a tapering tail, off the ground.
      const { curl } = body;
      const shapes: Shape[] = [
        { kind: "sphere", radius: 0.42, at: [0, 0.98, 0.05], paint: base },
        ...[1, 2, 3, 4, 5].map((i): Shape => ({ kind: "sphere", radius: 0.36 - i * 0.055, detail: 14, at: [Math.sin(i * curl) * 0.16, 0.9 - i * 0.15, -0.14 - i * 0.2], paint: i % 2 ? light : base })),
        { kind: "octahedron", radius: 0.11, at: [Math.sin(6 * curl) * 0.16, 0.02, -1.32], paint: accent },
      ];
      if (body.top === "horns") for (const x of [-1, 1]) shapes.push({ kind: "cone", radius: 0.08, height: 0.32, at: [x * 0.22, 1.42, 0], turn: [0, 0, -x * 0.3], paint: accent });
      if (body.top === "ears") for (const x of [-1, 1]) shapes.push({ kind: "sphere", radius: 0.16, detail: 12, at: [x * 0.42, 1.12, -0.05], scale: [0.45, 1.25, 0.8], turn: [0, 0, x * 0.5], paint: light });
      if (body.top === "crest") shapes.push({ kind: "cone", radius: 0.16, height: 0.42, sides: 4, at: [0, 1.46, -0.08], scale: [0.35, 1, 1], paint: accent });
      if (body.top === "halo") shapes.push({ kind: "ring", radius: 0.28, tube: 0.035, sides: 8, steps: 24, at: [0, 1.56, 0.05], turn: [Math.PI / 2, 0, 0], paint: accent, outline: false, motion: "spinner" });
      return { shapes, face: { y: 1.0, z: 0.43, spread: 0.17, size: 0.125 }, height: 1.5, floats: true, sash: aroundBall([0, 0.98, 0.05], 0.42, -0.2, -0.15) };
    }
    case "orb": {
      // A ball with a ring round it, off the ground.
      const shapes: Shape[] = [
        { kind: "sphere", radius: 0.52, detail: 24, at: [0, 0.66, 0], paint: base },
        { kind: "ring", radius: 0.66, tube: 0.045, sides: 8, steps: 36, at: [0, 0.66, 0], turn: [Math.PI / 2 - 0.5, 0, 0.3], paint: accent, outline: false, motion: "spinner" },
      ];
      const feelers = body.top === "feeler" ? [0] : body.top === "feelers" ? [-1, 1] : [];
      for (const x of feelers) {
        shapes.push({ kind: "cylinder", top: 0.022, bottom: 0.022, height: 0.34, at: [x * 0.2, 1.3, 0], turn: [0, 0, -x * 0.3], paint: dark, outline: false });
        shapes.push({ kind: "sphere", radius: 0.075, detail: 12, at: [x * 0.26, 1.48, 0], paint: accent });
      }
      if (body.top === "ears") for (const x of [-1, 1]) shapes.push({ kind: "cone", radius: 0.14, height: 0.3, at: [x * 0.3, 1.16, 0], turn: [0, 0, -x * 0.5], paint: base });
      return { shapes, face: { y: 0.72, z: 0.47, spread: 0.19, size: 0.14 }, height: 1.4, floats: true, sash: aroundBall([0, 0.66, 0], 0.52, 0.28, -0.45) };
    }
    case "critter": {
      // A small animal on two feet.
      const shapes: Shape[] = [
        { kind: "capsule", radius: 0.3, length: 0.26, caps: 6, sides: 16, at: [0, 0.48, 0], paint: base },
        { kind: "sphere", radius: 0.24, detail: 14, at: [0, 0.44, 0.14], scale: [0.9, 1, 0.7], paint: light, outline: false },
        { kind: "sphere", radius: 0.42, at: [0, 1.06, 0.02], paint: base },
        ...[-1, 1].flatMap((x): Shape[] => [
          { kind: "sphere", radius: 0.12, detail: 12, at: [x * 0.42, 0.44, 0.06], scale: [0.8, 1.3, 0.8], paint: base, motion: "limb" },
          { kind: "sphere", radius: 0.15, detail: 12, at: [x * 0.17, 0.08, 0.08], scale: [1, 0.55, 1.4], paint: dark },
        ]),
      ];
      if (body.top === "ears") for (const x of [-1, 1]) shapes.push({ kind: "cone", radius: 0.15, height: 0.36, at: [x * 0.28, 1.5, 0], turn: [0, 0, -x * 0.3], paint: base });
      if (body.top === "buns") for (const x of [-1, 1]) shapes.push({ kind: "sphere", radius: 0.17, detail: 14, at: [x * 0.34, 1.42, 0], paint: dark });
      if (body.top === "bunny") for (const x of [-1, 1]) shapes.push({ kind: "capsule", radius: 0.09, length: 0.4, caps: 4, sides: 10, at: [x * 0.2, 1.68, -0.02], turn: [0, 0, -x * 0.18], paint: base });
      if (body.top === "horn") shapes.push({ kind: "cone", radius: 0.1, height: 0.3, at: [0, 1.56, 0], turn: [0.3, 0, 0], paint: accent });
      shapes.push(
        body.tail === "ball"
          ? { kind: "sphere", radius: 0.15, detail: 12, at: [0, 0.36, -0.4], turn: [-1.9, 0, 0], paint: accent }
          : { kind: "cone", radius: 0.11, height: 0.42, at: [0, 0.36, -0.4], turn: [-1.9, 0, 0], paint: accent },
      );
      return { shapes, face: { y: 1.08, z: 0.4, spread: 0.17, size: 0.125 }, height: 1.6, floats: false, sash: { at: [0, 0.5, 0], radii: [0.39, 0.34], roundness: 2, tilt: -0.6, leans: 0, squares: "side" } };
    }
    case "brawler": {
      // A heavy pear of a body with its gloves up.
      const shapes: Shape[] = [
        { kind: "sphere", radius: 0.46, detail: 22, at: [0, 0.62, 0], scale: [1, 1.08, 0.9], paint: base },
        { kind: "sphere", radius: 0.3, detail: 14, at: [0, 0.5, 0.18], scale: [0.95, 1, 0.7], paint: light, outline: false },
        ...[-1, 1].flatMap((x): Shape[] => [
          { kind: "sphere", radius: 0.2, detail: 16, at: [x * 0.6, 0.46, 0.14], paint: accent, motion: "limb" },
          { kind: "sphere", radius: 0.15, detail: 12, at: [x * 0.2, 0.08, 0.08], scale: [1, 0.55, 1.4], paint: dark },
        ]),
      ];
      if (body.top === "band") {
        shapes.push({ kind: "ring", radius: 0.34, tube: 0.05, sides: 8, steps: 28, at: [0, 0.98, 0], turn: [Math.PI / 2, 0, 0], scale: [1, 0.92, 1], paint: accent, outline: false });
        shapes.push({ kind: "sphere", radius: 0.07, detail: 10, at: [-0.12, 0.98, -0.32], paint: accent });
      }
      if (body.top === "mohawk") for (const z of [0.12, -0.02, -0.16]) shapes.push({ kind: "cone", radius: 0.08, height: 0.24, at: [0, 1.15 - Math.abs(z + 0.02) * 0.3, z], turn: [-z, 0, 0], paint: accent });
      if (body.top === "ears") for (const x of [-1, 1]) shapes.push({ kind: "sphere", radius: 0.12, detail: 12, at: [x * 0.3, 1.08, 0], scale: [1, 1, 0.5], paint: dark });
      return { shapes, face: { y: 0.8, z: 0.38, spread: 0.17, size: 0.12 }, height: 1.3, floats: false, sash: aroundBall([0, 0.62, 0], 0.46, 0.1, -0.5, 0.41) };
    }
    case "rhino": {
      // Upright and thickset, with a horn on its snout.
      const shapes: Shape[] = [
        { kind: "capsule", radius: 0.38, length: 0.3, caps: 6, sides: 18, at: [0, 0.56, 0], paint: base },
        { kind: "sphere", radius: 0.28, detail: 14, at: [0, 0.5, 0.2], scale: [0.9, 1, 0.7], paint: light, outline: false },
        { kind: "sphere", radius: 0.36, at: [0, 1.2, 0.04], paint: base },
        { kind: "sphere", radius: 0.18, detail: 14, at: [0, 1.0, 0.32], scale: [1.15, 0.85, 1], paint: light },
        { kind: "cone", radius: 0.08, height: 0.26, at: [0, 1.06, 0.48], turn: [0.9, 0, 0], paint: accent },
        ...[-1, 1].flatMap((x): Shape[] => [
          { kind: "capsule", radius: 0.11, length: 0.24, caps: 4, sides: 10, at: [x * 0.54, 0.5, 0.1], turn: [0, 0, x * 0.15], paint: dark, motion: "limb" },
          { kind: "box", size: [0.24, 0.16, 0.3], round: { segments: 2, radius: 0.06 }, at: [x * 0.2, 0.08, 0.04], paint: dark },
        ]),
      ];
      if (body.horns === "two") shapes.push({ kind: "cone", radius: 0.055, height: 0.15, at: [0, 1.2, 0.4], turn: [0.6, 0, 0], paint: accent });
      if (body.top === "ears") for (const x of [-1, 1]) shapes.push({ kind: "cone", radius: 0.08, height: 0.18, at: [x * 0.24, 1.5, 0], turn: [0, 0, -x * 0.4], paint: base });
      if (body.top === "plates") for (const [y, z] of [[1.42, -0.18], [1.12, -0.38], [0.82, -0.42]]) shapes.push({ kind: "box", size: [0.06, 0.18, 0.16], at: [0, y, z], turn: [-0.6, 0, 0], paint: accent });
      return { shapes, face: { y: 1.27, z: 0.31, spread: 0.16, size: 0.1 }, height: 1.6, floats: false, sash: { at: [0, 0.58, 0], radii: [0.45, 0.41], roundness: 2, tilt: -0.5, leans: 0, squares: "side" } };
    }
    case "bird": {
      // A small bird with blade wings swept back, and a bar chart for a crest.
      const shapes: Shape[] = [
        { kind: "sphere", radius: 0.42, detail: 22, at: [0, 0.56, 0], scale: [0.95, 1.2, 0.95], paint: base },
        { kind: "sphere", radius: 0.28, detail: 14, at: [0, 0.44, 0.17], scale: [0.95, 1, 0.75], paint: light, outline: false },
        ...[-1, 1].flatMap((x): Shape[] => [
          { kind: "cone", radius: 0.13, height: 0.52, sides: 8, at: [x * 0.4, 0.58, -0.22], turn: [-1.98, 0, x * 0.2], scale: [0.35, 1, 1], paint: dark, motion: "limb" },
          { kind: "cone", radius: 0.06, height: 0.14, sides: 8, at: [x * 0.14, 0.06, 0.1], turn: [Math.PI / 2, 0, 0], paint: BEAK },
        ]),
        { kind: "cone", radius: 0.08, height: 0.28, sides: 8, at: [0, 0.72, 0.5], turn: [Math.PI / 2, 0, 0], paint: BEAK },
        ...body.bars.map((tall, i): Shape => ({ kind: "box", size: [0.08, tall, 0.08], at: [(i - 1) * 0.12, 1.02 + tall / 2, -0.04], paint: accent })),
        { kind: "cone", radius: 0.12, height: 0.36, sides: 6, at: [0, 0.34, -0.46], turn: [-2.1, 0, 0], scale: [1.4, 1, 0.4], paint: dark },
      ];
      return { shapes, face: { y: 0.8, z: 0.37, spread: 0.15, size: 0.11 }, height: 1.4, floats: false, sash: aroundBall([0, 0.56, 0], 0.43, 0.06, -0.6, 0.4) };
    }
    case "fox": {
      // A small fox: a pointed snout, pointed ears, and a big tail.
      const shapes: Shape[] = [
        { kind: "capsule", radius: 0.27, length: 0.18, caps: 6, sides: 16, at: [0, 0.4, 0], paint: base },
        { kind: "sphere", radius: 0.2, detail: 14, at: [0, 0.42, 0.14], scale: [0.9, 1, 0.7], paint: light, outline: false },
        { kind: "sphere", radius: 0.32, at: [0, 0.92, 0.04], scale: [1.08, 0.94, 1], paint: base },
        { kind: "cone", radius: 0.12, height: 0.26, sides: 12, at: [0, 0.83, 0.38], turn: [Math.PI / 2, 0, 0], paint: light },
        { kind: "sphere", radius: 0.045, detail: 10, at: [0, 0.83, 0.51], paint: PUPIL, outline: false },
        ...[-1, 1].flatMap((x): Shape[] => [
          body.ears === "tall"
            ? { kind: "cone", radius: 0.1, height: 0.34, at: [x * 0.17, 1.26, 0], turn: [0, 0, -x * 0.22], paint: base }
            : { kind: "cone", radius: 0.13, height: 0.26, at: [x * 0.25, 1.17, 0], turn: [0, 0, -x * 0.55], paint: base },
          { kind: "sphere", radius: 0.09, detail: 12, at: [x * 0.33, 0.36, 0.08], scale: [0.8, 1.3, 0.8], paint: base, motion: "limb" },
          { kind: "sphere", radius: 0.11, detail: 12, at: [x * 0.13, 0.06, 0.08], scale: [1, 0.55, 1.5], paint: dark },
        ]),
      ];
      if (body.tail === "brush") {
        shapes.push({ kind: "sphere", radius: 0.2, detail: 16, at: [0, 0.6, -0.46], scale: [0.7, 0.7, 1.6], turn: [0.64, 0, 0], paint: base });
        shapes.push({ kind: "sphere", radius: 0.12, detail: 12, at: [0, 0.82, -0.7], paint: light });
      }
      if (body.tail === "blade") shapes.push({ kind: "cone", radius: 0.13, height: 0.62, sides: 4, at: [0, 0.6, -0.48], turn: [-0.93, 0, 0], scale: [0.3, 1, 1], paint: accent });
      return { shapes, face: { y: 0.96, z: 0.33, spread: 0.13, size: 0.1 }, height: 1.4, floats: false, sash: { at: [0, 0.42, 0], radii: [0.34, 0.3], roundness: 2, tilt: -0.55, leans: 0, squares: "side" } };
    }
    case "imp": {
      // A small round imp with horns, bat wings and a pointed tail.
      const shapes: Shape[] = [
        { kind: "sphere", radius: 0.38, detail: 22, at: [0, 0.6, 0], scale: [1, 1.1, 0.95], paint: base },
        { kind: "sphere", radius: 0.24, detail: 14, at: [0, 0.48, 0.18], scale: [0.95, 1, 0.7], paint: light, outline: false },
        ...[-1, 1].flatMap((x): Shape[] => [
          { kind: "cone", radius: 0.2, height: 0.36, sides: 3, at: [x * 0.42, 0.82, -0.26], turn: [0, 0, -x * 1.1], scale: [1, 1, 0.25], paint: dark, motion: "limb" },
          { kind: "sphere", radius: 0.11, detail: 12, at: [x * 0.15, 0.07, 0.06], scale: [1, 0.55, 1.4], paint: dark },
        ]),
        { kind: "cylinder", top: 0.025, bottom: 0.025, height: 0.4, at: [0, 0.37, -0.49], turn: [-1.2, 0, 0], paint: dark, outline: false },
        { kind: "cone", radius: 0.08, height: 0.16, sides: 4, at: [0, 0.45, -0.68], turn: [-1.2, 0, 0], paint: accent },
      ];
      if (body.horns === "curved") for (const x of [-1, 1]) shapes.push({ kind: "cone", radius: 0.08, height: 0.3, at: [x * 0.22, 1.02, 0.02], turn: [0.3, 0, -x * 0.7], paint: accent });
      if (body.horns === "straight") for (const x of [-1, 1]) shapes.push({ kind: "cone", radius: 0.07, height: 0.34, at: [x * 0.16, 1.08, 0], turn: [0, 0, -x * 0.15], paint: accent });
      if (body.horns === "single") shapes.push({ kind: "cone", radius: 0.1, height: 0.36, at: [0, 1.12, 0.04], turn: [0.2, 0, 0], paint: accent });
      return { shapes, face: { y: 0.7, z: 0.33, spread: 0.14, size: 0.11 }, height: 1.3, floats: false, sash: aroundBall([0, 0.6, 0], 0.39, 0.17, -0.4, 0.36) };
    }
    case "tome": {
      // A book with a face on its cover, off the ground.
      const shapes: Shape[] = [
        { kind: "box", size: [0.7, 0.92, 0.3], round: { segments: 2, radius: 0.04 }, at: [0, 0.72, 0], paint: PAGES },
        ...[-0.17, 0.17].map((z): Shape => ({ kind: "box", size: [0.8, 1.0, 0.07], round: { segments: 2, radius: 0.03 }, at: [0.02, 0.72, z], paint: base })),
        { kind: "box", size: [0.08, 1.0, 0.4], round: { segments: 2, radius: 0.03 }, at: [-0.38, 0.72, 0], paint: dark },
        { kind: "box", size: [0.1, 0.36, 0.02], at: [0.2, 1.08, 0.02], paint: accent, outline: false },
        ...[-1, 1].map((x): Shape => ({ kind: "sphere", radius: 0.09, detail: 12, at: [x * 0.5, 0.62, 0.06], paint: dark, motion: "limb" })),
      ];
      if (body.face === "glasses") for (const x of [-1, 1]) shapes.push({ kind: "ring", radius: 0.11, tube: 0.02, sides: 8, steps: 20, at: [x * 0.16, 0.8, 0.22], paint: GLASSES, outline: false, layer: "face" });
      return { shapes, face: { y: 0.8, z: 0.21, spread: 0.16, size: 0.1 }, height: 1.3, floats: true, sash: { at: [0.02, 0.42, 0], radii: [0.47, 0.25], roundness: 8, tilt: 0.2, leans: 0, squares: "front" } };
    }
  }
}

const starPoints = (): Point[] =>
  Array.from({ length: 10 }, (_, i) => {
    const reach = i % 2 ? 0.1 : 0.23;
    const angle = (i / 10) * Math.PI * 2 + Math.PI / 2;
    return [Math.cos(angle) * reach, Math.sin(angle) * reach];
  });

/** What floats over the head, around its own middle. */
function emblemShapes(emblem: Emblem, accent: string): Shape[] {
  switch (emblem) {
    case "star":
      return [{ kind: "slice", points: starPoints(), depth: 0.07, at: [0, 0, 0], paint: GOLD }];
    case "coin":
      return [{ kind: "cylinder", top: 0.18, bottom: 0.18, height: 0.05, sides: 24, at: [0, 0, 0], turn: [Math.PI / 2, 0, 0], paint: GOLD }];
    case "camera":
      return [
        { kind: "cylinder", top: 0.17, bottom: 0.17, height: 0.1, sides: 24, at: [0, 0, 0], turn: [Math.PI / 2, 0, 0], paint: LENS },
        { kind: "sphere", radius: 0.1, detail: 14, at: [0, 0, 0.04], turn: [Math.PI / 2, 0, 0], scale: [1, 0.5, 1], paint: GLASS, outline: false },
      ];
    case "lock":
      return [
        { kind: "box", size: [0.3, 0.24, 0.1], round: { segments: 2, radius: 0.03 }, at: [0, 0, 0], paint: GOLD },
        { kind: "ring", radius: 0.09, tube: 0.028, sides: 8, steps: 16, arc: Math.PI, at: [0, 0.12, 0], paint: STEEL, outline: false },
      ];
    case "bolt":
      return [{ kind: "slice", points: [[0.04, 0.26], [-0.14, -0.02], [-0.02, -0.02], [-0.06, -0.26], [0.14, 0.04], [0.02, 0.04]], depth: 0.07, at: [0, 0, 0], paint: GOLD }];
    case "heart":
      return [{ kind: "slice", points: [[0, -0.2], [-0.2, 0.02], [-0.2, 0.14], [-0.11, 0.2], [0, 0.12], [0.11, 0.2], [0.2, 0.14], [0.2, 0.02]], depth: 0.07, at: [0, 0, 0], paint: RED }];
    case "pin":
      return [
        { kind: "cone", radius: 0.1, height: 0.26, at: [0, 0, 0], turn: [Math.PI, 0, 0], paint: RED },
        { kind: "sphere", radius: 0.13, detail: 14, at: [0, 0.14, 0], turn: [Math.PI, 0, 0], paint: RED },
      ];
    case "cloud":
      return [
        { kind: "sphere", radius: 0.15, detail: 14, at: [0, 0, 0], paint: CLOUD },
        ...[-0.16, 0.16].map((x): Shape => ({ kind: "sphere", radius: 0.11, detail: 12, at: [x, -0.04, 0], paint: CLOUD })),
      ];
    case "gear":
      return [
        { kind: "ring", radius: 0.13, tube: 0.05, sides: 8, steps: 20, at: [0, 0, 0], paint: accent, outline: false },
        ...Array.from({ length: 6 }, (_, i): Shape => {
          const angle = (i / 6) * Math.PI * 2;
          return { kind: "box", size: [0.07, 0.09, 0.09], at: [Math.cos(angle) * 0.2, Math.sin(angle) * 0.2, 0], turn: [0, 0, angle + Math.PI / 2], paint: accent, outline: false };
        }),
      ];
  }
}

/** One eye around its own middle: the white, the pupil, and a glint. */
function eyeShapes(size: number, tall: number): Shape[] {
  return [
    { kind: "sphere", radius: size, detail: 16, at: [0, 0, 0], scale: [1, tall, 0.45], paint: EYE_WHITE },
    { kind: "sphere", radius: size * 0.56, detail: 12, at: [0, -size * 0.06, size * 0.34], scale: [1, tall, 0.4], paint: PUPIL, outline: false },
    { kind: "sphere", radius: size * 0.2, detail: 8, at: [size * 0.2, size * 0.26 * tall, size * 0.52], paint: EYE_WHITE, outline: false, shading: "none" },
  ];
}

/** GitHub's light contribution graph: a white page and its empty square. */
const SASH_BAND = "#ffffff";
export const SASH_EMPTY = "#ebedf0";
const SASH_INK = "#12151a";
export const SASH_SQUARES = 5;
const SQUARE = 0.115;
const SQUARE_GAP = 0.028;
const ROW_LENGTH = SASH_SQUARES * SQUARE + (SASH_SQUARES - 1) * SQUARE_GAP;
const BAND_WIDTH = 0.155;
const INK_EDGE = 0.016;
/** How far the squares sit out from the band, so a flat square's middle clears a curved band. */
const SQUARE_LIFT = 0.014;
const INK_SINK = 0.004;
const BAND_STEPS = 48;
const PATH_STEPS = 192;
// The least space between a round body's two rows on top of its flank, about a square, so a
// steep camera that sees both rows' ends there reads them as two groups.
const ROW_SPACING = 0.12;
/** How far outside the body a band sits. */
const SASH_CLEARANCE = 0.02;

/** A point round the band's middle line, 0 at the front, and the way out from it there. */
type Along = { point: [number, number]; out: [number, number] };

/** The band's middle line: its length, the point a distance round from the front, and how far round its left side is. */
function bandPath({ radii: [across, deep], roundness }: SashFit): { length: number; at: (distance: number) => Along; side: number } {
  const power = 2 / roundness;
  const curve = (angle: number): [number, number] => [across * Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** power, deep * Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** power];
  // Sampled from the back (-π) round to the back again, so the front sits half way.
  const points = Array.from({ length: PATH_STEPS + 1 }, (_, i) => curve(-Math.PI + (i / PATH_STEPS) * Math.PI * 2));
  const lengths = points.reduce<number[]>((sums, point, i) => [...sums, i ? sums[i - 1] + Math.hypot(point[0] - points[i - 1][0], point[1] - points[i - 1][1]) : 0], []);
  const length = lengths[PATH_STEPS];
  const front = lengths[PATH_STEPS / 2];
  const at = (distance: number): Along => {
    const wanted = (((distance + front) % length) + length) % length;
    const step = Math.max(1, lengths.findIndex((sum) => sum >= wanted));
    const [from, to] = [points[step - 1], points[step]];
    const k = (wanted - lengths[step - 1]) / (lengths[step] - lengths[step - 1] || 1);
    const [dx, dz] = [to[0] - from[0], to[1] - from[1]];
    const run = Math.hypot(dx, dz) || 1;
    return { point: [from[0] + dx * k, from[1] + dz * k], out: [-dz / run, dx / run] };
  };
  // A round body's band is rolled down to the right (a negative tilt), so it rises on its left.
  const side = lengths[PATH_STEPS / 4] - front;
  return { length, at, side };
}

/**
 * Where a sash's rows of squares sit along its band, and how much smaller than full size they
 * are. The board's camera looks at the other team's fronts and at your own creatures' backs,
 * so each body needs a row facing each way. A flat front and back each take one. On a round
 * body the bulge hides a band's front and back from above, so its rows sit on the raised left
 * flank, one each side of the middle, in a quarter of the band each: they face up and toward
 * the front, and up and toward the back. A narrow band shrinks its squares to fit.
 */
function rowsOf(fit: SashFit, path: ReturnType<typeof bandPath>): { middles: number[]; scale: number } {
  if (fit.squares === "front") return { middles: [0, path.length / 2], scale: 1 };
  const quarter = path.length / 4;
  // Each row sits in the middle of its quarter, 45° off the front or the back, and is at most
  // the quarter less the spacing long, so the two stop that far apart on top of the flank.
  const scale = Math.min(1, (quarter - ROW_SPACING) / ROW_LENGTH);
  return { middles: [path.side + quarter / 2, path.side - quarter / 2], scale };
}

/** The band, its ink edges, and five squares in each row, lit as many as the cost. */
function sashQuads(fit: SashFit, sash: Sash): Quad[] {
  const path = bandPath(fit);
  const [cos, sin] = [Math.cos(fit.tilt), Math.sin(fit.tilt)];
  const place = ([x, y, z]: Vector): Vector => [fit.at[0] + x * cos - y * sin, fit.at[1] + x * sin + y * cos, fit.at[2] + z];
  const turn = ([x, y, z]: Vector): Vector => [x * cos - y * sin, x * sin + y * cos, z];
  const [leanCos, leanSin] = [Math.cos(fit.leans), Math.sin(fit.leans)];
  const strip = (piece: Quad["piece"], from: number, to: number, half: number, lift: number, paint: string): Quad => {
    const [start, end] = [path.at(from), path.at(to)];
    // Out from the band and up across it, both leaned back with the band.
    const outOf = (along: Along): Vector => [along.out[0] * leanCos, leanSin, along.out[1] * leanCos];
    const acrossOf = (along: Along): Vector => [-along.out[0] * leanSin, leanCos, -along.out[1] * leanSin];
    const point = (along: Along, height: number): Vector => {
      const [out, across] = [outOf(along), acrossOf(along)];
      return place([along.point[0] + out[0] * lift + across[0] * height, out[1] * lift + across[1] * height, along.point[1] + out[2] * lift + across[2] * height]);
    };
    const [startOut, endOut] = [outOf(start), outOf(end)];
    const out = turn(normalised([startOut[0] + endOut[0], startOut[1] + endOut[1], startOut[2] + endOut[2]]));
    return { piece, corners: [point(start, -half), point(end, -half), point(end, half), point(start, half)], normal: out, paint };
  };
  const step = path.length / BAND_STEPS;
  const band = Array.from({ length: BAND_STEPS }, (_, i) => [strip("band", i * step, (i + 1) * step, BAND_WIDTH / 2 + INK_EDGE, -INK_SINK, SASH_INK), strip("band", i * step, (i + 1) * step, BAND_WIDTH / 2, 0, SASH_BAND)]).flat();
  // The band runs round from the front toward the right flank, so every row reads from the
  // viewer's left, whichever side the viewer stands on.
  const { middles, scale } = rowsOf(fit, path);
  const [square, pitch] = [SQUARE * scale, (SQUARE + SQUARE_GAP) * scale];
  const squares = middles.flatMap((middle) =>
    Array.from({ length: SASH_SQUARES }, (_, i) => {
      const centre = middle + (i - (SASH_SQUARES - 1) / 2) * pitch;
      return strip("square", centre - square / 2, centre + square / 2, square / 2, SQUARE_LIFT, i < sash.lit ? sash.tier : SASH_EMPTY);
    }),
  );
  return [...band, ...squares];
}

function normalised([x, y, z]: Vector): Vector {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

/** Every part of a repo's creature, before the creature's own scale. */
export function assemble(recipe: CreatureRecipe): Assembly {
  const plan = planOf(recipe.body, recipe.paints);
  const size = plan.face.size * recipe.eyeSize;
  const { face } = plan;
  return {
    body: plan.shapes,
    emblem: recipe.emblem ? { at: [0, plan.height + (plan.floats ? EMBLEM_OVER_FLOATING : EMBLEM_OVER), 0], shapes: emblemShapes(recipe.emblem, recipe.paints.accent) } : null,
    eyes: [-1, 1].map((x) => ({ at: [x * face.spread, face.y, face.z], shapes: eyeShapes(size, recipe.eyeHeight) })),
    // A mouth, small enough to read as a mouth on any face.
    mouth: { kind: "sphere", radius: size * 0.3, detail: 10, at: [0, face.y - size * 1.25, face.z + 0.01], scale: [1.5, 0.7, 0.4], paint: PUPIL, outline: false },
    sash: recipe.sash ? sashQuads(plan.sash, recipe.sash) : [],
    height: plan.height,
    floats: plan.floats,
  };
}
