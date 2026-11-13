import * as THREE from "three";
import { easeOut, overshoot } from "../kit";
import { CAST_LEAD, EFFECT_COLOR, type EffectActor, type EffectPlayer, type EffectStage } from "./stage";

// White shards fly from the caster to each target. Weight follows `power`: a thorn's
// 0.15 is a thin quick streak, force push's 1.2 is a fat shard that lands with a star.
// The fight's own `hit` stamps its number about 0.11 s after the cast (a melee lunge),
// so the flight is kept that short and the star opens just before the shard lands.

/** The power that draws the heaviest shard. Anything above looks the same. */
const HEAVY_POWER = 1.2;
/** At or above this share of `HEAVY_POWER` the shard lands with a burst. */
const BURST_FROM = 0.4;

const LIGHT_TRAVEL = 0.07;
const HEAVY_TRAVEL = 0.11;
/** How thick a shard is, from the lightest to the heaviest. */
const LIGHT_WIDTH = 0.06;
const HEAVY_WIDTH = 0.24;
/** How long a shard is at rest; in flight it stretches into a streak. */
const LIGHT_LENGTH = 0.32;
const HEAVY_LENGTH = 0.7;
const STREAK_STRETCH = 2.6;
/** Half of one world unit: the shard is built one unit long, so its scale is its size. */
const UNIT_RADIUS = 0.5;
/** How bright the shard leaves the caster; it is at full brightness when it lands. */
const LEAVING_OPACITY = 0.55;
/** How long the streak takes to run into the target once its head is there. */
const TAIL_LIFE = 0.07;
/** How far back along the path the shard looks to know which way it is flying. */
const HEADING_STEP = 0.05;

/** Where the shard leaves the caster and lands on the target, as a share of their height. */
const FROM_HEIGHT = 0.6;
const TO_HEIGHT = 0.5;
/** How far apart, sideways, the paths of shards to several targets bow out, in world units. */
const FAN_BOW = 0.9;
/** The small lift every path takes, so a straight shot still reads as thrown. */
const LIFT = 0.25;

const BURST_LIFE = 0.22;
/** The star is fully open this far into its life (1 / this), then only fades. */
const BURST_OPEN_SPEED = 3.5;
/** The star opens this share of the way through the flight, so it meets the fight's own number. */
const BURST_FROM_FLIGHT = 0.7;
const BURST_SMALL = 0.3;
const BURST_LARGE = 0.62;
const BURST_POINTS = 10;
/** How deep the star's points cut in: 0 a circle, 1 needles. */
const BURST_CUT = 0.7;
/** A burst per target costs a mesh each; past this many targets they land without one. */
const MOST_BURSTS = 5;

const STILL_GLOW_LIFE = 0.3;
const STILL_GLOW_RADIUS = 0.3;
const STILL_GLOW_OPACITY = 0.45;

export const playDamage: EffectPlayer<"damage"> = (stage, cast) => {
  const targets = cast.targets.filter((target) => target !== cast.caster);
  if (targets.length === 0) return;
  const weight = Math.min(1, Math.max(0, cast.effect.power / HEAVY_POWER));
  if (stage.reduced) return glowStill(stage, targets);
  const look = shardLook(weight, targets.length);
  targets.forEach((target, index) => throwShard(stage, look, cast.caster, target, fanOffset(index, targets.length)));
};

type ShardLook = {
  geometry: THREE.BufferGeometry;
  burst: THREE.BufferGeometry | undefined;
  burstSize: number;
  width: number;
  length: number;
  travel: number;
};

/** One geometry per shape for the whole cast, shared by every target's shard and burst. */
function shardLook(weight: number, count: number): ShardLook {
  const bursts = weight >= BURST_FROM && count <= MOST_BURSTS;
  return {
    geometry: new THREE.OctahedronGeometry(UNIT_RADIUS),
    burst: bursts ? starGeometry() : undefined,
    burstSize: lerp(BURST_SMALL, BURST_LARGE, (weight - BURST_FROM) / (1 - BURST_FROM)),
    width: lerp(LIGHT_WIDTH, HEAVY_WIDTH, weight),
    length: lerp(LIGHT_LENGTH, HEAVY_LENGTH, weight),
    travel: lerp(LIGHT_TRAVEL, HEAVY_TRAVEL, weight),
  };
}

/** -1 to 1 across several targets, 0 for one: which way that target's path bows. */
function fanOffset(index: number, count: number) {
  return count === 1 ? 0 : (index / (count - 1)) * 2 - 1;
}

function throwShard(stage: EffectStage, look: ShardLook, caster: EffectActor, target: EffectActor, fan: number) {
  const material = glowMaterial();
  const shard = new THREE.Mesh(look.geometry, material);
  shard.renderOrder = 5;
  shard.visible = false;
  const life = look.travel + TAIL_LIFE;
  stage.spawn(shard, CAST_LEAD + life);
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const bend = new THREE.Vector3();
  const head = new THREE.Vector3();
  const heading = new THREE.Vector3();
  stage.tween(CAST_LEAD, life, (k) => {
    // Both creatures may be walking, so the path is laid again every frame.
    from.copy(stage.pointOn(caster, FROM_HEIGHT));
    to.copy(stage.pointOn(target, TO_HEIGHT));
    bendPoint(from, to, fan, bend);
    const flown = Math.min(1, (k * life) / look.travel);
    const sunk = Math.max(0, (k * life - look.travel) / TAIL_LIFE);
    const along = easeOut(flown);
    pointOnCurve(from, bend, to, along, head);
    pointOnCurve(from, bend, to, Math.max(0, along - HEADING_STEP), heading);
    heading.subVectors(head, heading).normalize();
    // In flight the shard is drawn out into a streak; once there, its tail runs into the target.
    const length = look.length * (1 + (STREAK_STRETCH - 1) * (1 - along)) * (1 - sunk);
    shard.position.copy(head).addScaledVector(heading, -length / 2);
    shard.lookAt(head);
    shard.scale.set(look.width, look.width, Math.max(0.001, length));
    shard.visible = k < 1 && length > 0.001;
    material.opacity = (LEAVING_OPACITY + (1 - LEAVING_OPACITY) * along) * (1 - sunk);
  });
  // Laid out now rather than when the shard lands: the board drops tweens started from inside another tween.
  if (look.burst) burstAt(stage, look.burst, look.burstSize, target, CAST_LEAD + look.travel * BURST_FROM_FLIGHT);
}

/** The middle point the path bows through: up a little, and out to the side for a fan. */
function bendPoint(from: THREE.Vector3, to: THREE.Vector3, fan: number, into: THREE.Vector3) {
  const across = new THREE.Vector3(to.z - from.z, 0, from.x - to.x).normalize();
  return into.lerpVectors(from, to, 0.5).addScaledVector(across, fan * FAN_BOW).setY((from.y + to.y) / 2 + LIFT);
}

function pointOnCurve(from: THREE.Vector3, bend: THREE.Vector3, to: THREE.Vector3, k: number, into: THREE.Vector3) {
  const rest = 1 - k;
  return into.set(0, 0, 0).addScaledVector(from, rest * rest).addScaledVector(bend, 2 * rest * k).addScaledVector(to, k * k);
}

/** A white star that pops open on the target and fades: the shard struck. It faces the camera. */
function burstAt(stage: EffectStage, geometry: THREE.BufferGeometry, size: number, target: EffectActor, delay: number) {
  const material = glowMaterial();
  const burst = new THREE.Mesh(geometry, material);
  burst.renderOrder = 5;
  burst.visible = false;
  const spin = Math.random() * Math.PI;
  stage.spawn(burst, delay + BURST_LIFE);
  stage.tween(delay, BURST_LIFE, (k) => {
    burst.visible = k < 1 && !target.out;
    burst.position.copy(stage.pointOn(target, TO_HEIGHT));
    burst.quaternion.copy(stage.camera.quaternion);
    burst.rotateZ(spin);
    burst.scale.setScalar(size * Math.max(0.01, overshoot(Math.min(1, k * BURST_OPEN_SPEED))));
    material.opacity = (1 - k) ** 2;
  });
}

/** With less motion nothing flies: each target glows white for a moment and fades. */
function glowStill(stage: EffectStage, targets: EffectActor[]) {
  const geometry = new THREE.CircleGeometry(STILL_GLOW_RADIUS, 24);
  for (const target of targets) {
    const material = glowMaterial();
    const glow = new THREE.Mesh(geometry, material);
    glow.renderOrder = 5;
    stage.spawn(glow, STILL_GLOW_LIFE);
    stage.tween(0, STILL_GLOW_LIFE, (k) => {
      glow.position.copy(stage.pointOn(target, TO_HEIGHT));
      glow.quaternion.copy(stage.camera.quaternion);
      material.opacity = STILL_GLOW_OPACITY * (1 - k);
    });
  }
}

/** A flat star of `BURST_POINTS` points, radius 1. */
function starGeometry() {
  const shape = new THREE.Shape();
  const corners = BURST_POINTS * 2;
  for (let corner = 0; corner <= corners; corner++) {
    const angle = (corner / corners) * Math.PI * 2;
    const radius = corner % 2 === 0 ? 1 : 1 - BURST_CUT;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (corner === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return new THREE.ShapeGeometry(shape);
}

function glowMaterial() {
  return new THREE.MeshBasicMaterial({ color: EFFECT_COLOR.damage, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

function lerp(from: number, to: number, k: number) {
  return from + (to - from) * Math.min(1, Math.max(0, k));
}
