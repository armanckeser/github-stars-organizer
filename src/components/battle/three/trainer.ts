import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GOLD, shade, type Look } from "../../../../server/character";
import { box, cylinder, part, sphere, toon } from "./kit";

// A player's character as a model: the same parts as the drawn figure on the trainer
// card (server/character.ts), so the builder, the card and the arena agree.

export type Trainer = { root: THREE.Group; arms: [THREE.Group, THREE.Group]; head: THREE.Group };

const JEANS = "#2b3440";
const SHOES = "#16191d";
const INK = "#1b1d21";

type At = [number, number, number];

function hair(look: Look, color: THREE.Material): THREE.Object3D[] {
  // Tipped back so the front edge sits above the eyes and the glasses.
  const cap = (scale: At = [1, 1, 1], lift = 0.03) =>
    part(new THREE.SphereGeometry(0.36, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), color, { at: [0, lift, -0.02], scale, turn: [-0.42, 0, 0] });
  // Under a hat only the hair that falls below the brim shows.
  const covered = look.hat !== "none";
  switch (look.hair) {
    case "side-part":
      return covered ? [] : [cap(), part(sphere(0.2), color, { at: [0.14, 0.24, 0.2], scale: [1.3, 0.55, 0.8] })];
    case "long":
      return [...(covered ? [] : [cap()]), part(new RoundedBoxGeometry(0.62, 0.62, 0.22, 3, 0.1), color, { at: [0, -0.2, -0.24] })];
    case "medium":
      return [...(covered ? [] : [cap()]), part(new RoundedBoxGeometry(0.66, 0.36, 0.3, 3, 0.12), color, { at: [0, -0.04, -0.16] })];
    case "bun":
      return covered ? [] : [cap(), part(sphere(0.15), color, { at: [0, 0.36, -0.16] })];
    case "curly":
      return covered ? [] : [
        cap(),
        ...([[-0.24, 0.2, 0.1], [0.24, 0.2, 0.1], [0, 0.36, 0.06], [-0.2, 0.3, -0.16], [0.2, 0.3, -0.16], [0, 0.22, 0.26], [0, 0.18, -0.32]] as At[]).map((at) =>
          part(sphere(0.15, 12), color, { at }),
        ),
      ];
    case "buzz":
      return covered ? [] : [cap([0.96, 0.9, 0.96], 0.0)];
    case "mohawk":
      return covered ? [] : [part(new RoundedBoxGeometry(0.1, 0.22, 0.6, 2, 0.04), color, { at: [0, 0.36, -0.02] })];
    case "bald":
      return [];
    case "short":
      return covered ? [] : [cap([1, 1.08, 1])];
  }
}

function beard(look: Look, color: THREE.Material): THREE.Object3D[] {
  const jaw = () => new THREE.SphereGeometry(0.3, 18, 10, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.42);
  const moustache = () => part(new RoundedBoxGeometry(0.2, 0.045, 0.05, 2, 0.02), color, { at: [0, -0.1, 0.32], outline: false });
  switch (look.beard) {
    case "full":
      return [part(jaw(), color, { at: [0, -0.04, 0.07], scale: [1.02, 1.05, 1] })];
    case "stubble": {
      const faint = toon(look.hairColor);
      faint.transparent = true;
      faint.opacity = 0.45;
      return [part(jaw(), faint, { at: [0, -0.03, 0.06], scale: [1.01, 1.02, 1], outline: false })];
    }
    case "goatee":
      return [moustache(), part(sphere(0.08, 12), color, { at: [0, -0.24, 0.27], scale: [1, 1.2, 0.7] })];
    case "moustache":
      return [moustache()];
    case "none":
      return [];
  }
}

function glasses(look: Look): THREE.Object3D[] {
  const ink = toon(INK);
  const bridge = part(box(0.1, 0.02, 0.02), ink, { at: [0, 0.03, 0.32], outline: false });
  switch (look.glasses) {
    case "round":
      return [...[-0.13, 0.13].map((x) => part(new THREE.TorusGeometry(0.085, 0.018, 8, 20), ink, { at: [x, 0.02, 0.31], outline: false })), bridge];
    case "square":
      return [...[-0.13, 0.13].map((x) => part(new THREE.TorusGeometry(0.1, 0.018, 4, 4), ink, { at: [x, 0.02, 0.31], turn: [0, 0, Math.PI / 4], outline: false })), bridge];
    case "shades":
      return [...[-0.13, 0.13].map((x) => part(new RoundedBoxGeometry(0.17, 0.11, 0.03, 2, 0.02), ink, { at: [x, 0.02, 0.32], outline: false })), bridge];
    case "none":
      return [];
  }
}

function hat(look: Look): THREE.Object3D[] {
  const cloth = toon(shade(look.topColor, 0.7));
  const band = toon(shade(look.topColor, 0.55));
  switch (look.hat) {
    case "cap":
      return [
        part(new THREE.SphereGeometry(0.375, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), cloth, { at: [0, 0.06, 0] }),
        part(cylinder(0.2, 0.2, 0.03), band, { at: [0, 0.14, 0.36], scale: [1, 1, 1.25] }),
      ];
    case "beanie":
      return [
        part(new THREE.SphereGeometry(0.375, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.48), cloth, { at: [0, 0.06, 0], scale: [1, 1.15, 1] }),
        part(cylinder(0.37, 0.37, 0.1, 24), band, { at: [0, 0.1, 0] }),
      ];
    case "none":
      return [];
  }
}

function headphones(look: Look): THREE.Object3D[] {
  if (look.headphones === "no") return [];
  const ink = toon(INK);
  return [
    part(new THREE.TorusGeometry(0.37, 0.035, 8, 24, Math.PI), ink, { at: [0, 0.02, 0], outline: false }),
    ...[-0.36, 0.36].map((x) => part(cylinder(0.11, 0.11, 0.09), ink, { at: [x, -0.02, 0], turn: [0, 0, Math.PI / 2] })),
  ];
}

function torso(look: Look, top: THREE.Material): THREE.Object3D[] {
  const body = part(new RoundedBoxGeometry(0.58, 0.66, 0.34, 3, 0.12), top, { at: [0, 1.0, 0] });
  switch (look.top) {
    case "hoodie":
      return [body, part(sphere(0.22), top, { at: [0, 1.32, -0.14], scale: [1.2, 0.8, 0.9] })];
    case "jacket":
      return [body, part(box(0.12, 0.6, 0.02), toon("#eceae4"), { at: [0, 1.0, 0.175], outline: false })];
    case "sweater":
      return [body, part(new THREE.TorusGeometry(0.14, 0.05, 8, 18), top, { at: [0, 1.33, 0], turn: [Math.PI / 2, 0, 0] })];
    case "shirt": {
      const light = toon(shade(look.topColor, 1.18));
      return [
        body,
        part(box(0.02, 0.56, 0.02), toon(shade(look.topColor, 0.78)), { at: [0, 0.98, 0.175], outline: false }),
        ...[-1, 1].map((side) => part(box(0.14, 0.03, 0.08), light, { at: [side * 0.08, 1.31, 0.14], turn: [0.5, 0, side * -0.5], outline: false })),
      ];
    }
    case "tee":
      return [body];
  }
}

/** The model. `supporter` adds the gold band worn by someone who starred Stard. */
export function buildTrainer(look: Look, supporter = false): Trainer {
  const skin = toon(look.skin);
  const top = toon(look.topColor);
  const hairColor = toon(look.hairColor);
  const root = new THREE.Group();

  for (const x of [-0.14, 0.14]) {
    root.add(part(cylinder(0.11, 0.1, 0.62), toon(JEANS), { at: [x, 0.39, 0] }));
    root.add(part(new RoundedBoxGeometry(0.2, 0.12, 0.34, 2, 0.05), toon(SHOES), { at: [x, 0.06, 0.05] }));
  }
  root.add(...torso(look, top));

  // Each arm hangs from its shoulder, so turning the group swings the whole arm.
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.37, 1.26, 0);
    arm.rotation.z = side * 0.12;
    const sleeve = look.top === "tee" ? 0.2 : 0.5;
    arm.add(part(cylinder(0.095, 0.085, sleeve), top, { at: [0, -sleeve / 2, 0] }));
    if (look.top === "tee") arm.add(part(cylinder(0.075, 0.07, 0.32), skin, { at: [0, -0.34, 0] }));
    arm.add(part(sphere(0.09, 12), skin, { at: [0, -0.56, 0] }));
    // On both arms: the board shows the player's own trainer from behind, the other's from the front, so one arm is always hidden.
    if (supporter) arm.add(part(cylinder(0.105, 0.105, 0.07), toon(GOLD), { at: [0, -0.14, 0] }));
    root.add(arm);
    return arm;
  }) as [THREE.Group, THREE.Group];

  const head = new THREE.Group();
  head.position.set(0, 1.66, 0);
  head.add(part(sphere(0.34), skin));
  for (const x of [-0.13, 0.13]) head.add(part(sphere(0.04, 10), toon(INK), { at: [x, 0.02, 0.31], scale: [1, 1.35, 0.6], outline: false }));
  head.add(...hair(look, hairColor), ...beard(look, hairColor), ...glasses(look), ...hat(look), ...headphones(look));
  root.add(head);

  return { root, arms, head };
}
