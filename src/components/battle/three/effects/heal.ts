import * as THREE from "three";
import { easeInOut, easeOut, sphere } from "../kit";
import { CAST_LEAD, EFFECT_COLOR, type EffectActor, type EffectPlayer, type EffectStage } from "./stage";

// A heal: green light rises from the floor under each creature it reaches, with a few
// plus signs drifting up through it. The fight's own `hp` event stamps "+n" and flashes
// the creature, so this only draws the light.

/** The share of HP that draws the full column (hotfix). Smaller heals draw less. */
const FULL_SHARE = 0.3;
/** Below this share (lifesteal, on every hit) a heal is only a glint at the feet and one plus. */
const GLINT_SHARE = 0.03;

const COLUMN_RISE = 0.16;
const COLUMN_LIFE = 0.42;
/** Wider than most creatures, so the light wraps the body instead of hiding inside it. */
const COLUMN_BOTTOM_RADIUS = 0.52;
const COLUMN_TOP_RADIUS = 0.44;
const COLUMN_SIDES = 24;
/** How much of the creature's height the full column reaches: under the HP bar. */
const COLUMN_REACH = 0.95;
const COLUMN_SHORTEST = 0.35;
const COLUMN_OPACITY = 0.55;

const DISC_RADIUS = 0.62;
const GLINT_RADIUS = 0.55;
const DISC_SIDES = 32;
const DISC_OPACITY = 1;
/** The light's core is paler than the "+n" green so it still shows on the home side's green tiles. */
const CORE_WHITENESS = 0.3;
const GLINT_LIFE = 0.26;
/** Just over the floor and under the cast ring, so neither flickers through the other. */
const FLOOR_LIFT = 0.12;

const MOST_PLUSES = 5;
const FEWEST_PLUSES = 3;
const PLUS_LIFE = 0.3;
const PLUS_STAGGER = 0.035;
const PLUS_SIZE = 0.6;
const GLINT_PLUS_SIZE = 0.36;
const PLUS_WHITENESS = 0.25;
const PLUS_BRIGHTEST = 1.8;
const PLUS_SPREAD = 0.4;
const PLUS_SWAY = 0.05;
/** Where the pluses start and end, as a share of the creature's height. */
const PLUS_FROM = 0.15;
const PLUS_TO = 0.95;
const GLINT_PLUS_TO = 0.55;
/** Evenly spread pluses round the creature without a pattern the eye can see. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** A phone budget: one cast never draws more pluses than this, however many it heals. */
const MOST_PLUSES_PER_CAST = 12;
/** A phone budget: the meshes one cast may add (the pluses are one more, drawn together). */
const MESHES_PER_CAST = 12;

/** A teammate's heal: a mote flies from the caster to who it heals, so it reads who did it. */
const MOTE_TRAVEL = 0.1;
const MOTE_RADIUS = 0.07;
const MOTE_ARC = 0.45;
const MOTE_HEIGHT = 0.6;
const MOTE_DETAIL = 10;

const REDUCED_LIFE = 0.5;

const PLUS_PIXELS = 16;
const PLUS_ARM_FROM = 5;
const PLUS_ARM_TO = 10;
const PLUS_EDGE = 2;
const OPAQUE = 255;

const green = new THREE.Color(EFFECT_COLOR.heal);
const WHITE = new THREE.Color(0xffffff);

let plusTexture: THREE.DataTexture | undefined;

/** One small white plus, made once and shared by every heal: never a texture per cast. */
function plus(): THREE.DataTexture {
  if (plusTexture) return plusTexture;
  const pixels = new Uint8Array(PLUS_PIXELS * PLUS_PIXELS * 4);
  const inLength = (index: number) => index >= PLUS_EDGE && index < PLUS_PIXELS - PLUS_EDGE;
  const inArm = (index: number) => index >= PLUS_ARM_FROM && index <= PLUS_ARM_TO;
  for (let row = 0; row < PLUS_PIXELS; row++) {
    for (let column = 0; column < PLUS_PIXELS; column++) {
      const lit = (inArm(row) && inLength(column)) || (inArm(column) && inLength(row));
      pixels.fill(lit ? OPAQUE : 0, (row * PLUS_PIXELS + column) * 4, (row * PLUS_PIXELS + column + 1) * 4);
    }
  }
  plusTexture = new THREE.DataTexture(pixels, PLUS_PIXELS, PLUS_PIXELS, THREE.RGBAFormat);
  plusTexture.magFilter = THREE.LinearFilter;
  plusTexture.needsUpdate = true;
  return plusTexture;
}

/** Glowing light added onto the scene: black adds nothing, so a vertex fading to black fades out. */
function glow(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/** An open column, green at the floor fading to nothing at the top. Its bottom sits at 0, its height is 1. */
function columnGeometry(): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(COLUMN_TOP_RADIUS, COLUMN_BOTTOM_RADIUS, 1, COLUMN_SIDES, 1, true);
  geometry.translate(0, 0.5, 0);
  shade(geometry, (point) => (1 - point.y) ** 1.6);
  return geometry;
}

/** A floor disc, green at the middle fading to nothing at the rim. */
function discGeometry(radius: number): THREE.CircleGeometry {
  const geometry = new THREE.CircleGeometry(radius, DISC_SIDES);
  geometry.rotateX(-Math.PI / 2);
  shade(geometry, (point) => 1 - Math.hypot(point.x, point.z) / radius);
  return geometry;
}

function shade(geometry: THREE.BufferGeometry, brightness: (point: THREE.Vector3) => number) {
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const point = new THREE.Vector3();
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index);
    const light = Math.max(0, Math.min(1, brightness(point)));
    color.copy(green).lerp(WHITE, CORE_WHITENESS * light).multiplyScalar(light).toArray(colors, index * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** How big this heal draws, 0 to 1: a square root, so a 5% heal still reads next to a 30% one. */
function strengthOf(share: number): number {
  return Math.min(1, Math.sqrt(share / FULL_SHARE));
}

type Plus = { target: EffectActor; index: number; start: number; angle: number; reach: number };

export const playHeal: EffectPlayer<"heal"> = (stage, cast) => {
  const targets = cast.targets.filter((target) => !target.out);
  if (targets.length === 0) return;
  if (stage.reduced) return playStill(stage, targets, cast.effect.share);
  const glint = cast.effect.share < GLINT_SHARE;
  const strength = strengthOf(cast.effect.share);
  // Only a heal handed to one teammate travels: a team heal or a self heal has no one to point at.
  const travels = cast.effect.aim === "weakest-ally" && targets.some((target) => target !== cast.caster);
  const start = CAST_LEAD + (travels ? MOTE_TRAVEL : 0);
  const root = new THREE.Group();

  const column = glint ? undefined : columnGeometry();
  // A whole team healed at once keeps its columns and drops the floor discs, to stay in the phone budget.
  const withDisc = !column || targets.length * 2 < MESHES_PER_CAST;
  const disc = withDisc ? discGeometry(glint ? GLINT_RADIUS : DISC_RADIUS) : undefined;
  const floors = targets.map((target) => {
    const floor: Floor = { target, disc: disc && new THREE.Mesh(disc, glow()), column: column && new THREE.Mesh(column, glow()) };
    for (const mesh of [floor.disc, floor.column]) if (mesh) root.add(mesh);
    if (floor.disc) floor.disc.renderOrder = 3;
    return floor;
  });

  const pluses = plusesFor(targets, glint, strength, start);
  const points = pluses.length > 0 ? plusPoints(pluses.length, glint) : undefined;
  if (points) root.add(points);

  const moteShape = sphere(MOTE_RADIUS, MOTE_DETAIL);
  const motes = travels ? targets.filter((target) => target !== cast.caster).map((target) => ({ target, mesh: new THREE.Mesh(moteShape, moteMaterial()) })) : [];
  for (const mote of motes) root.add(mote.mesh);

  const floorLife = glint ? GLINT_LIFE : COLUMN_LIFE;
  const plusEnd = pluses.reduce((latest, item) => Math.max(latest, item.start + PLUS_LIFE), 0);
  const life = Math.max(start + floorLife, plusEnd);
  stage.spawn(root, life);
  const casterFrom = stage.pointOn(cast.caster, MOTE_HEIGHT);

  stage.tween(0, life, (k) => {
    const time = k * life;
    for (const floor of floors) drawFloor(floor, (time - start) / floorLife, strength);
    if (points) drawPluses(stage, points, pluses, time);
    for (const mote of motes) drawMote(stage, mote.mesh, cast.caster.out ? casterFrom : stage.pointOn(cast.caster, MOTE_HEIGHT), mote.target, (time - CAST_LEAD) / MOTE_TRAVEL);
  });
};

type Floor = { target: EffectActor; disc: THREE.Mesh | undefined; column: THREE.Mesh | undefined };

function drawFloor(floor: Floor, phase: number, strength: number) {
  const visible = phase > 0 && phase < 1;
  for (const mesh of [floor.disc, floor.column]) if (mesh) mesh.visible = visible;
  if (!visible) return;
  const fade = 1 - easeInOut(phase);
  const grown = easeOut(Math.min(1, (phase * COLUMN_LIFE) / COLUMN_RISE));
  const floorAt = floor.target.at.clone().setY(floor.target.at.y + FLOOR_LIFT);
  if (floor.disc) {
    floor.disc.position.copy(floorAt);
    floor.disc.scale.setScalar(0.6 + 0.4 * grown);
    opacity(floor.disc, DISC_OPACITY * fade * (0.5 + 0.5 * strength));
  }
  if (!floor.column) return;
  const reach = floor.target.height * (COLUMN_SHORTEST + (COLUMN_REACH - COLUMN_SHORTEST) * strength);
  floor.column.position.copy(floorAt);
  floor.column.scale.set(1, Math.max(0.001, reach * grown), 1);
  opacity(floor.column, COLUMN_OPACITY * fade * (0.4 + 0.6 * strength));
}

function opacity(mesh: THREE.Mesh, value: number) {
  (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, value);
}

function plusesFor(targets: EffectActor[], glint: boolean, strength: number, start: number): Plus[] {
  const wanted = glint ? 1 : Math.round(FEWEST_PLUSES + (MOST_PLUSES - FEWEST_PLUSES) * strength);
  const each = Math.max(1, Math.min(wanted, Math.floor(MOST_PLUSES_PER_CAST / targets.length)));
  const reach = glint ? GLINT_PLUS_TO : PLUS_TO;
  return targets.flatMap((target, targetIndex) =>
    Array.from({ length: each }, (_, index) => ({
      target,
      index,
      start: start + index * PLUS_STAGGER,
      angle: (targetIndex * each + index) * GOLDEN_ANGLE,
      reach,
    })),
  );
}

function plusPoints(count: number, glint: boolean): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const material = new THREE.PointsMaterial({
    map: plus(),
    size: glint ? GLINT_PLUS_SIZE : PLUS_SIZE,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    // A plus behind the creature would be lost; a few small ones over it read better.
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = 5;
  points.frustumCulled = false;
  return points;
}

const plusColor = new THREE.Color();

function drawPluses(stage: EffectStage, points: THREE.Points, pluses: Plus[], time: number) {
  const positions = points.geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = points.geometry.getAttribute("color") as THREE.BufferAttribute;
  pluses.forEach((item, slot) => {
    const phase = Math.max(0, Math.min(1, (time - item.start) / PLUS_LIFE));
    const shown = time >= item.start && phase < 1;
    // In, then out: bright early, gone by the top.
    const brightness = shown ? Math.min(1, phase * 4) * (1 - phase) ** 1.5 * PLUS_BRIGHTEST : 0;
    const height = PLUS_FROM + (item.reach - PLUS_FROM) * easeOut(phase);
    const sway = Math.sin(phase * Math.PI * 2 + item.angle) * PLUS_SWAY;
    const radius = PLUS_SPREAD * (0.55 + 0.45 * ((item.index % 2) + 0.5) / 1.5);
    const at = stage.pointOn(item.target, height);
    positions.setXYZ(slot, at.x + Math.cos(item.angle) * radius + sway, at.y, at.z + Math.sin(item.angle) * radius);
    plusColor.copy(green).lerp(WHITE, PLUS_WHITENESS).multiplyScalar(brightness);
    colors.setXYZ(slot, plusColor.r, plusColor.g, plusColor.b);
  });
  positions.needsUpdate = true;
  colors.needsUpdate = true;
}

function moteMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: EFFECT_COLOR.heal, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
}

function drawMote(stage: EffectStage, mote: THREE.Mesh, from: THREE.Vector3, target: EffectActor, phase: number) {
  const flying = phase > 0 && phase < 1;
  mote.visible = flying;
  if (!flying) return;
  const to = stage.pointOn(target, MOTE_HEIGHT);
  const along = easeInOut(phase);
  mote.position.lerpVectors(from, to, along);
  mote.position.y += Math.sin(along * Math.PI) * MOTE_ARC;
  (mote.material as THREE.MeshBasicMaterial).opacity = 1 - phase * 0.3;
}

/** Reduced motion: a green glow on the floor under each creature, that fades. Nothing rises. */
function playStill(stage: EffectStage, targets: EffectActor[], share: number) {
  const strength = strengthOf(share);
  const disc = discGeometry(share < GLINT_SHARE ? GLINT_RADIUS : DISC_RADIUS);
  const root = new THREE.Group();
  const meshes = targets.map((target) => {
    const mesh = new THREE.Mesh(disc, glow());
    opacity(mesh, 0);
    mesh.position.copy(target.at).setY(target.at.y + FLOOR_LIFT);
    root.add(mesh);
    return { target, mesh };
  });
  stage.spawn(root, CAST_LEAD + REDUCED_LIFE);
  stage.tween(CAST_LEAD, REDUCED_LIFE, (k) => {
    for (const { target, mesh } of meshes) {
      mesh.position.copy(target.at).setY(target.at.y + FLOOR_LIFT);
      opacity(mesh, DISC_OPACITY * (1 - k) * (0.5 + 0.5 * strength));
    }
  });
}
