import * as THREE from "three";
import type { Condition } from "../../../../../server/run/hooks";
import { easeOut, sphere } from "../kit";
import { CAST_LEAD, type EffectActor, type EffectPlayer, type EffectStage } from "./stage";

// An orb in the condition's own colour flies from the caster to the target and pops there.
// The fight's own `condition` event shows the badge in the same tick, so the flight is
// short: the orb says where the badge came from, the badge says what it is.

/**
 * A copy of CONDITION_COLOR in board.ts, which is where these are decided: importing it
 * from there would loop the imports (board.ts imports this folder). Keep the two equal.
 */
const CONDITION_COLOR: Record<Condition, number> = { "merge-conflict": 0xff8f3d, "rate-limited": 0x3ea6ff, deprecated: 0xa47cff, flaky: 0xffd84d };

const TRAVEL = 0.15;
const POP_LIFE = 0.2;
/** Where the orb leaves and lands, as a share of the creature's height: about the chest. */
const CHEST = 0.5;
/** How high the flight bows above the straight line, in world units. */
const ARC = 0.25;

const CORE_RADIUS = 0.12;
/** Few sides: the orb is small and quick. */
const ORB_DETAIL = 14;
const HALO_SCALE = 2;
const HALO_OPACITY = 0.45;
const POP_GROWTH = 2.4;
/** The halo flares as it pops, brighter than in flight. */
const POP_OPACITY = 0.85;
/** Two smaller orbs a little behind the first, so a flight this short still reads as a path. */
const TRAIL = [
  { behind: 0.16, scale: 0.75, opacity: 0.8 },
  { behind: 0.32, scale: 0.5, opacity: 0.5 },
];
/** Past this many targets the trail is left off: phones. */
const TRAIL_LIMIT = 2;

const REDUCED_LIFE = 0.45;
/** The look is freed this long after its last frame, so the last fade is drawn. */
const SPARE = 0.05;

export const playCondition: EffectPlayer<"condition"> = (stage, cast) => {
  const color = CONDITION_COLOR[cast.effect.condition];
  const geometry = sphere(CORE_RADIUS, ORB_DETAIL);
  const root = new THREE.Group();
  stage.spawn(root, stage.reduced ? REDUCED_LIFE : CAST_LEAD + TRAVEL + POP_LIFE + SPARE);
  const look = { root, geometry, color, trail: cast.targets.length <= TRAIL_LIMIT };
  for (const target of cast.targets) {
    if (stage.reduced) glowInPlace(stage, target, look);
    else fly(stage, cast.caster, target, look);
  }
};

type Look = { root: THREE.Group; geometry: THREE.BufferGeometry; color: number; trail: boolean };

/** The core and trail are solid, so they show the badge's own colour; the halo around them adds light. */
function orb(look: Look, opacity: number, scale: number, blending: THREE.Blending = THREE.AdditiveBlending): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const material = new THREE.MeshBasicMaterial({ color: look.color, transparent: true, opacity, depthWrite: false, blending });
  const mesh = new THREE.Mesh(look.geometry, material);
  mesh.scale.setScalar(scale);
  mesh.renderOrder = 6;
  mesh.visible = false;
  look.root.add(mesh);
  return mesh;
}

/** Where the orb is at `k` of its flight: re-read each frame, since both creatures walk. */
function along(stage: EffectStage, caster: EffectActor, target: EffectActor, k: number, into: THREE.Vector3) {
  const from = stage.pointOn(caster, CHEST);
  const to = stage.pointOn(target, CHEST);
  return into.copy(from).lerp(to, k).setY(from.y + (to.y - from.y) * k + Math.sin(Math.PI * k) * ARC);
}

function fly(stage: EffectStage, caster: EffectActor, target: EffectActor, look: Look) {
  const core = orb(look, 1, 1, THREE.NormalBlending);
  const halo = orb(look, HALO_OPACITY, HALO_SCALE);
  const trail = look.trail ? TRAIL.map((step) => ({ step, mesh: orb(look, step.opacity, step.scale, THREE.NormalBlending) })) : [];
  stage.tween(CAST_LEAD, TRAVEL, (k) => {
    for (const mesh of [core, halo]) {
      mesh.visible = true;
      along(stage, caster, target, k, mesh.position);
    }
    for (const { step, mesh } of trail) {
      mesh.visible = k > step.behind;
      along(stage, caster, target, Math.max(0, k - step.behind), mesh.position);
    }
  }, () => {
    for (const { mesh } of trail) mesh.visible = false;
    core.visible = false;
    pop(stage, target, halo);
  });
}

/** The halo stays where the orb landed and opens out, fading. */
function pop(stage: EffectStage, target: EffectActor, halo: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>) {
  stage.tween(0, POP_LIFE, (k) => {
    halo.position.copy(stage.pointOn(target, CHEST));
    halo.scale.setScalar(HALO_SCALE + easeOut(k) * POP_GROWTH);
    halo.material.opacity = POP_OPACITY * (1 - k);
  });
}

/** Reduced motion: a still glow on the target that fades; the badge says the rest. */
function glowInPlace(stage: EffectStage, target: EffectActor, look: Look) {
  const halo = orb(look, HALO_OPACITY, HALO_SCALE + POP_GROWTH / 2);
  halo.visible = true;
  halo.position.copy(stage.pointOn(target, CHEST));
  stage.tween(0, REDUCED_LIFE, (k) => {
    halo.material.opacity = HALO_OPACITY * (1 - k);
  });
}
