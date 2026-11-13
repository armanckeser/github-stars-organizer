import * as THREE from "three";
import { fighterFor, type Fighter, type RepoFacts } from "../../../../server/battle";
import type { RunFighter } from "../../../../server/run/rules";
import { card } from "../../../../server/run/testbed";
import type { Card } from "../../../../server/run/types";
import { buildCreature } from "./creature";

// What a creature is made of, as plain numbers: every part's shape, where the
// model puts it, its colour, and whether it has an outline. The creature tests
// compare these against the creatures as they were drawn when the file was recorded.

const NOW = Date.parse("2026-11-10T00:00:00Z");
const DAY = 86_400_000;
const PLACES = 4;
// A quad drawn as two triangles with no shared vertices.
const VERTICES_PER_QUAD = 6;

/** A part's print; `paints` lists a vertex-coloured part's pieces (the sash), one colour per quad. */
export type PartPrint = { shape: string; size: number[]; matrix: number[]; color: string | null; outlined: boolean; paints?: string[] };
export type CreaturePrint = { name: string; parts: PartPrint[]; height: number; floats: boolean; shiny: boolean; phase: number };

const rounded = (value: number) => Number(value.toFixed(PLACES)) + 0;

function facts(fullName: string, extra: Partial<RepoFacts>): RepoFacts {
  return {
    fullName, description: null, stars: 5000, forks: 300, language: "TypeScript", color: "#3178c6", avatarUrl: null,
    isArchived: false, createdAt: new Date(NOW - 1500 * DAY).toISOString(), pushedAt: new Date(NOW - 3 * DAY).toISOString(),
    openIssues: 50, closedIssues: 450, releases: 12, contributors: 40, commits: 2000, ...extra,
  };
}

/** Repos picked so every body, every emblem and every colour rule is drawn at least once. */
export const CREATURE_REPOS: Fighter[] = [
  ["greendale/annie-bot", { description: "An agent that studies" }],
  ["greendale/troy-cli", { language: "Shell", color: "#89e051" }],
  ["greendale/abed-web", { description: "A site about films", stars: 90000 }],
  ["greendale/budget-tracker", { language: "Python", color: "#3572A5" }],
  ["greendale/britta-docs", { language: null, color: null }],
  ["greendale/pierce-app", { description: "A mobile game", language: "Swift", color: "#F05138" }],
  ["greendale/dreamatorium", { description: "Stars a whole fake world" }],
  ["greendale/paintball", { description: "A fast photo camera", stars: 12 }],
  ["greendale/blanketfort", { description: "Locks your secrets away", language: "C", color: "#555555" }],
  ["greendale/chang", { description: "Love, maps and travel", color: "#000000" }],
  ["greendale/shirley", { description: "Deploys a server to the cloud", isArchived: true }],
  ["greendale/dean", { description: "A build tool and plugin framework" }],
  ["greendale/leonard", { description: "Health and care", language: "Ruby", color: "#701516" }],
  ["greendale/koosh", {}],
  ["greendale/inspector-spacetime", { description: "Pays the invoice" }],
  ["armanckeser/github-stars-organizer", { description: "Organizes your stars" }],
].map(([fullName, extra]) => fighterFor(facts(fullName as string, extra as Partial<RepoFacts>), "greendale", NOW));

// Stats that put a card in each role (server/run/stats.ts roleOf): toughness well over its
// attack and speed, under them, between, or a reach over 1.
const ROLE_STATS = {
  tank: { hp: 300 },
  bruiser: {},
  assassin: { hp: 130, guard: 40, attack: 140 },
  ranged: { range: 3 },
} satisfies Record<string, Partial<Card>>;

/** Cards in a run, one for every body, named so a word picks it, across every role and cost. */
export const RUN_CREATURES: RunFighter[] = (
  [
    ["greendale/annie-bot", "tank", 0],
    ["greendale/shirley-archive", "tank", 1],
    ["greendale/dean-vault", "tank", 2],
    ["greendale/pierce-game", "bruiser", 3],
    ["greendale/troy-debug", "bruiser", 4],
    ["greendale/chang-server", "bruiser", 0],
    ["greendale/abed-tracker", "assassin", 1],
    ["greendale/britta-quick", "assassin", 2],
    ["greendale/magnitude-prank", "assassin", 3],
    ["greendale/leonard-shell", "ranged", 4],
    ["greendale/vicki-site", "ranged", 0],
    ["greendale/garrett-notes", "ranged", 1],
  ] as const
).map(([fullName, role, rarity]) => ({ ...fighterFor(facts(fullName, {}), "greendale", NOW), card: card(fullName, { ...ROLE_STATS[role], rarity }) }));

function sizeOf(geometry: THREE.BufferGeometry): number[] {
  const parameters = (geometry as THREE.BufferGeometry & { parameters?: Record<string, number | boolean> }).parameters ?? {};
  return Object.values(parameters).filter((value): value is number => typeof value === "number").map(rounded);
}

function colorOf(material: THREE.Material | THREE.Material[]): string | null {
  const one = Array.isArray(material) ? material[0] : material;
  return one instanceof THREE.MeshToonMaterial || one instanceof THREE.MeshBasicMaterial ? `#${one.color.getHexString()}` : null;
}

/** The colour of every quad of a vertex-coloured mesh, back in sRGB hex. */
function paintsOf(geometry: THREE.BufferGeometry): string[] | undefined {
  const colors = geometry.getAttribute("color");
  if (!colors) return undefined;
  const color = new THREE.Color();
  return Array.from({ length: colors.count / VERTICES_PER_QUAD }, (_, i) => `#${color.fromBufferAttribute(colors, i * VERTICES_PER_QUAD).getHexString()}`);
}

/** A built geometry's size: its parameters, or its vertex count and spread for one built by hand. */
function measured(geometry: THREE.BufferGeometry): number[] {
  const parameters = sizeOf(geometry);
  if (parameters.length > 0) return parameters;
  const positions = geometry.getAttribute("position");
  return [positions.count, rounded(Array.from(positions.array).reduce((sum, value) => sum + Math.abs(value), 0))];
}

export function printOf(fighter: Fighter | RunFighter): CreaturePrint {
  const creature = buildCreature(fighter);
  creature.root.updateMatrixWorld(true);
  const parts: PartPrint[] = [];
  creature.root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || node.userData.rim) return;
    parts.push({
      shape: node.geometry.type,
      size: measured(node.geometry),
      matrix: node.matrixWorld.elements.map(rounded),
      color: colorOf(node.material),
      outlined: node.children.some((child) => child.userData.rim),
      ...(paintsOf(node.geometry) ? { paints: paintsOf(node.geometry) } : {}),
    });
  });
  return { name: fighter.fullName, parts, height: rounded(creature.height), floats: creature.floats, shiny: creature.shiny, phase: rounded(creature.phase) };
}
