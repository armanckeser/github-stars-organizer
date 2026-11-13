import * as THREE from "three";
import { easeOut, overshoot } from "../kit";
import { SHIELD_KEY } from "./index";
import { CAST_LEAD, EFFECT_COLOR, type EffectActor, type EffectPlayer, type EffectStage } from "./stage";

// A see-through bubble that wraps the creature and stays while the shield lasts. Board.ts
// takes it off when the fight reports the shield at 0, so this file only puts it on.

/** The bubble's middle, as a share of the creature's height. */
const CENTER = 0.5;
/** Up and down, the bubble reaches this share of the height past the middle, plus a margin. */
const REACH_UP = 0.6;
const REACH_MARGIN = 0.1;
/** Side to side it is a little narrower, and never wider than half a cell, so it stays off the neighbours. */
const WIDTH_SHARE = 0.85;
const WIDEST = 0.6;
const SMALLEST_RADIUS = 0.42;
/** Eighty faces: enough to read as facets, few enough for a phone. */
const FACET_DETAIL = 1;

/** The arrival: it pops on past full size and settles, and its rim flashes. */
const POP_TIME = 0.34;
const POP_FROM = 0.55;
const FLASH_TIME = 0.5;
/** A shield of this share of HP or more arrives at full strength; smaller ones pop and flash less. */
const FULL_SHARE = 0.2;
/**
 * The least an arrival and a re-pulse show. Rubber duck adds a sliver on every hit taken, and a
 * hit that takes it all brings a fresh bubble on the same tick, so neither may shout.
 */
const LEAST_ARRIVAL = 0.5;
const LEAST_PULSE = 0.25;
/** A re-pulse swells by at most this share and settles back. */
const PULSE_SWELL = 0.08;

/** One slow sweep of light up the facets. */
const SHIMMER_PERIOD = 2.6;

const VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vView = -viewPosition.xyz;
  vLocal = position;
  gl_Position = projectionMatrix * viewPosition;
}
`;

// The rim is brighter than the middle (it is seen edge on), so the creature stays clear inside.
// Each facet takes its own faint brightness, which is what shows the facets at all, and a band
// of light sweeps up them while the shield lasts.
const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uFlash;
uniform float uSweep;
uniform float uShimmer;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  float rim = pow(1.0 - facing, 2.4);
  vec3 facet = normalize(cross(dFdx(vLocal), dFdy(vLocal)));
  facet *= sign(dot(facet, vLocal));
  float facetLight = hash(floor(facet * 40.0)) * 0.07;
  float height = facet.y * 0.5 + 0.5;
  float band = smoothstep(0.22, 0.0, abs(height - uSweep)) * uShimmer * 0.16;
  float alpha = 0.035 + rim * 0.55 + facetLight + band;
  alpha += uFlash * (0.12 + rim * 0.8);
  gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0));
}
`;

type Bubble = {
  root: THREE.Group;
  shell: THREE.Mesh;
  /** The settled size, on each axis. */
  reach: THREE.Vector3;
  uniforms: {
    uColor: { value: THREE.Color };
    uFlash: { value: number };
    uSweep: { value: number };
    uShimmer: { value: number };
  };
};

/** A pale blue-white bubble wraps each target and stays until the shield is gone. */
export const playShield: EffectPlayer<"shield"> = (stage, cast) => {
  const strength = Math.min(1, cast.effect.share / FULL_SHARE);
  for (const target of cast.targets) {
    const wearing = stage.attached(target, SHIELD_KEY) !== undefined;
    const bubble = makeBubble(target);
    // Attached now, not after the lead, so a break reported in the meantime still takes it off.
    stage.attach(target, SHIELD_KEY, bubble.root);
    if (stage.reduced) continue;
    if (wearing) repulse(stage, bubble, Math.max(LEAST_PULSE, strength));
    else arrive(stage, bubble, Math.max(LEAST_ARRIVAL, strength));
    shimmer(stage, target, bubble);
  }
};

function makeBubble(target: EffectActor): Bubble {
  const uniforms = {
    uColor: { value: new THREE.Color(EFFECT_COLOR.shield) },
    uFlash: { value: 0 },
    uSweep: { value: 0 },
    uShimmer: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  // Each bubble keeps its own geometry: they leave one at a time, and leaving frees it.
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, FACET_DETAIL), material);
  const reach = Math.max(SMALLEST_RADIUS, target.height * REACH_UP + REACH_MARGIN);
  shell.position.y = target.height * CENTER;
  const width = Math.min(WIDEST, reach * WIDTH_SHARE);
  const size = new THREE.Vector3(width, reach, width);
  shell.scale.copy(size);
  shell.renderOrder = 5;
  const root = new THREE.Group();
  root.add(shell);
  return { root, shell, reach: size, uniforms };
}

function sizeShell(bubble: Bubble, size: number) {
  bubble.shell.scale.copy(bubble.reach).multiplyScalar(Math.max(0.001, size));
}

/**
 * A fresh bubble: small and dim through the cast ring, then it pops on past full size and its
 * rim flashes. Small, not hidden, so a bubble broken and given back on one tick does not blink.
 */
function arrive(stage: EffectStage, bubble: Bubble, strength: number) {
  const from = 1 - (1 - POP_FROM) * strength;
  sizeShell(bubble, from);
  stage.tween(CAST_LEAD, POP_TIME, (k) => sizeShell(bubble, from + (1 - from) * overshoot(k)));
  stage.tween(CAST_LEAD, FLASH_TIME, (k) => (bubble.uniforms.uFlash.value = strength * (1 - easeOut(k))));
}

/** More shield on a bubble already there: a swell and a flash as big as the shield's share. */
function repulse(stage: EffectStage, bubble: Bubble, strength: number) {
  const swell = PULSE_SWELL * strength;
  stage.tween(CAST_LEAD, POP_TIME, (k) => {
    sizeShell(bubble, 1 + swell * Math.sin(Math.PI * easeOut(k)));
    bubble.uniforms.uFlash.value = strength * (1 - easeOut(k));
  });
}

/** A slow band of light up the facets, again and again while this bubble is the one worn. */
function shimmer(stage: EffectStage, target: EffectActor, bubble: Bubble) {
  stage.tween(
    0,
    SHIMMER_PERIOD,
    (k) => {
      bubble.uniforms.uSweep.value = k * 1.4 - 0.2;
      bubble.uniforms.uShimmer.value = Math.sin(Math.PI * k);
    },
    () => {
      if (stage.attached(target, SHIELD_KEY) === bubble.root) shimmer(stage, target, bubble);
    },
  );
}
