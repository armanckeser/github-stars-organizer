import "../index.css";
import { CARD_TYPES } from "../../server/battle";
import { BoardWorld, type BoardUnit } from "../components/battle/three/board";
import { CREATURE_REPOS } from "../components/battle/three/creature-fingerprint";
import { ABILITIES } from "../../server/run/abilities";
import { BOOSTS } from "../../server/run/boosts";
import { fight } from "../../server/run/fight";
import type { Effect } from "../../server/run/hooks";
import { effectsOf, sourceOf } from "../../server/run/names";
import { COMMON_TOPICS, FAMILIES } from "../../server/run/sets";
import { cityCollege, greendale } from "../../server/run/testbed";
import { cellOf, type FightEvent, type Side, type Snapshot } from "../../server/run/types";

// A page that plays one ability, set bonus or boost on the real board, from a real fight,
// so its effect can be looked at and screenshotted alone. Open /fx.html?play=<id>, for
// example ?play=fork-bomb, ?play=boost:head-start or ?play=set:web.
//
// The fight is the ability tests' testbed (server/run/testbed.ts): every trigger happens
// to side 0's first card. Every other ability event is dropped, so only the chosen one is
// drawn; the hits, heals and conditions of the whole fight still play.

const KINDS: Effect["kind"][] = ["damage", "shield", "heal", "stat", "condition"];
const SOURCES = [...ABILITIES.map((ability) => ability.id), ...BOOSTS.map((boost) => `boost:${boost.id}`), ...[...Object.keys(FAMILIES), COMMON_TOPICS[0]].map((set) => `set:${set}`)];

/** Side 0 with all three cards in the set: a family's by their type, a topic's by their topics. */
function setTeam(set: string): Snapshot {
  const team = greendale({}, [[set], [set], [set]]);
  const family = CARD_TYPES.find((type) => type === set);
  if (!family) return team;
  return { ...team, units: team.units.map((unit) => ({ ...unit, card: { ...unit.card, type: family } })) };
}

function teamsFor(source: string): [Snapshot, Snapshot] {
  if (source.startsWith("boost:")) return [greendale({}, [[], [], []], [source.slice("boost:".length)]), { ...cityCollege, boosts: ["opening-volley"] }];
  if (source.startsWith("set:")) return [setTeam(source.slice("set:".length)), cityCollege];
  return [greendale({ ability: source }), cityCollege];
}

function unitsOf(snapshot: Snapshot, side: Side, offset: number): BoardUnit[] {
  return snapshot.units.map((placed, index) => ({
    id: `${side}-${index}`,
    side,
    fighter: { ...CREATURE_REPOS[(offset + index) % CREATURE_REPOS.length], hp: placed.card.hp },
    ...cellOf(side, placed),
    ranged: placed.card.range > 1,
  }));
}

const host = document.createElement("div");
host.style.cssText = "position:fixed;inset:0";
document.body.append(host);
const panel = document.createElement("div");
panel.style.cssText = "position:fixed;left:8px;top:8px;z-index:10;display:flex;flex-direction:column;gap:6px;max-height:calc(100vh - 16px);overflow:auto;font:12px system-ui;color:#e6edf3";
document.body.append(panel);

const params = new URLSearchParams(location.search);
let current = params.get("play") ?? "fork-bomb";
let speed = Number(params.get("speed") ?? "1");
const board = new BoardWorld(host, {
  reduced: params.get("reduced") === "1",
  lite: false,
  onLost: () => {},
  onSelect: () => {},
  onFightEnd: () => {
    if (params.get("loop") !== "0") setTimeout(() => play(current), 600);
  },
  onDrag: () => {},
  onMove: () => {},
  sellPrice: () => null,
});
let count = 0;

function play(source: string) {
  current = source;
  const [mine, theirs] = teamsFor(source);
  const units = [...unitsOf(mine, 0, 0), ...unitsOf(theirs, 1, 5)];
  const events = fight(mine, theirs, "fx").filter((event: FightEvent) => event.kind !== "ability" || event.ability === source);
  board.setSpeed(speed);
  board.setUnits(units);
  count += 1;
  const ids: [string[], string[]] = [mine.units.map((_, index) => `0-${index}`), theirs.units.map((_, index) => `1-${index}`)];
  // A beat between the creatures popping in and the fight starting.
  setTimeout(() => board.play({ key: `${source}|${count}`, ids, events }), 500);
  document.title = `fx: ${source}`;
  history.replaceState(null, "", `?${new URLSearchParams({ ...Object.fromEntries(params), play: source }).toString()}`);
}

function button(label: string, onClick: () => void) {
  const element = document.createElement("button");
  element.textContent = label;
  element.style.cssText = "padding:2px 6px;border:1px solid #30363d;border-radius:4px;background:#161b22;color:inherit;font:inherit;cursor:pointer;text-align:left";
  element.addEventListener("click", onClick);
  return element;
}

const controls = document.createElement("div");
controls.style.cssText = "display:flex;gap:4px";
controls.append(
  button("Replay", () => play(current)),
  button("Speed 0.5x / 1x", () => {
    speed = speed === 1 ? 0.5 : 1;
    play(current);
  }),
);
panel.append(controls);
for (const kind of KINDS) {
  const group = document.createElement("details");
  group.open = false;
  const title = document.createElement("summary");
  title.textContent = kind;
  group.append(title);
  for (const source of SOURCES.filter((id) => effectsOf(id)[0]?.kind === kind)) group.append(button(`${sourceOf(source).name} (${source})`, () => play(source)));
  panel.append(group);
}
if (params.get("menu") === "0") panel.style.display = "none";

declare global {
  interface Window {
    fx: { play: (source: string) => void };
  }
}
window.fx = { play };
play(current);
