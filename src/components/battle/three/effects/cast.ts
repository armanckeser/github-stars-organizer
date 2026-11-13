import * as THREE from "three";
import { easeOut } from "../kit";
import { EFFECT_COLOR, type EffectActor, type EffectStage } from "./stage";

const RING_LIFE = 0.42;
const RING_GROWTH = 0.55;

/** A gold ring on the floor that opens out around the caster: something it carries just fired. */
export function playCastRing(stage: EffectStage, caster: EffectActor) {
  if (stage.reduced) return;
  const material = new THREE.MeshBasicMaterial({ color: EFFECT_COLOR.fired, transparent: true, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.48, 40), material);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 4;
  stage.spawn(ring, RING_LIFE);
  caster.jolt(0.1, 0.25);
  stage.tween(0, RING_LIFE, (k) => {
    ring.position.copy(caster.at).setY(0.13);
    ring.scale.setScalar(1 + easeOut(k) * RING_GROWTH);
    material.opacity = 1 - k;
  });
}
