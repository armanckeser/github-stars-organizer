import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { COLOR_PARTS, GOLD, STYLE_PARTS, type Look, type StylePart } from "../../../../server/character";
import { buildTrainer } from "./trainer";

const plain: Look = {
  skin: "#d39a6c", hair: "curly", hairColor: "#3f6fd8", top: "hoodie", topColor: "#d9482b",
  beard: "none", glasses: "none", hat: "none", headphones: "no",
};

/** Every visible part of the model: its shape, where it sits, and its colour. */
function shapeOf(look: Look, supporter = false): string[] {
  const { root } = buildTrainer(look, supporter);
  root.updateMatrixWorld(true);
  const parts: string[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.rim) return;
    const at = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld).toArray().map((n) => n.toFixed(3));
    const material = mesh.material as THREE.MeshToonMaterial;
    const { parameters } = mesh.geometry as THREE.BufferGeometry & { parameters?: Record<string, number> };
    parts.push(`${mesh.geometry.type}${JSON.stringify(parameters ?? {})}@${at.join(",")}#${material.color.getHexString()}/${material.opacity}`);
  });
  return parts.sort();
}

describe("the 3D figure", () => {
  // Regression guarded: a part the builder and the flat figure show that the arena
  // model ignores, so a character looks different in a battle than on their card.
  test.each(Object.keys(STYLE_PARTS) as StylePart[])("buildTrainer_builds_each_%s_differently_when_the_part_changes", (key) => {
    const built = STYLE_PARTS[key].map((id) => shapeOf({ ...plain, [key]: id }).join("|"));
    for (const shape of built) expect(shape).not.toContain("NaN");
    expect(new Set(built).size).toBe(STYLE_PARTS[key].length);
  });

  test.each(Object.keys(COLOR_PARTS) as (keyof typeof COLOR_PARTS)[])("buildTrainer_paints_with_the_%s_colour_when_the_colour_changes", (key) => {
    expect(shapeOf({ ...plain, [key]: "#123456" }).join("|")).toContain("#123456");
    expect(shapeOf(plain).join("|")).not.toContain("#123456");
  });

  // Regression guarded: the arena drops the band a supporter wears on their card, or
  // wears it only on the arm the board's camera can't see.
  test("buildTrainer_adds_a_gold_band_on_each_arm_only_when_the_player_starred_stard", () => {
    const gold = GOLD.slice(1);
    expect(shapeOf(plain, true).filter((shape) => shape.includes(`#${gold}`))).toHaveLength(2);
    expect(shapeOf(plain).join("|")).not.toContain(gold);
  });

  test("buildTrainer_hides_the_top_of_the_hair_when_a_hat_is_on", () => {
    const hats = (hair: Look["hair"]) => shapeOf({ ...plain, hair, hat: "beanie" }).join("|");
    expect(hats("curly")).toBe(hats("short"));
    expect(hats("long")).not.toBe(hats("short"));
  });
});
