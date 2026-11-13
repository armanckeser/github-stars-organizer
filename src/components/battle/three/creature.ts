import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Fighter } from "../../../../server/battle";
import { assemble, type Cluster, type Shape } from "../../../../server/creature-parts";
import { creatureRecipe } from "../../../../server/creature-recipe";
import { box, cone, cylinder, part, sphere, toon } from "./kit";

// A repo as a creature, built in 3D from its recipe (server/creature-recipe.ts) and the
// parts that recipe lists (server/creature-parts.ts), which the flat sticker draws too. Words
// in the repo's name and description pick its body and the thing floating over its
// head (a budgeting app is a bird with a coin, a stars manager carries a star); a repo
// with no such words gets a body from its name alone. The language colours the creature
// and the card's type colours the trim. One repo always looks the same, and two
// TypeScript repos don't look alike.

export type Creature = {
  root: THREE.Group;
  /** Everything that squashes, hops and leans. The root stays where the creature stands. */
  body: THREE.Group;
  eyes: THREE.Object3D[];
  /** Arms and wings: swung a little while idle. */
  limbs: THREE.Object3D[];
  /** Rings and halos: turned slowly. */
  spinners: THREE.Object3D[];
  /** The coloured materials, lit up white for a moment when the creature is hit. */
  skins: THREE.MeshToonMaterial[];
  height: number;
  floats: boolean;
  shiny: boolean;
  /** Where its idle loop starts, so two creatures don't breathe in step. */
  phase: number;
};

/** One part's geometry, as round as the part asks for. */
function geometryOf(shape: Shape): THREE.BufferGeometry {
  switch (shape.kind) {
    case "sphere":
      return sphere(shape.radius, shape.detail);
    case "box":
      return shape.round ? new RoundedBoxGeometry(...shape.size, shape.round.segments, shape.round.radius) : box(...shape.size);
    case "cone":
      return cone(shape.radius, shape.height, shape.sides);
    case "cylinder":
      return cylinder(shape.top, shape.bottom, shape.height, shape.sides);
    case "capsule":
      return new THREE.CapsuleGeometry(shape.radius, shape.length, shape.caps, shape.sides);
    case "octahedron":
      return new THREE.OctahedronGeometry(shape.radius);
    case "slice": {
      const outline = new THREE.Shape(shape.points.map(([x, y]) => new THREE.Vector2(x, y)));
      return new THREE.ExtrudeGeometry(outline, { depth: shape.depth, bevelEnabled: false }).center();
    }
    case "ring":
      return new THREE.TorusGeometry(shape.radius, shape.tube, shape.sides, shape.steps, shape.arc);
  }
}

type Paints = { material: (shape: Shape) => THREE.Material; skins: THREE.MeshToonMaterial[] };

/** One toon material per paint, shared by every part painted with it. */
function paintsFor(skinned: string[]): Paints {
  const made = new Map<string, THREE.MeshToonMaterial>();
  const toonOf = (paint: string) => made.get(paint) ?? made.set(paint, toon(paint)).get(paint)!;
  const skins = [...new Set(skinned)].map(toonOf);
  return { material: (shape) => (shape.shading === "none" ? new THREE.MeshBasicMaterial({ color: shape.paint }) : toonOf(shape.paint)), skins };
}

function meshOf(shape: Shape, paints: Paints): THREE.Mesh {
  return part(geometryOf(shape), paints.material(shape), { at: shape.at, turn: shape.turn, scale: shape.scale, outline: shape.outline });
}

function clusterOf(cluster: Cluster, paints: Paints): THREE.Group {
  const group = new THREE.Group();
  group.position.set(...cluster.at);
  for (const shape of cluster.shapes) group.add(meshOf(shape, paints));
  return group;
}

export function buildCreature(fighter: Fighter): Creature {
  const recipe = creatureRecipe(fighter);
  const assembly = assemble(recipe);
  const { base, light, dark, accent } = recipe.paints;
  const paints = paintsFor([base, light, dark, accent]);
  const body = new THREE.Group();
  const limbs: THREE.Object3D[] = [];
  const spinners: THREE.Object3D[] = [];
  for (const shape of assembly.body) {
    const mesh = meshOf(shape, paints);
    body.add(mesh);
    if (shape.motion === "limb") limbs.push(mesh);
    if (shape.motion === "spinner") spinners.push(mesh);
  }
  if (assembly.emblem) {
    const emblem = clusterOf(assembly.emblem, paints);
    body.add(emblem);
    spinners.push(emblem);
  }
  const eyes = assembly.eyes.map((eye) => {
    const group = clusterOf(eye, paints);
    body.add(group);
    return group;
  });
  body.add(meshOf(assembly.mouth, paints));

  const root = new THREE.Group();
  root.add(body);
  root.scale.set(...recipe.scale);
  root.userData.scale = root.scale.clone();

  return { root, body, eyes, limbs, spinners, skins: paints.skins, height: assembly.height * root.scale.y, floats: assembly.floats, shiny: recipe.shiny, phase: recipe.phase };
}
