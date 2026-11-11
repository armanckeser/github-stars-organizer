import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { part, toon } from "./kit";

// The Archive: a lidded file box at the corner of the Drafts shelf. A card dropped in
// it is sold. Archived repositories wear GitHub's amber banner, so the box glows amber
// from inside when its lid opens.

export type Archive = {
  root: THREE.Group;
  /** Turns about the back edge: 0 is shut. */
  lid: THREE.Group;
  /** The light inside, and the inside's glow, both scaled by how far the lid is open. */
  light: THREE.PointLight;
  inside: THREE.MeshBasicMaterial;
};

const BOARD = 0xb48a55;
const BAND = 0x8a6438;
const AMBER = 0xffb53d;
export const ARCHIVE_WIDTH = 1.0;
export const ARCHIVE_DEPTH = 0.82;
const TALL = 0.56;

export function buildArchive(): Archive {
  const root = new THREE.Group();
  const body = part(new RoundedBoxGeometry(ARCHIVE_WIDTH, TALL, ARCHIVE_DEPTH, 3, 0.05), toon(BOARD), { at: [0, TALL / 2, 0] });
  body.receiveShadow = true;
  root.add(body);
  // The handle cut-out on the front, and a band where the lid's rim sits.
  root.add(part(new RoundedBoxGeometry(0.34, 0.09, 0.04, 2, 0.03), toon(0x2a1c10), { at: [0, TALL * 0.62, ARCHIVE_DEPTH / 2 + 0.005], outline: false }));
  root.add(part(new THREE.BoxGeometry(ARCHIVE_WIDTH + 0.01, 0.05, ARCHIVE_DEPTH + 0.01), toon(BAND), { at: [0, TALL - 0.07, 0], outline: false }));

  // The glow inside: a plane just under the rim, seen once the lid lifts.
  const inside = new THREE.MeshBasicMaterial({ color: 0xffc457, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(ARCHIVE_WIDTH - 0.1, ARCHIVE_DEPTH - 0.1), inside);
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.y = TALL + 0.002;
  root.add(mouth);

  // Low in the mouth, so it lights what is held over the box and the lid's underside, not the box's own sides.
  const light = new THREE.PointLight(AMBER, 0, 1.9, 2);
  light.position.set(0, TALL + 0.08, -0.05);
  root.add(light);

  // The lid hangs from its back edge, so it opens toward the back like a real file box.
  const lid = new THREE.Group();
  lid.position.set(0, TALL, -ARCHIVE_DEPTH / 2 - 0.02);
  const cap = part(new RoundedBoxGeometry(ARCHIVE_WIDTH + 0.08, 0.13, ARCHIVE_DEPTH + 0.06, 3, 0.04), toon(BOARD), { at: [0, 0.04, ARCHIVE_DEPTH / 2 + 0.02] });
  lid.add(cap);
  root.add(lid);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62 * (96 / 256)), new THREE.MeshBasicMaterial({ map: label(), transparent: true }));
  plate.position.set(0, 0.17, ARCHIVE_DEPTH / 2 + 0.006);
  root.add(plate);
  return { root, lid, light, inside };
}

/** GitHub's archive mark and the word, for the front of the box. */
function label(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const pen = canvas.getContext("2d")!;
    pen.clearRect(0, 0, 256, 96);
    pen.strokeStyle = pen.fillStyle = "#2a1c10";
    pen.lineWidth = 6;
    pen.lineJoin = "round";
    // A box with a lid and a slot: the octicon, drawn at 48px.
    pen.strokeRect(14, 22, 52, 14);
    pen.strokeRect(19, 36, 42, 38);
    pen.beginPath();
    pen.moveTo(32, 50);
    pen.lineTo(48, 50);
    pen.stroke();
    pen.font = "800 34px 'Mona Sans Variable', system-ui, sans-serif";
    pen.textBaseline = "middle";
    pen.fillText("ARCHIVE", 80, 50);
    texture.needsUpdate = true;
  };
  draw();
  void document.fonts?.load("800 34px 'Mona Sans Variable'").then(draw);
  return texture;
}
