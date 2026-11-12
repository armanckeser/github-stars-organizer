import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// A boost's medallion: a brass coin with a raised rim, an enamel field and the boost's
// icon inlaid in the same metal. Drawn once with real reflections (a room environment
// map) and kept as an image, the way portrait.ts keeps a creature's picture, so the pick
// screen holds no WebGL context of its own.

const SIZE = 360;
const drawn = new Map<string, string>();

/** The coin's profile, turned about its axis: the field, a bevel up to the rim, the rim's top, its outer edge. */
const PROFILE = [
  [0, 0.06],
  [0.74, 0.06],
  [0.79, 0.15],
  [0.92, 0.17],
  [1.0, 0.1],
  [1.0, -0.06],
  [0, -0.06],
].map(([x, y]) => new THREE.Vector2(x, y));

/** A white icon on black, from an SVG's markup: the mask the inlay is cut with. */
async function mask(svg: string): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const pen = canvas.getContext("2d")!;
  pen.fillStyle = "#000";
  pen.fillRect(0, 0, 256, 256);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  pen.drawImage(image, 40, 40, 176, 176);
  return canvas;
}

/**
 * The medallion for one boost, as a PNG data URL. `svg` is the icon's markup drawn in
 * white; `enamel` the field's colour. Throws when the browser has no WebGL.
 */
export async function medallion(key: string, svg: string, enamel: string): Promise<string> {
  const kept = drawn.get(key);
  if (kept) return kept;
  const icon = await mask(svg);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  try {
    renderer.setSize(SIZE, SIZE, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    // A dim room: the brass still catches its windows, but the enamel's clear coat no longer reflects it as white.
    scene.environmentIntensity = 0.5;
    const lamp = new THREE.DirectionalLight(0xfff0d8, 2.2);
    lamp.position.set(-2, 3, 4);
    scene.add(lamp);

    const brass = new THREE.MeshStandardMaterial({ color: 0xe0ac48, metalness: 1, roughness: 0.26, envMapIntensity: 1.8 });
    const coin = new THREE.Mesh(new THREE.LatheGeometry(PROFILE, 96), brass);
    coin.rotation.x = Math.PI / 2;
    scene.add(coin);

    const field = new THREE.Mesh(
      new THREE.CircleGeometry(0.75, 96),
      new THREE.MeshPhysicalMaterial({ color: enamel, roughness: 0.55, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.12 }),
    );
    field.position.z = 0.061;
    scene.add(field);

    // The icon: the same brass, cut out by the mask and raised by it, so its edges catch the light.
    const shape = new THREE.CanvasTexture(icon);
    const inlay = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshStandardMaterial({ color: 0xf0c76a, metalness: 1, roughness: 0.22, envMapIntensity: 1.8, alphaMap: shape, transparent: true, bumpMap: shape, bumpScale: 4 }),
    );
    inlay.position.z = 0.064;
    scene.add(inlay);

    const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
    camera.position.set(0.35, -0.55, 4.9);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    const image = renderer.domElement.toDataURL("image/png");
    pmrem.dispose();
    scene.environment?.dispose();
    for (const mesh of [coin, field, inlay]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    shape.dispose();
    drawn.set(key, image);
    return image;
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
