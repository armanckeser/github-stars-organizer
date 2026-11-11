import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { seededRandom, type Fighter } from "../../../../server/battle";
import { TYPE } from "../repo-card";
import { box, cone, cylinder, part, sphere, toon, type PartOptions } from "./kit";

// A repo as a creature. Words in the repo's name and description pick its body and
// the thing floating over its head (a budgeting app is a bird with a coin, a stars
// manager carries a star); a repo with no such words gets a body from its name alone.
// The language colours the creature and the card's type colours the trim. One repo
// always looks the same, and two TypeScript repos don't look alike.

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

const GREY = new THREE.Color("#7b828c");
const WHITE = new THREE.Color("#ffffff");
const BLACK = new THREE.Color("#000000");
const HEX = /^#[0-9a-f]{6}$/i;

type Kit = {
  body: THREE.Group;
  random: () => number;
  base: THREE.MeshToonMaterial;
  light: THREE.MeshToonMaterial;
  dark: THREE.MeshToonMaterial;
  accent: THREE.MeshToonMaterial;
  add: (geometry: THREE.BufferGeometry, material: THREE.Material, options?: PartOptions) => THREE.Mesh;
  limbs: THREE.Object3D[];
  spinners: THREE.Object3D[];
};

type Plan = { face: { y: number; z: number; spread: number; size: number }; height: number; floats?: boolean };

const pick = (random: () => number, count: number) => Math.floor(random() * count);
const between = (random: () => number, low: number, high: number) => low + random() * (high - low);

const PLANS: Record<string, (kit: Kit) => Plan> = {
  // A block on legs with heavy arms.
  golem: ({ add, base, dark, accent, random, limbs }) => {
    add(new RoundedBoxGeometry(0.92, 0.8, 0.72, 3, 0.14), base, { at: [0, 0.68, 0] });
    add(new RoundedBoxGeometry(0.98, 0.16, 0.78, 2, 0.06), dark, { at: [0, 1.04, 0], turn: [0.08, 0, 0] });
    for (const x of [-1, 1]) {
      limbs.push(add(new RoundedBoxGeometry(0.28, 0.6, 0.34, 2, 0.1), dark, { at: [x * 0.64, 0.56, 0.02] }));
      add(new RoundedBoxGeometry(0.3, 0.28, 0.36, 2, 0.08), dark, { at: [x * 0.24, 0.14, 0] });
    }
    add(cylinder(0.1, 0.1, 0.04), accent, { at: [0, 0.44, 0.37], turn: [Math.PI / 2, 0, 0], outline: false });
    const top = pick(random, 4);
    if (top === 0) for (const x of [-0.24, 0.2]) add(cylinder(0.09, 0.11, 0.3), accent, { at: [x, 1.24, -0.1] });
    if (top === 1) for (const x of [-1, 1]) add(cone(0.11, 0.36), accent, { at: [x * 0.32, 1.26, 0], turn: [0, 0, -x * 0.35] });
    if (top === 2) {
      add(cylinder(0.025, 0.025, 0.34), dark, { at: [0, 1.28, 0], outline: false });
      add(sphere(0.09, 12), accent, { at: [0, 1.48, 0] });
    }
    if (top === 3) for (const z of [-0.22, 0, 0.22]) add(box(0.08, 0.24 - Math.abs(z) * 0.4, 0.16), accent, { at: [0, 1.2, z] });
    return { face: { y: 0.78, z: 0.37, spread: 0.2, size: 0.13 }, height: 1.3 };
  },

  // A head trailing a tapering tail, off the ground.
  wisp: ({ add, base, light, accent, random, spinners }) => {
    add(sphere(0.42), base, { at: [0, 0.98, 0.05] });
    const curl = between(random, 0.5, 1.1);
    for (let i = 1; i <= 5; i++) {
      add(sphere(0.36 - i * 0.055, 14), i % 2 ? light : base, { at: [Math.sin(i * curl) * 0.16, 0.9 - i * 0.15, -0.14 - i * 0.2] });
    }
    add(new THREE.OctahedronGeometry(0.11), accent, { at: [Math.sin(6 * curl) * 0.16, 0.02, -1.32] });
    const top = pick(random, 4);
    if (top === 0) for (const x of [-1, 1]) add(cone(0.08, 0.32), accent, { at: [x * 0.22, 1.42, 0], turn: [0, 0, -x * 0.3] });
    if (top === 1) for (const x of [-1, 1]) add(sphere(0.16, 12), light, { at: [x * 0.42, 1.12, -0.05], scale: [0.45, 1.25, 0.8], turn: [0, 0, x * 0.5] });
    if (top === 2) add(cone(0.16, 0.42, 4), accent, { at: [0, 1.46, -0.08], scale: [0.35, 1, 1] });
    if (top === 3) spinners.push(add(new THREE.TorusGeometry(0.28, 0.035, 8, 24), accent, { at: [0, 1.56, 0.05], turn: [Math.PI / 2, 0, 0], outline: false }));
    return { face: { y: 1.0, z: 0.43, spread: 0.17, size: 0.125 }, height: 1.5, floats: true };
  },

  // A ball with a ring round it.
  orb: ({ add, base, dark, accent, random, spinners }) => {
    add(sphere(0.52, 24), base, { at: [0, 0.66, 0] });
    const ring = add(new THREE.TorusGeometry(0.66, 0.045, 8, 36), accent, { at: [0, 0.66, 0], turn: [Math.PI / 2 - 0.5, 0, 0.3], outline: false });
    spinners.push(ring);
    for (const x of [-1, 1]) add(sphere(0.15, 12), dark, { at: [x * 0.22, 0.09, 0.1], scale: [1, 0.6, 1.3] });
    const top = pick(random, 4);
    const feelers = top === 0 ? [0] : top === 1 || top === 3 ? [-1, 1] : [];
    for (const x of feelers) {
      add(cylinder(0.022, 0.022, 0.34), dark, { at: [x * 0.2, 1.3, 0], turn: [0, 0, -x * 0.3], outline: false });
      add(sphere(0.075, 12), accent, { at: [x * 0.26, 1.48, 0] });
    }
    if (top === 2) for (const x of [-1, 1]) add(cone(0.14, 0.3), base, { at: [x * 0.3, 1.16, 0], turn: [0, 0, -x * 0.5] });
    return { face: { y: 0.72, z: 0.47, spread: 0.19, size: 0.14 }, height: 1.4 };
  },

  // A small animal on two feet.
  critter: ({ add, base, light, dark, accent, random, limbs }) => {
    add(new THREE.CapsuleGeometry(0.3, 0.26, 6, 16), base, { at: [0, 0.48, 0] });
    add(sphere(0.24, 14), light, { at: [0, 0.44, 0.14], scale: [0.9, 1, 0.7], outline: false });
    add(sphere(0.42), base, { at: [0, 1.06, 0.02] });
    for (const x of [-1, 1]) {
      limbs.push(add(sphere(0.12, 12), base, { at: [x * 0.36, 0.52, 0.04], scale: [0.8, 1.3, 0.8] }));
      add(sphere(0.15, 12), dark, { at: [x * 0.17, 0.08, 0.08], scale: [1, 0.55, 1.4] });
    }
    const top = pick(random, 4);
    if (top === 0) for (const x of [-1, 1]) add(cone(0.15, 0.36), base, { at: [x * 0.28, 1.5, 0], turn: [0, 0, -x * 0.3] });
    if (top === 1) for (const x of [-1, 1]) add(sphere(0.17, 14), dark, { at: [x * 0.34, 1.42, 0] });
    if (top === 2) for (const x of [-1, 1]) add(new THREE.CapsuleGeometry(0.09, 0.4, 4, 10), base, { at: [x * 0.2, 1.68, -0.02], turn: [0, 0, -x * 0.18] });
    if (top === 3) add(cone(0.1, 0.3), accent, { at: [0, 1.56, 0], turn: [0.3, 0, 0] });
    add(random() < 0.5 ? sphere(0.15, 12) : cone(0.11, 0.42), accent, { at: [0, 0.36, -0.4], turn: [-1.9, 0, 0] });
    return { face: { y: 1.08, z: 0.4, spread: 0.17, size: 0.125 }, height: 1.6 };
  },

  // A bird with a bar chart for a crest.
  bird: ({ add, base, light, dark, accent, random, limbs }) => {
    add(sphere(0.5, 22), base, { at: [0, 0.66, 0], scale: [1, 1.18, 0.98] });
    add(sphere(0.34, 14), light, { at: [0, 0.5, 0.2], scale: [0.95, 1, 0.75], outline: false });
    for (const x of [-1, 1]) {
      limbs.push(add(sphere(0.26, 14), dark, { at: [x * 0.5, 0.64, -0.02], scale: [0.32, 1.1, 0.85], turn: [0, 0, x * 0.25] }));
      add(cone(0.07, 0.18, 8), toon("#e9a23b"), { at: [x * 0.17, 0.07, 0.12], turn: [Math.PI / 2, 0, 0] });
    }
    add(cone(0.1, 0.24, 10), toon("#e9a23b"), { at: [0, 0.8, 0.52], turn: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 3; i++) {
      const tall = between(random, 0.14, 0.4);
      add(box(0.1, tall, 0.1), accent, { at: [(i - 1) * 0.14, 1.22 + tall / 2, -0.04] });
    }
    add(box(0.26, 0.05, 0.3), dark, { at: [0, 0.42, -0.56], turn: [0.5, 0, 0] });
    return { face: { y: 0.92, z: 0.42, spread: 0.17, size: 0.12 }, height: 1.6 };
  },

  // A book with a face on its cover.
  tome: ({ add, base, dark, accent, random, limbs }) => {
    add(new RoundedBoxGeometry(0.7, 0.92, 0.3, 2, 0.04), toon("#eceae4"), { at: [0, 0.72, 0] });
    for (const z of [-0.17, 0.17]) add(new RoundedBoxGeometry(0.8, 1.0, 0.07, 2, 0.03), base, { at: [0.02, 0.72, z] });
    add(new RoundedBoxGeometry(0.08, 1.0, 0.4, 2, 0.03), dark, { at: [-0.38, 0.72, 0] });
    add(box(0.1, 0.36, 0.02), accent, { at: [0.2, 1.08, 0.02], outline: false });
    for (const x of [-1, 1]) {
      add(cylinder(0.06, 0.07, 0.24), dark, { at: [x * 0.18, 0.12, 0] });
      limbs.push(add(sphere(0.09, 12), dark, { at: [x * 0.46, 0.62, 0.06] }));
    }
    if (random() < 0.5) {
      for (const x of [-1, 1]) add(new THREE.TorusGeometry(0.11, 0.02, 8, 20), toon("#1b1d21"), { at: [x * 0.16, 0.8, 0.22], outline: false });
    }
    return { face: { y: 0.8, z: 0.21, spread: 0.16, size: 0.1 }, height: 1.3 };
  },
};

// Words that say what a repo is, checked in the name first and then the description.
const BODIES: [RegExp, string][] = [
  [/bot|agent|\bai\b|gpt|llm|robot|auto|engine|compiler|kernel/, "golem"],
  [/cli\b|shell|term|script|bash|cmd|command/, "wisp"],
  [/web|site|css|html|browser|http|react|next|vue|\bui\b|front/, "orb"],
  [/data|\bdb\b|sql|chart|analytic|track|stat|budget|financ|money|metric/, "bird"],
  [/doc|book|awesome|guide|list|learn|note|blog|skill|organiz/, "tome"],
  [/app|mobile|ios|android|swift|game|play|meme|fun/, "critter"],
];

const GOLD = "#f5c84b";

function outline(points: [number, number][], depth = 0.07): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).center();
}

// What floats over the creature's head, by what the repo is about.
const EMBLEMS: [RegExp, (trim: THREE.Material) => THREE.Object3D][] = [
  [/\bstar(s|red)?\b/, () => part(outline(Array.from({ length: 10 }, (_, i) => {
    const reach = i % 2 ? 0.1 : 0.23;
    const angle = (i / 10) * Math.PI * 2 + Math.PI / 2;
    return [Math.cos(angle) * reach, Math.sin(angle) * reach] as [number, number];
  })), toon(GOLD))],
  [/budget|money|financ|pay|bank|invoice|price|cost/, () => part(cylinder(0.18, 0.18, 0.05, 24), toon(GOLD), { turn: [Math.PI / 2, 0, 0] })],
  [/photo|image|gif|video|meme|media|camera|clip|scene/, () => {
    const lens = part(cylinder(0.17, 0.17, 0.1, 24), toon("#2a2f37"), { turn: [Math.PI / 2, 0, 0] });
    lens.add(part(sphere(0.1, 14), toon("#8fd3ff"), { at: [0, 0.04, 0], scale: [1, 0.5, 1], outline: false }));
    return lens;
  }],
  [/auth|secret|leak|\block|secur|password|crypt/, () => {
    const lock = part(new RoundedBoxGeometry(0.3, 0.24, 0.1, 2, 0.03), toon(GOLD));
    lock.add(part(new THREE.TorusGeometry(0.09, 0.028, 8, 16, Math.PI), toon("#9aa0a6"), { at: [0, 0.12, 0], outline: false }));
    return lock;
  }],
  [/fast|speed|quick|turbo|perf|instant|lightning/, () => part(outline([[0.04, 0.26], [-0.14, -0.02], [-0.02, -0.02], [-0.06, -0.26], [0.14, 0.04], [0.02, 0.04]]), toon(GOLD))],
  [/love|health|care|wedding|wish/, () => part(outline([[0, -0.2], [-0.2, 0.02], [-0.2, 0.14], [-0.11, 0.2], [0, 0.12], [0.11, 0.2], [0.2, 0.14], [0.2, 0.02]]), toon("#e5484d"))],
  [/\bmap|geo|track|travel|locat/, () => {
    const pin = part(cone(0.1, 0.26), toon("#e5484d"), { turn: [Math.PI, 0, 0] });
    pin.add(part(sphere(0.13, 14), toon("#e5484d"), { at: [0, -0.14, 0] }));
    return pin;
  }],
  [/cloud|deploy|server|host|docker|kube/, () => {
    const cloud = part(sphere(0.15, 14), toon("#eef2f6"));
    for (const x of [-0.16, 0.16]) cloud.add(part(sphere(0.11, 12), toon("#eef2f6"), { at: [x, -0.04, 0] }));
    return cloud;
  }],
  [/tool|config|build|util|plugin|sdk|framework/, (trim) => {
    const gear = part(new THREE.TorusGeometry(0.13, 0.05, 8, 20), trim, { outline: false });
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      gear.add(part(box(0.07, 0.09, 0.09), trim, { at: [Math.cos(angle) * 0.2, Math.sin(angle) * 0.2, 0], turn: [0, 0, angle + Math.PI / 2], outline: false }));
    }
    return gear;
  }],
];

/** The first match in the repo's name, else in its description. */
function about<T>(fighter: Fighter, table: [RegExp, T][]): T | undefined {
  const name = (fighter.fullName.split("/")[1] ?? fighter.fullName).toLowerCase();
  const said = (fighter.description ?? "").toLowerCase();
  return (table.find(([words]) => words.test(name)) ?? table.find(([words]) => words.test(said)))?.[1];
}

function eye(size: number, tall: number): THREE.Group {
  const group = new THREE.Group();
  group.add(part(sphere(size, 16), toon("#ffffff"), { scale: [1, tall, 0.45] }));
  group.add(part(sphere(size * 0.56, 12), toon("#15171b"), { at: [0, -size * 0.06, size * 0.34], scale: [1, tall, 0.4], outline: false }));
  const glint = new THREE.Mesh(sphere(size * 0.2, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  glint.position.set(size * 0.2, size * 0.26 * tall, size * 0.52);
  group.add(glint);
  return group;
}

export function buildCreature(fighter: Fighter): Creature {
  const random = seededRandom(`creature:${fighter.fullName.toLowerCase()}`);
  const type = new THREE.Color(TYPE[fighter.type].color);
  let colour = new THREE.Color(fighter.color && HEX.test(fighter.color) ? fighter.color : TYPE[fighter.type].color);
  // Near-black language colours would lose every detail against the arena.
  const hsl = colour.getHSL({ h: 0, s: 0, l: 0 });
  // Each repo sits a little to one side of its language's colour, so a team in one language isn't one colour.
  hsl.h = (hsl.h + between(random, -0.07, 0.07) + 1) % 1;
  hsl.l = Math.max(0.38, hsl.l + between(random, -0.08, 0.1));
  colour.setHSL(hsl.h, hsl.s, hsl.l);
  let trim = type.clone();
  // A language colour close to its type's colour needs a trim that stands apart from it.
  if (Math.abs(trim.getHSL({ h: 0, s: 0, l: 0 }).h - hsl.h) < 0.06) trim.offsetHSL(0.45, 0, 0.08);
  if (fighter.retired) {
    colour = colour.lerp(GREY, 0.8);
    trim = trim.lerp(GREY, 0.7);
  }

  const base = toon(colour);
  const light = toon(colour.clone().lerp(WHITE, 0.5));
  const dark = toon(colour.clone().lerp(BLACK, 0.32));
  const accent = toon(trim);
  const body = new THREE.Group();
  const limbs: THREE.Object3D[] = [];
  const spinners: THREE.Object3D[] = [];
  const add: Kit["add"] = (geometry, material, options) => {
    const mesh = part(geometry, material, options);
    body.add(mesh);
    return mesh;
  };

  const plans = Object.values(PLANS);
  const drawn = plans[pick(random, plans.length)];
  const plan = (PLANS[about(fighter, BODIES) ?? ""] ?? drawn)({ body, random, base, light, dark, accent, add, limbs, spinners });
  const emblem = about(fighter, EMBLEMS)?.(accent);
  if (emblem) {
    emblem.position.set(0, plan.height + (plan.floats ? 0.25 : 0.45), 0);
    body.add(emblem);
    spinners.push(emblem);
  }

  const tall = between(random, 1, 1.45);
  const size = plan.face.size * between(random, 0.9, 1.2);
  const eyes = [-1, 1].map((x) => {
    const one = eye(size, tall);
    one.position.set(x * plan.face.spread, plan.face.y, plan.face.z);
    body.add(one);
    return one;
  });
  // A mouth, small enough to read as a mouth on any face.
  add(sphere(size * 0.3, 10), toon("#15171b"), { at: [0, plan.face.y - size * 1.25, plan.face.z + 0.01], scale: [1.5, 0.7, 0.4], outline: false });

  const root = new THREE.Group();
  root.add(body);
  // Bigger repos are bigger creatures, within reason: both have to fit the arena.
  const grown = 0.86 + Math.min(fighter.level, 100) * 0.0042;
  root.scale.set(grown * between(random, 0.92, 1.1), grown * between(random, 0.92, 1.1), grown);
  root.userData.scale = root.scale.clone();

  return { root, body, eyes, limbs, spinners, skins: [base, light, dark, accent], height: plan.height * root.scale.y, floats: plan.floats ?? false, shiny: fighter.shiny, phase: random() * 10 };
}
