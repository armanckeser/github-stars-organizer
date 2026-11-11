import * as THREE from "three";
import type { Fighter } from "../../../../server/battle";
import { buildCreature } from "./creature";
import { dispose } from "./kit";

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
