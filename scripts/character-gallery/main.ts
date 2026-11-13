import * as THREE from "three";
import { characterFromFile, figureImage, type Look } from "../../server/character";
import { buildTrainer } from "../../src/components/battle/three/trainer";
import { dispose } from "../../src/components/battle/three/kit";

// Every file in characters/, each as the arena model and the flat figure side by side.
// Run with `npx vite scripts/character-gallery`; add `?supporter=1` to see the star patch on each.

const supporter = new URLSearchParams(location.search).has("supporter");
const files = import.meta.glob<string>("../../characters/*.md", { query: "?raw", import: "default", eager: true });

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(220, 300, false);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a93a3, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-3, 5, 6);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(30, 220 / 300, 0.1, 40);
camera.position.set(0, 1.15, 4.3);
camera.lookAt(0, 1.0, 0);

function model(look: Look): string {
  const trainer = buildTrainer(look, supporter);
  trainer.root.rotation.y = 0.35;
  scene.add(trainer.root);
  renderer.render(scene, camera);
  const image = renderer.domElement.toDataURL("image/png");
  dispose(trainer.root);
  return image;
}

const grid = document.getElementById("grid")!;
for (const [path, text] of Object.entries(files)) {
  const login = path.split("/").pop()!.replace(/\.md$/, "");
  if (login === "README") continue;
  const { look } = characterFromFile(text, login);
  const card = document.createElement("div");
  card.className = "card";
  const flat = `data:image/svg+xml,${encodeURIComponent(figureImage(look, supporter))}`;
  card.innerHTML = `<div class="pair"><img src="${model(look)}" alt=""><img src="${flat}" alt=""></div><div class="login">${login}</div><div class="parts">${look.hair} · ${look.beard} beard · ${look.glasses} glasses · ${look.top}</div>`;
  grid.append(card);
}
