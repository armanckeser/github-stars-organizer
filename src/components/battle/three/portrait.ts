import * as THREE from "three";
import type { Fighter } from "../../../../server/battle";
import { buildCreature } from "./creature";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { dispose, toon } from "./kit";

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
export function portrait(fighter: Fighter): string {
  const key = [fighter.fullName.toLowerCase(), fighter.type, fighter.color, fighter.level, fighter.retired, fighter.description].join("|");
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

// --- the shop's picture: the creature on a lit board tile ---

const WIDE = 480;
const HIGH = 300;
/** The plain slate around the creature, lit by the board light. */
const BACKDROP = 0x131b20;
/** The one dark board tile the creature stands on. */
const TILE = 0x1b2529;
const CELL = 1.3;
/** Where the creature's middle sits across the card, and how near its head comes to the top edge, in clip space. */
const ACROSS = 0.24;
const HEAD = 0.94;
/** Where the feet end, a little under the bottom edge, so the creature fills the height and the strip crops its toes. */
const FEET = -1.06;
let stage: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null;
let striking: ReturnType<typeof setTimeout> | undefined;

/** The board's own light and a patch of its tiles, kept while pictures are being drawn. */
function openStage() {
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKDROP);
  scene.fog = new THREE.Fog(BACKDROP, 3.5, 8);
  // The board's lights (board.ts): a cool sky, a warm key from above the near edge, a sun that casts.
  scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x1c2430, 1.0));
  const key = new THREE.SpotLight(0xffe9c7, 60, 14, 0.7, 0.8, 1.6);
  key.position.set(0.8, 7, 3.2);
  key.target.position.set(0, 0, 0);
  scene.add(key, key.target);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-3, 6, 4);
  sun.castShadow = true;
  // One creature on one tile: a small, tight shadow map is enough, and keeps a shop of five quick to draw.
  sun.shadow.mapSize.setScalar(512);
  Object.assign(sun.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 2, far: 14 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const tile = new THREE.Mesh(new RoundedBoxGeometry(CELL - 0.08, 0.16, CELL - 0.08, 3, 0.07), toon(TILE));
  tile.position.y = -0.06;
  tile.receiveShadow = true;
  scene.add(tile);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), toon(BACKDROP));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.14;
  floor.receiveShadow = true;
  scene.add(floor);
  stage = { renderer, scene, camera: new THREE.PerspectiveCamera(30, WIDE / HIGH, 0.1, 40) };
  return stage;
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
 * Close in, as TFT's splash art is: the creature fills the height with its head just under
 * the top edge and its middle at about 62% across, so the left of the card holds the sets.
 * The camera sits a little above its eyes; the shift is a view offset, so nothing turns.
 */
function frame(camera: THREE.PerspectiveCamera, creature: ReturnType<typeof buildCreature>) {
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
}

/**
 * The fighter's creature standing on a board tile under the board's light, seen closer
 * than in play and set right of the middle, so the card's left side holds its sets.
 * A 4:3 PNG as a data URL. Throws when the browser has no WebGL.
 */
export function shopArt(fighter: Fighter): string {
  const key = ["shop", fighter.fullName.toLowerCase(), fighter.type, fighter.color, fighter.level, fighter.retired, fighter.description].join("|");
  const kept = drawn.get(key);
  if (kept) return kept;
  const { renderer, scene, camera } = openStage();
  const creature = buildCreature(fighter);
  creature.root.rotation.y = 0.35;
  if (creature.floats) creature.body.position.y = 0.3;
  creature.root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh && !node.userData.rim) node.castShadow = true;
  });
  scene.add(creature.root);
  frame(camera, creature);
  renderer.render(scene, camera);
  const image = renderer.domElement.toDataURL("image/png");
  camera.clearViewOffset();
  scene.remove(creature.root);
  dispose(creature.root);
  drawn.set(key, image);
  return image;
}
