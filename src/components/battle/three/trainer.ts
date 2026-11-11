import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { HAIR, SKIN, TOP, type Look } from "../../../../server/character";
import { box, cylinder, part, sphere, toon } from "./kit";

// A player's character as a model: the same six choices as the drawn figure on the
// trainer card (server/character.ts), so the builder, the card and the arena agree.

export type Trainer = { root: THREE.Group; arms: [THREE.Group, THREE.Group]; head: THREE.Group };

const JEANS = "#2b3440";
const SHOES = "#16191d";
const INK = "#1b1d21";

function hair(style: number, color: THREE.Material): THREE.Object3D[] {
  const cap = (scale: [number, number, number] = [1, 1, 1], lift = 0.03) =>
    part(new THREE.SphereGeometry(0.36, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), color, { at: [0, lift, -0.02], scale });
  switch (style) {
    case 1: // side part
      return [cap(), part(sphere(0.2), color, { at: [0.14, 0.24, 0.2], scale: [1.3, 0.55, 0.8] })];
    case 2: // long
      return [cap(), part(new RoundedBoxGeometry(0.62, 0.62, 0.22, 3, 0.1), color, { at: [0, -0.2, -0.24] })];
    case 3: // bun
      return [cap(), part(sphere(0.15), color, { at: [0, 0.36, -0.16] })];
    case 4: // curly
      return [
        cap(),
        ...[[-0.24, 0.2, 0.1], [0.24, 0.2, 0.1], [0, 0.36, 0.06], [-0.2, 0.3, -0.16], [0.2, 0.3, -0.16], [0, 0.22, 0.26], [0, 0.18, -0.32]].map((at) =>
          part(sphere(0.15, 12), color, { at: at as [number, number, number] }),
        ),
      ];
    case 5: // buzz
      return [cap([0.96, 0.9, 0.96], 0.0)];
    default: // short
      return [cap([1, 1.08, 1])];
  }
}

function extra(kind: number, look: Look, hairColor: THREE.Material): THREE.Object3D[] {
  const ink = toon(INK);
  switch (kind) {
    case 1: // glasses
      return [
        ...[-0.13, 0.13].map((x) => part(new THREE.TorusGeometry(0.085, 0.018, 8, 20), ink, { at: [x, 0.02, 0.31], outline: false })),
        part(box(0.1, 0.02, 0.02), ink, { at: [0, 0.03, 0.32], outline: false }),
      ];
    case 2: // headphones
      return [
        part(new THREE.TorusGeometry(0.37, 0.035, 8, 24, Math.PI), ink, { at: [0, 0.02, 0], outline: false }),
        ...[-0.36, 0.36].map((x) => part(cylinder(0.11, 0.11, 0.09), ink, { at: [x, -0.02, 0], turn: [0, 0, Math.PI / 2] })),
      ];
    case 3: {
      // cap
      const cloth = toon(TOP[(look.topColor + 3) % TOP.length]);
      return [
        part(new THREE.SphereGeometry(0.375, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), cloth, { at: [0, 0.06, 0] }),
        part(cylinder(0.2, 0.2, 0.03), cloth, { at: [0, 0.14, 0.36], scale: [1, 1, 1.25] }),
      ];
    }
    case 4: // beard
      return [part(new THREE.SphereGeometry(0.3, 18, 10, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.42), hairColor, { at: [0, -0.04, 0.07], scale: [1.02, 1.05, 1] })];
    default:
      return [];
  }
}

export function buildTrainer(look: Look): Trainer {
  const skin = toon(SKIN[look.skin]);
  const top = toon(TOP[look.topColor]);
  const hairColor = toon(HAIR[look.hairColor]);
  const root = new THREE.Group();

  for (const x of [-0.14, 0.14]) {
    root.add(part(cylinder(0.11, 0.1, 0.62), toon(JEANS), { at: [x, 0.39, 0] }));
    root.add(part(new RoundedBoxGeometry(0.2, 0.12, 0.34, 2, 0.05), toon(SHOES), { at: [x, 0.06, 0.05] }));
  }
  root.add(part(new RoundedBoxGeometry(0.58, 0.66, 0.34, 3, 0.12), top, { at: [0, 1.0, 0] }));
  if (look.top === 1) root.add(part(sphere(0.22), top, { at: [0, 1.32, -0.14], scale: [1.2, 0.8, 0.9] })); // hood
  if (look.top === 2) root.add(part(box(0.12, 0.6, 0.02), toon("#eceae4"), { at: [0, 1.0, 0.175], outline: false })); // open jacket
  if (look.top === 3) root.add(part(new THREE.TorusGeometry(0.14, 0.05, 8, 18), top, { at: [0, 1.33, 0], turn: [Math.PI / 2, 0, 0] })); // roll neck

  // Each arm hangs from its shoulder, so turning the group swings the whole arm.
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.37, 1.26, 0);
    arm.rotation.z = side * 0.12;
    const sleeve = look.top === 0 ? 0.2 : 0.5;
    arm.add(part(cylinder(0.095, 0.085, sleeve), top, { at: [0, -sleeve / 2, 0] }));
    if (look.top === 0) arm.add(part(cylinder(0.075, 0.07, 0.32), skin, { at: [0, -0.34, 0] }));
    arm.add(part(sphere(0.09, 12), skin, { at: [0, -0.56, 0] }));
    root.add(arm);
    return arm;
  }) as [THREE.Group, THREE.Group];

  const head = new THREE.Group();
  head.position.set(0, 1.66, 0);
  head.add(part(sphere(0.34), skin));
  for (const x of [-0.13, 0.13]) head.add(part(sphere(0.04, 10), toon(INK), { at: [x, 0.02, 0.31], scale: [1, 1.35, 0.6], outline: false }));
  head.add(...hair(look.hair, hairColor), ...extra(look.extra, look, hairColor));
  root.add(head);

  return { root, arms, head };
}
