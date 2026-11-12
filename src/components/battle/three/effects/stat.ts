import * as THREE from "three";
import type { Stat } from "../../../../../server/run/hooks";
import { INK, easeInOut, easeOut, overshoot } from "../kit";
import { CAST_LEAD, EFFECT_COLOR, type EffectActor, type EffectPlayer, type EffectStage } from "./stage";

// A stat going up: gold chevrons rise around the creature. Going down: red chevrons fall.
// Either way a thin ring pulses out at its feet in the same colour. The colour says only
// up or down; the stat changes the motion, so a player feels speed, guard and attack apart.

type Direction = "up" | "down";

type Motion = {
  /** How long one chevron takes to rise or fall, in fight-seconds. */
  travel: number;
  /** How long after the one before it the next chevron starts. */
  stagger: number;
  /** Chevrons stretched along their path (above 1) read as a streak. */
  stretch: number;
  /** How thick the ring at the feet is, in world units. */
  ringWidth: number;
  ringLife: number;
  /** A second stat on the same cast waits a little, so the two do not land at once. */
  lag: number;
};

const ATTACK: Motion = { travel: 0.36, stagger: 0.05, stretch: 1, ringWidth: 0.035, ringLife: 0.4, lag: 0 };
const MOTIONS: Record<Stat, Motion> = {
  attack: ATTACK,
  critical: { ...ATTACK, lag: 0.03 },
  luck: { ...ATTACK, lag: 0.05 },
  speed: { travel: 0.24, stagger: 0.03, stretch: 1.6, ringWidth: 0.03, ringLife: 0.32, lag: 0.07 },
  guard: { travel: 0.4, stagger: 0.06, stretch: 0.85, ringWidth: 0.08, ringLife: 0.46, lag: 0.04 },
};

/** A stat going down starts after one going up: bus factor's attack up, then its guard down. */
const DOWN_LAG = 0.14;

/** Half the chevron's width, its height and the thickness of its arms, in world units. */
const CHEVRON_WIDTH = 0.19;
const CHEVRON_HEIGHT = 0.15;
const CHEVRON_THICKNESS = 0.075;
/** The dark rim around each chevron, and how far a sharp corner of it may reach, in rims. */
const RIM = 0.024;
const MITER_LIMIT = 2;
/** Where the chevrons run between, as a share of the creature's height: below the HP bar. */
const LOW_POINT = 0.15;
const HIGH_POINT = 0.95;
/** How far apart the chevrons stand, side to side as the camera sees it, and how far toward the camera. */
const SPREAD = 0.4;
const FORWARD = 0.22;
/** The middle chevron leads; the outer ones trail it, so the three read as one big arrow. */
const LEADING_LIFT = 0.12;

/** Where a chevron stands, in `SPREAD`s from the middle, and how many staggers it waits. */
type Column = { side: number; order: number };
const ALONE: Column = { side: 0, order: 0 };
/**
 * Up: one arrow of three, the middle leading. Down: a pair standing between the up
 * columns, so a stat up and a stat down on the same cast (bus factor) cross without
 * landing on each other.
 */
const COLUMNS: Record<Direction, Column[]> = {
  up: [ALONE, { side: -1, order: 1 }, { side: 1, order: 1 }],
  down: [{ side: -0.5, order: 0 }, { side: 0.5, order: 0 }],
};

/** The ring opens to just inside where the gold cast ring starts (0.4, opening out to about 0.74), so the two never sit on each other. */
const RING_RADIUS = 0.26;
const RING_GROWTH = 0.5;
const RING_FLOOR = 0.13;
const RING_OPACITY = 0.9;

/** At most this many meshes a cast: phones. */
const MESH_BUDGET = 12;
const MOST_CHEVRONS = 3;

/** The same stat moving the same way on the same creature again this soon draws quietly: add tests fires on every hit taken. */
const REPEAT_WINDOW = 3;
const REPEAT_OPACITY = 0.55;

const REDUCED_LIFE = 0.5;
/** The look is freed this long after its last frame, so the last fade is drawn. */
const SPARE = 0.05;
/** Up stands above down, so a stat up and a stat down on the same cast stay apart without moving. */
const REDUCED_POINT: Record<Direction, number> = { up: 0.8, down: 0.45 };

/** How many of each look are still playing on each creature, by stat and direction. */
const playing = new WeakMap<EffectActor, Map<string, number>>();

export const playStat: EffectPlayer<"stat"> = (stage, cast) => {
  const { effect, targets } = cast;
  if (effect.by === 0 || targets.length === 0) return;
  const direction: Direction = effect.by > 0 ? "up" : "down";
  const motion = MOTIONS[effect.stat];
  const color = direction === "up" ? EFFECT_COLOR.up : EFFECT_COLOR.down;
  const chevronCount = Math.max(1, Math.min(MOST_CHEVRONS, Math.floor((MESH_BUDGET - targets.length) / targets.length)));
  const shapes = { chevron: chevronGeometry(), ring: new THREE.RingGeometry(RING_RADIUS, RING_RADIUS + motion.ringWidth, 36) };
  const root = new THREE.Group();
  const delay = CAST_LEAD + motion.lag + (direction === "down" ? DOWN_LAG : 0);
  const life = delay + Math.max(motion.ringLife, motion.travel + motion.stagger * (MOST_CHEVRONS - 1)) + SPARE;
  stage.spawn(root, stage.reduced ? REDUCED_LIFE : life);

  for (const target of targets) {
    const key = `${effect.stat}:${direction}`;
    const repeat = (playing.get(target)?.get(key) ?? 0) > 0;
    count(target, key, 1);
    stage.after(REPEAT_WINDOW, () => count(target, key, -1));
    const look = { root, shapes, color, motion, direction, strength: repeat ? REPEAT_OPACITY : 1 };
    if (stage.reduced) {
      showInPlace(stage, target, look);
      continue;
    }
    pulseRing(stage, target, look, delay);
    const columns = repeat || chevronCount === 1 ? [ALONE] : COLUMNS[direction].slice(0, chevronCount);
    for (const column of columns) sendChevron(stage, target, look, delay, column);
  }
};

type Look = {
  root: THREE.Group;
  shapes: { chevron: THREE.BufferGeometry; ring: THREE.BufferGeometry };
  color: number;
  motion: Motion;
  direction: Direction;
  /** 1 for the first time, less for a quick repeat. */
  strength: number;
};

function count(target: EffectActor, key: string, change: number) {
  const counts = playing.get(target) ?? new Map<string, number>();
  playing.set(target, counts);
  counts.set(key, Math.max(0, (counts.get(key) ?? 0) + change));
}

/** A V pointing up, centred on (0, 0), inside a dark rim: gold on a gold creature still reads. A chevron going down is the same V turned over. */
function chevronGeometry(): THREE.BufferGeometry {
  const half = CHEVRON_WIDTH;
  const top = CHEVRON_HEIGHT;
  const outline = [
    new THREE.Vector2(-half, 0),
    new THREE.Vector2(0, top),
    new THREE.Vector2(half, 0),
    new THREE.Vector2(half, -CHEVRON_THICKNESS),
    new THREE.Vector2(0, top - CHEVRON_THICKNESS),
    new THREE.Vector2(-half, -CHEVRON_THICKNESS),
  ];
  // Two shapes make two groups, drawn in order: the rim with the first material, the V over it with the second.
  const geometry = new THREE.ShapeGeometry([new THREE.Shape(grown(outline, RIM)), new THREE.Shape(outline)]);
  geometry.translate(0, -(top - CHEVRON_THICKNESS) / 2, 0);
  return geometry;
}

/** The outline pushed out by `by` on every side, corners mitred, with a sharp corner's spike cut short. */
function grown(points: THREE.Vector2[], by: number): THREE.Vector2[] {
  const outward = THREE.ShapeUtils.isClockWise(points) ? 1 : -1;
  const normal = (from: THREE.Vector2, to: THREE.Vector2) => {
    const along = to.clone().sub(from).normalize();
    return new THREE.Vector2(-along.y * outward, along.x * outward);
  };
  return points.map((point, index) => {
    const before = points[(index + points.length - 1) % points.length];
    const after = points[(index + 1) % points.length];
    const incoming = normal(before, point);
    const miter = incoming.clone().add(normal(point, after)).normalize();
    const reach = Math.min(by * MITER_LIMIT, by / Math.max(0.01, miter.dot(incoming)));
    return point.clone().add(miter.multiplyScalar(reach));
  });
}

/** The rim and the V of one chevron. Drawn in front of every creature, so a chevron is never lost inside a wide one. */
function chevronMaterials(color: number): THREE.MeshBasicMaterial[] {
  const options = { transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide };
  return [new THREE.MeshBasicMaterial({ ...options, color: INK }), new THREE.MeshBasicMaterial({ ...options, color })];
}

function fade(materials: THREE.MeshBasicMaterial[], opacity: number) {
  for (const material of materials) material.opacity = opacity;
}

function ringMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

/** Side to side as the camera sees it, and toward the camera along the floor. */
function cameraAxes(stage: EffectStage) {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(stage.camera.quaternion).setY(0).normalize();
  const toward = new THREE.Vector3(0, 0, 1).applyQuaternion(stage.camera.quaternion).setY(0).normalize();
  return { right, toward };
}

function pulseRing(stage: EffectStage, target: EffectActor, look: Look, delay: number) {
  const material = ringMaterial(look.color);
  const ring = new THREE.Mesh(look.shapes.ring, material);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 5;
  ring.visible = false;
  look.root.add(ring);
  stage.tween(delay, look.motion.ringLife, (k) => {
    ring.visible = true;
    ring.position.copy(target.at).setY(RING_FLOOR);
    ring.scale.setScalar(1 + easeOut(k) * RING_GROWTH);
    material.opacity = RING_OPACITY * look.strength * (1 - k);
  });
}

function sendChevron(stage: EffectStage, target: EffectActor, look: Look, delay: number, column: Column) {
  const { motion, direction } = look;
  const materials = chevronMaterials(look.color);
  const chevron = new THREE.Mesh(look.shapes.chevron, materials);
  chevron.renderOrder = 6;
  chevron.visible = false;
  look.root.add(chevron);
  const { side, order } = column;
  const { right, toward } = cameraAxes(stage);
  const offset = right.multiplyScalar(side * SPREAD).add(toward.multiplyScalar(FORWARD * (1 - Math.abs(side) * 0.5)));
  const flip = direction === "up" ? 1 : -1;
  const lead = side === 0 ? LEADING_LIFT : 0;
  const from = direction === "up" ? LOW_POINT + lead : HIGH_POINT - lead;
  const to = direction === "up" ? HIGH_POINT + lead : LOW_POINT - lead;
  stage.tween(delay + order * motion.stagger, motion.travel, (k) => {
    chevron.visible = true;
    const height = from + (to - from) * easeInOut(k);
    chevron.position.copy(target.at).setY(target.at.y + target.height * height).add(offset);
    chevron.quaternion.copy(stage.camera.quaternion);
    const pop = Math.min(1, overshoot(Math.min(1, k * 3)));
    chevron.scale.set(pop / Math.sqrt(motion.stretch), pop * motion.stretch * flip, 1);
    fade(materials, look.strength * Math.min(1, k * 5) * Math.min(1, (1 - k) * 2.5));
  });
}

/** Reduced motion: one chevron and the ring, standing still, fading. */
function showInPlace(stage: EffectStage, target: EffectActor, look: Look) {
  const flip = look.direction === "up" ? 1 : -1;
  const { toward } = cameraAxes(stage);
  const chevronLook = chevronMaterials(look.color);
  const chevron = new THREE.Mesh(look.shapes.chevron, chevronLook);
  chevron.position.copy(stage.pointOn(target, REDUCED_POINT[look.direction])).add(toward.multiplyScalar(FORWARD));
  chevron.quaternion.copy(stage.camera.quaternion);
  chevron.scale.set(1, flip, 1);
  chevron.renderOrder = 6;
  const ringLook = ringMaterial(look.color);
  const ring = new THREE.Mesh(look.shapes.ring, ringLook);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(target.at).setY(RING_FLOOR);
  ring.scale.setScalar(1 + RING_GROWTH);
  ring.renderOrder = 5;
  look.root.add(chevron, ring);
  stage.tween(0, REDUCED_LIFE, (k) => {
    fade(chevronLook, look.strength * (1 - k));
    ringLook.opacity = RING_OPACITY * look.strength * (1 - k);
  });
}
