import * as THREE from "three";

// What every model in the arena is made of: flat-shaded parts with a dark outline.
// Three bands of light instead of a smooth falloff is what makes a model read as drawn.
const BANDS = new THREE.DataTexture(new Uint8Array([105, 180, 255]), 3, 1, THREE.RedFormat);
BANDS.minFilter = BANDS.magFilter = THREE.NearestFilter;
BANDS.needsUpdate = true;

const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x12151a, side: THREE.BackSide });
const OUTLINE_WIDTH = 0.028;

export type Paint = THREE.ColorRepresentation;

export function toon(color: Paint): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: BANDS });
}

export type PartOptions = {
  at?: [number, number, number];
  scale?: [number, number, number] | number;
  turn?: [number, number, number];
  outline?: boolean;
};

/**
 * One part of a model. The outline is the same shape again, a little larger and
 * drawn inside out, so only its rim shows around the part.
 */
export function part(geometry: THREE.BufferGeometry, material: THREE.Material, options: PartOptions = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  if (options.at) mesh.position.set(...options.at);
  if (options.turn) mesh.rotation.set(...options.turn);
  if (typeof options.scale === "number") mesh.scale.setScalar(options.scale);
  else if (options.scale) mesh.scale.set(...options.scale);
  if (options.outline !== false) {
    geometry.computeBoundingSphere();
    const radius = geometry.boundingSphere?.radius ?? 1;
    const smallest = Math.min(mesh.scale.x, mesh.scale.y, mesh.scale.z);
    const rim = new THREE.Mesh(geometry, OUTLINE);
    rim.scale.setScalar(1 + Math.min(0.3, OUTLINE_WIDTH / (radius * smallest)));
    rim.userData.rim = true;
    mesh.add(rim);
  }
  return mesh;
}

export const sphere = (radius: number, detail = 20) => new THREE.SphereGeometry(radius, detail, Math.round(detail * 0.7));
export const cone = (radius: number, height: number, sides = 14) => new THREE.ConeGeometry(radius, height, sides);
export const cylinder = (top: number, bottom: number, height: number, sides = 16) => new THREE.CylinderGeometry(top, bottom, height, sides);
export const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);

/** Frees everything under `root` that this file's helpers made. The shared outline and bands stay. */
export function dispose(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.geometry) return;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material !== OUTLINE) material.dispose();
    }
  });
  root.removeFromParent();
}

export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Runs past the end and settles back: how something lands. */
export const overshoot = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
