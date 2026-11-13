import * as THREE from "three";
import type { Fighter } from "../../../../server/battle";
import { creatureRecipe } from "../../../../server/creature-recipe";
import type { RunFighter } from "../../../../server/run/rules";
import { buildCreature } from "./creature";
import { dispose, INK } from "./kit";

// A creature's picture for its card: the same model the arena uses, drawn once and
// kept as an image. The renderer is made when a picture is asked for and let go a
// moment after the last one, so a page of cards doesn't hold a WebGL context open.

const SIZE = 320;
const drawn = new Map<string, string>();
let studio: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null;
let closing: ReturnType<typeof setTimeout> | undefined;

function open() {
  clearTimeout(closing);
  closing = setTimeout(() => {
    studio?.renderer.dispose();
    studio?.renderer.forceContextLoss();
    studio = null;
  }, 1500);
  if (studio) return studio;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a93a3, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-3, 5, 6);
  scene.add(sun);
  studio = { renderer, scene, camera: new THREE.PerspectiveCamera(30, 1, 0.1, 40) };
  return studio;
}

/** A PNG of the fighter's creature as a data URL. Throws when the browser has no WebGL. */
// A picture is kept by everything its creature is made of, its role and cost included.
const keyOf = (kind: string, fighter: Fighter | RunFighter) => `${kind}|${JSON.stringify(creatureRecipe(fighter))}`;

export function portrait(fighter: Fighter | RunFighter): string {
  const key = keyOf("card", fighter);
  const kept = drawn.get(key);
  if (kept) return kept;
  const { renderer, scene, camera } = open();
  const creature = buildCreature(fighter);
  creature.root.rotation.y = 0.5;
  if (creature.floats) creature.body.position.y = 0.3;
  scene.add(creature.root);
  // Room for the body, whatever stands on its head, and whatever floats over that.
  const tall = creature.height + 0.75;
  camera.position.set(0, tall * 0.52, tall / 0.5);
  camera.lookAt(0, tall * 0.48, 0);
  renderer.render(scene, camera);
  const image = renderer.domElement.toDataURL("image/png");
  dispose(creature.root);
  drawn.set(key, image);
  return image;
}

// --- the shop's picture: the creature as a lit portrait ---

const WIDE = 480;
const HIGH = 300;
/** The back wall: slate, lit only by the key's pool, so no tier or creature color reaches it (docs/GAME-UI.md §4). */
const WALL = 0x2a343b;
/** How far behind the creature's middle the wall stands. */
const WALL_BEHIND = 1.2;
/** Where the key's pool lands on the wall: behind the head, a little toward the light. */
const POOL = new THREE.Vector3(-0.35, 0.55, 0);
/** Where the pool's lamp hangs, from the creature's middle: behind it, so it lights the wall and never the creature's face. */
const POOL_LAMP = new THREE.Vector3(0.1, 0.4, -0.45);
/** The rim's color on the card's outline: the rim light's cool blue. */
const RIM_EDGE = new THREE.Color(0x9fc4ff);
/** Where the creature's middle sits across the card, and how near its head comes to the top edge, in clip space. */
const ACROSS = 0.32;
const HEAD = 0.86;
/** Where the body would end, well under the bottom edge: the name strip crops it, as a portrait crops at the chest. */
const FEET = -1.5;
/** The creature turned a three-quarter view toward the light. */
const THREE_QUARTER = 0.6;
type Stage = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; wall: THREE.Mesh; key: THREE.DirectionalLight; sun: THREE.DirectionalLight; pool: THREE.SpotLight; rim: THREE.DirectionalLight };
let stage: Stage | null = null;
let striking: ReturnType<typeof setTimeout> | undefined;

/** A portrait studio: a warm key from the top left, a cool rim from behind right, a slate wall behind. */
function openStage(): Stage {
  clearTimeout(striking);
  striking = setTimeout(() => {
    if (!stage) return;
    dispose(stage.scene);
    stage.renderer.dispose();
    stage.renderer.forceContextLoss();
    stage = null;
  }, 1500);
  if (stage) return stage;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(WIDE, HIGH, false);
  // No shadows: the feet are cropped away, and a cast shadow on the wall reads as a dark second creature.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(WALL).multiplyScalar(0.35);
  // The board's own light (board.ts), at the strength it reaches a creature there, with no tone mapping,
  // so a creature's colors on its card are its colors on the board. Only the directions turn, to a portrait's.
  scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x1c2430, 1.0));
  // The key: the board's warm spot (90 at about 12 units, decay 1.6), high and to the left of the camera.
  const key = new THREE.DirectionalLight(0xffe9c7, 1.55);
  key.position.set(-2.6, 4.2, 4.2);
  scene.add(key, key.target);
  // The board's white sun, from the front and above. It is 1.5 on the board, where it meets a creature's
  // top at a slant; here it meets the front head-on, and 1.1 gives the body the lightness it has there.
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(-1, 5, 6);
  scene.add(sun, sun.target);
  // A background light: a lamp hidden behind the creature throws a soft warm pool on the wall behind the
  // head that falls off toward the corners. The wall is lit, not painted with a gradient (docs/GAME-UI.md §2),
  // and the creature is no brighter for it.
  const pool = new THREE.SpotLight(0xffe9c7, 32, 7, 0.82, 1, 1.2);
  scene.add(pool, pool.target);
  // The rim: cool, from behind and to the right, catching the silhouette's edge so it parts from the wall.
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.6);
  rim.position.set(3.2, 2.6, -3.4);
  scene.add(rim, rim.target);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshStandardMaterial({ color: WALL, roughness: 0.95 }));
  scene.add(wall);
  stage = { renderer, scene, camera: new THREE.PerspectiveCamera(28, WIDE / HIGH, 0.1, 40), wall, key, sun, pool, rim };
  return stage;
}

/**
 * The rim light, drawn on the ink outline: a toon shader's bands round a light from behind down to
 * nothing, and a box's edge has no surface turned toward it to catch it. So on the card the outline
 * turns cool where it faces the rim (right, and a little up) and stays ink elsewhere. The board's
 * shared outline material is swapped back before the creature is disposed.
 */
const CARD_OUTLINE = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { ink: { value: new THREE.Color(INK) }, rimEdge: { value: RIM_EDGE } },
  vertexShader: `
    varying vec3 facing;
    void main() {
      facing = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 ink;
    uniform vec3 rimEdge;
    varying vec3 facing;
    void main() {
      float lit = smoothstep(0.05, 0.55, facing.x + 0.35 * facing.y);
      gl_FragColor = vec4(mix(ink, rimEdge, lit), 1.0);
      #include <colorspace_fragment>
    }`,
});

/** Puts the card's outline on every outline under `root`, and gives back a function that puts the board's back. */
function lendOutline(root: THREE.Object3D): () => void {
  const lent: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  root.traverse((node) => {
    if (!node.userData.rim) return;
    const mesh = node as THREE.Mesh;
    lent.push([mesh, mesh.material]);
    mesh.material = CARD_OUTLINE;
  });
  return () => lent.forEach(([mesh, material]) => (mesh.material = material));
}

/** The creature's box, as clip-space bounds under the camera. */
function bounds(camera: THREE.PerspectiveCamera, box: THREE.Box3) {
  camera.updateMatrixWorld();
  const middle = box.getCenter(new THREE.Vector3());
  const seen = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity };
  // The head where it stands (the box's middle depth) and the feet at its front: the box's far top corners would put the head higher than it is drawn.
  for (const x of [box.min.x, box.max.x]) {
    const top = new THREE.Vector3(x, box.max.y, middle.z).project(camera);
    const foot = new THREE.Vector3(x, box.min.y, box.max.z).project(camera);
    seen.left = Math.min(seen.left, top.x, foot.x);
    seen.right = Math.max(seen.right, top.x, foot.x);
    seen.top = Math.max(seen.top, top.y);
    seen.bottom = Math.min(seen.bottom, foot.y);
  }
  return seen;
}

/**
 * Close in, as TFT's splash art is: the head just under the top edge, the body running on
 * under the bottom one, the middle at about 66% across so the left of the card holds the sets.
 * The camera sits a little above its eyes; the shift is a view offset, so nothing turns.
 * Gives back the creature's middle, for the wall and the lights.
 */
function frame(camera: THREE.PerspectiveCamera, creature: ReturnType<typeof buildCreature>): THREE.Vector3 {
  const box = new THREE.Box3().setFromObject(creature.root);
  // The head, not the emblem floating over it: the emblem may run off the top, as a TFT splash crops its crowns.
  const head = creature.height + (creature.floats ? creature.body.position.y * creature.root.scale.y : 0) + 0.06;
  box.max.y = Math.min(box.max.y, head);
  const middle = box.getCenter(new THREE.Vector3());
  const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const place = (distance: number) => {
    camera.position.set(middle.x, middle.y + distance * 0.22, middle.z + distance);
    camera.lookAt(middle);
  };
  let distance = box.max.y / (2 * tangent);
  place(distance);
  const first = bounds(camera, box);
  distance *= (first.top - first.bottom) / (HEAD - FEET);
  place(distance);
  const seen = bounds(camera, box);
  const across = ACROSS - (seen.left + seen.right) / 2;
  const up = HEAD - seen.top;
  camera.setViewOffset(WIDE, HIGH, (-across * WIDE) / 2, (up * HIGH) / 2, WIDE, HIGH);
  return middle;
}

/**
 * The fighter's creature as a portrait: turned three-quarters, cropped at the body, lit by a
 * warm key and a cool rim against a slate wall, set right of the middle so the card's left
 * side holds its sets. A 16:10 PNG as a data URL. Throws when the browser has no WebGL.
 */
export function shopArt(fighter: Fighter | RunFighter): string {
  const key = keyOf("shop", fighter);
  const kept = drawn.get(key);
  if (kept) return kept;
  const { renderer, scene, camera, wall, key: keyLight, sun, pool, rim } = openStage();
  const creature = buildCreature(fighter);
  creature.root.rotation.y = THREE_QUARTER;
  if (creature.floats) creature.body.position.y = 0.3;
  const giveBack = lendOutline(creature.root);
  scene.add(creature.root);
  const middle = frame(camera, creature);
  // The wall faces the camera, behind the creature, so the key's pool lands behind its head.
  wall.position.copy(middle).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), WALL_BEHIND);
  wall.lookAt(camera.position);
  keyLight.target.position.copy(middle);
  sun.target.position.copy(middle);
  rim.target.position.copy(middle);
  pool.position.copy(middle).add(POOL_LAMP);
  pool.target.position.copy(wall.position).add(POOL);
  renderer.render(scene, camera);
  const image = renderer.domElement.toDataURL("image/png");
  camera.clearViewOffset();
  scene.remove(creature.root);
  giveBack();
  dispose(creature.root);
  drawn.set(key, image);
  return image;
}
