import "../index.css";
import { poolFor } from "../../e2e/pool";
import { BoardWorld, type BoardUnit } from "../components/battle/three/board";
import { shopArt } from "../components/battle/three/portrait";
import { creatureRecipe } from "../../server/creature-recipe";
import { creatureSticker } from "../../server/creature-sticker";
import type { RunFighter } from "../../server/run/rules";
import { roleOf, type Role } from "../../server/run/stats";
import { cellOf, type Card, type Side } from "../../server/run/types";

// A page for judging the creatures by eye, with made-up accounts (e2e/pool.ts):
//   ?view=grid      every body of every role, at a low and a high cost
//   ?view=board     7 cards a side on the real Play board; ?count=0 for an empty board.
//                   window.frames() reports the frame times measured so far.
//   ?view=stickers  the flat sticker beside the 3D portrait, for three cards

const ROLES: Role[] = ["tank", "bruiser", "assassin", "ranged"];
const LOGINS = Array.from({ length: 60 }, (_, i) => `study-group-${i}`);
// The made-up pool's one description says "browser", which picks a body by itself, so it is dropped.
const teamOf = (login: string): RunFighter[] => poolFor(login).team.map((fighter) => ({ ...fighter, description: null }));
const fighters: RunFighter[] = LOGINS.flatMap(teamOf);
const params = new URLSearchParams(location.search);
const view = params.get("view") ?? "grid";
document.body.style.cssText = "margin:0;background:#0e1418;color:#e6edf3;font:13px 'Space Grotesk Variable',system-ui";

const atCost = (fighter: RunFighter, cost: number): RunFighter => ({ ...fighter, card: { ...fighter.card, rarity: (cost - 1) as Card["rarity"] } });
const bodyOf = (fighter: RunFighter) => creatureRecipe(fighter).body.plan;

function tile(fighter: RunFighter, caption: string, width: number): HTMLElement {
  const figure = document.createElement("figure");
  figure.style.cssText = `margin:0;width:${width}px;display:flex;flex-direction:column;gap:4px`;
  const image = document.createElement("img");
  image.src = shopArt(fighter);
  image.style.cssText = `width:${width}px;height:${Math.round((width * 300) / 480)}px;border-radius:6px`;
  const label = document.createElement("figcaption");
  label.textContent = caption;
  figure.append(image, label);
  return figure;
}

function grid() {
  const bodies = [...new Set(fighters.map(bodyOf))].sort();
  const table = document.createElement("div");
  table.style.cssText = "display:flex;flex-direction:column;gap:18px;padding:16px";
  for (const role of ROLES) {
    const heading = document.createElement("h2");
    heading.textContent = role;
    heading.style.cssText = "margin:0;font:600 20px 'Clash Display'";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:12px";
    for (const body of bodies) {
      const found = fighters.find((fighter) => roleOf(fighter.card) === role && bodyOf(fighter) === body);
      if (!found) continue;
      for (const cost of [1, 4]) row.append(tile(atCost(found, cost), `${body} · cost ${cost} · ${found.fullName.split("/")[1]}`, 260));
    }
    table.append(heading, row);
  }
  document.body.append(table);
}

function board() {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.append(host);
  const world = new BoardWorld(host, { reduced: false, lite: false, onLost: () => {}, onSelect: () => {}, onFightEnd: () => {}, onDrag: () => {}, onMove: () => {}, sellPrice: () => null });
  const count = Number(params.get("count") ?? "7");
  const teams = [teamOf("abed"), teamOf("troy")];
  const units: BoardUnit[] = teams.flatMap((team, side) =>
    team.slice(0, count).map((fighter, index) => ({ id: `${side}:${fighter.fullName}`, side: side as Side, fighter, ...cellOf(side as Side, { col: index % 4, row: Math.floor(index / 4) }), ranged: fighter.card.range > 1 })),
  );
  world.setLooks(null, null);
  world.setUnits(units);
  const renderer = (world as unknown as { renderer: { render: (...args: unknown[]) => void; info: { render: { calls: number; triangles: number } } } }).renderer;
  const render = renderer.render.bind(renderer);
  const renders: number[] = [];
  const gaps: number[] = [];
  let last = 0;
  renderer.render = (...args: unknown[]) => {
    const start = performance.now();
    render(...args);
    renders.push(performance.now() - start);
    if (last) gaps.push(start - last);
    last = start;
  };
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)] ?? 0;
  Object.assign(window, {
    frames: () => ({ frames: gaps.length, gapMedian: median(gaps), gapP95: p95(gaps), renderMedian: median(renders), renderP95: p95(renders), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    resetFrames: () => {
      renders.length = 0;
      gaps.length = 0;
      last = 0;
    },
  });
}

function stickers() {
  const picks = [fighters.find((fighter) => roleOf(fighter.card) === "tank"), fighters.find((fighter) => roleOf(fighter.card) === "assassin"), fighters.find((fighter) => roleOf(fighter.card) === "ranged")];
  const list = document.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:16px;padding:16px";
  picks.forEach((found, i) => {
    if (!found) return;
    const fighter = atCost(found, [2, 3, 5][i]);
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:16px;align-items:center";
    const flat = document.createElement("div");
    flat.style.cssText = "width:300px;height:300px;background:#2a343b;border-radius:6px";
    flat.innerHTML = `<svg width="300" height="300" viewBox="0 0 300 300">${creatureSticker(creatureRecipe(fighter), { x: 0, y: 0, size: 300 })}</svg>`;
    row.append(flat, tile(fighter, `${fighter.fullName.split("/")[1]} · ${roleOf(fighter.card)} · cost ${fighter.card.rarity + 1}`, 480));
    list.append(row);
  });
  document.body.append(list);
}

if (view === "grid") grid();
if (view === "board") board();
if (view === "stickers") stickers();
