import { seededRandom, type Fighter } from "./battle.ts";
import { TYPE_COLOR } from "./cards.ts";
import { priceOf, type RunFighter } from "./run/rules.ts";
import { roleOf, type Role } from "./run/stats.ts";
import { tierColor } from "./run/tiers.ts";

// Everything a repo's creature is, decided once: its body, the bits on its head,
// its colours, what floats over it, the sash that shows its cost, its eyes and its size.
// The body comes from the card's role (docs/GAME-DESIGN.md, "Added 2026-11-12"): each
// role has its own few bodies, so the outline says the role and two cards of one role
// still look apart. The arena builds it in 3D
// from this (src/components/battle/three/creature.ts) and the share pictures draw it
// flat (server/creature-sticker.ts), so one repo is the same creature in both.
//
// The draws come from one seeded random, in a fixed order. Changing the order
// changes every creature in the game; src/components/battle/three/creature.test.ts
// holds them to the recorded ones.

/** Each role's bodies. No body belongs to two roles, so a creature's outline names its role. */
export const FAMILIES = {
  // Wide and low.
  tank: ["golem", "turtle", "warden"],
  // Upright, with fists.
  bruiser: ["critter", "brawler", "rhino"],
  // Small and sharp.
  assassin: ["bird", "fox", "imp"],
  // Off the ground.
  ranged: ["wisp", "orb", "tome"],
} as const satisfies Record<Role, readonly string[]>;

/** Every body. */
export const PLANS = Object.values(FAMILIES).flat();

export type Body =
  | { plan: "golem"; top: "chimneys" | "horns" | "antenna" | "fins" }
  | { plan: "turtle"; shell: "dome" | "spikes" | "ridge" }
  | { plan: "warden"; top: "helm" | "horns" | "visor" }
  | { plan: "critter"; top: "ears" | "buns" | "bunny" | "horn"; tail: "ball" | "spike" }
  | { plan: "brawler"; top: "band" | "mohawk" | "ears" }
  | { plan: "rhino"; horns: "one" | "two"; top: "ears" | "plates" }
  | { plan: "bird"; bars: [number, number, number] }
  | { plan: "fox"; ears: "tall" | "wide"; tail: "brush" | "blade" }
  | { plan: "imp"; horns: "curved" | "straight" | "single" }
  | { plan: "wisp"; curl: number; top: "horns" | "ears" | "crest" | "halo" }
  | { plan: "orb"; top: "feeler" | "feelers" | "ears" }
  | { plan: "tome"; face: "glasses" | "bare" };

/** A card's cost in gold, which is its rarity plus one. */
export type Cost = 1 | 2 | 3 | 4 | 5;

/** The contribution sash: `lit` of its five squares in the cost's tier colour. */
export type Sash = { lit: Cost; tier: string };

export type Emblem = "star" | "coin" | "camera" | "lock" | "bolt" | "heart" | "pin" | "cloud" | "gear";

/** The creature's paints as sRGB hex: its body, a lighter and a darker shade of it, and the trim. */
export type Paints = { base: string; light: string; dark: string; accent: string };

export type CreatureRecipe = {
  body: Body;
  paints: Paints;
  emblem: Emblem | null;
  /** Null for a repo outside a run (the old one-on-one battle), which has no card and no cost. */
  sash: Sash | null;
  /** How much taller than wide its eyes are, 1 to 1.45. */
  eyeHeight: number;
  /** Its eyes against its body's own eye size, 0.9 to 1.2. */
  eyeSize: number;
  /** The whole creature's scale on x, y and z: bigger repos are bigger creatures. */
  scale: [number, number, number];
  shiny: boolean;
  /** Where its idle loop starts, so two creatures don't breathe in step. */
  phase: number;
};

// Words that say what a repo is, checked in the name first and then the description.
// Only the bodies of the card's own role are looked for, so a tank bot is a golem and a
// ranged bot is still off the ground.
const WORDS: Record<Body["plan"], RegExp> = {
  golem: /bot|agent|\bai\b|gpt|llm|robot|auto|engine|compiler|kernel/,
  turtle: /\bdb\b|database|sql|storage|cache|backup|archive|legacy|stable|\blts\b/,
  warden: /auth|secur|guard|firewall|protect|shield|proxy|safe|vault/,
  critter: /app|mobile|ios|android|swift|game|play|meme|fun/,
  brawler: /test|lint|fight|battle|bench|stress|debug|\bfix|bug/,
  rhino: /server|backend|infra|deploy|docker|kube|ops\b|cloud|host/,
  bird: /data|chart|analytic|track|stat|budget|financ|money|metric|feed|social/,
  fox: /fast|quick|speed|tiny|mini|micro|lite\b|light|nimble/,
  imp: /hack|exploit|cheat|crack|trick|magic|hook|inject|sneak|prank/,
  wisp: /cli\b|shell|term|script|bash|cmd|command/,
  orb: /web|site|css|html|browser|http|react|next|vue|\bui\b|front|api/,
  tome: /doc|book|awesome|guide|list|learn|note|blog|skill|organiz/,
};

// What floats over the creature's head, by what the repo is about.
const EMBLEMS: [RegExp, Emblem][] = [
  [/\bstar(s|red)?\b/, "star"],
  [/budget|money|financ|pay|bank|invoice|price|cost/, "coin"],
  [/photo|image|gif|video|meme|media|camera|clip|scene/, "camera"],
  [/auth|secret|leak|\block|secur|password|crypt/, "lock"],
  [/fast|speed|quick|turbo|perf|instant|lightning/, "bolt"],
  [/love|health|care|wedding|wish/, "heart"],
  [/\bmap|geo|track|travel|locat/, "pin"],
  [/cloud|deploy|server|host|docker|kube/, "cloud"],
  [/tool|config|build|util|plugin|sdk|framework/, "gear"],
];

const GREY = "#7b828c";
const WHITE = "#ffffff";
const BLACK = "#000000";
const HEX = /^#[0-9a-f]{6}$/i;
// Near-black language colours would lose every detail against the arena.
const DARKEST = 0.38;
// A language colour this close in hue to its type's colour gets a trim turned away from it.
const TRIM_CLASH = 0.06;

const pick = (random: () => number, count: number) => Math.floor(random() * count);
const between = (random: () => number, low: number, high: number) => low + random() * (high - low);

/** The first match in the repo's name, else in its description. */
function about<T>(fighter: Fighter, table: [RegExp, T][]): T | undefined {
  const name = (fighter.fullName.split("/")[1] ?? fighter.fullName).toLowerCase();
  const said = (fighter.description ?? "").toLowerCase();
  return (table.find(([words]) => words.test(name)) ?? table.find(([words]) => words.test(said)))?.[1];
}

/** The bodies a fighter may take: its role's, or every body for a fighter with no card. */
const familyOf = (fighter: Fighter | RunFighter): readonly Body["plan"][] => ("card" in fighter ? FAMILIES[roleOf(fighter.card)] : PLANS);

function sashOf(fighter: Fighter | RunFighter): Sash | null {
  if (!("card" in fighter)) return null;
  const cost = priceOf(fighter.card.rarity) as Cost;
  return { lit: cost, tier: tierColor(cost) };
}

// Colour as three.js handles it (r170, colour management on): hex is sRGB, and HSL and
// blending work on the linear values. Doing the same here keeps the paints the 3D models had.
type Linear = [number, number, number];
type Hsl = { h: number; s: number; l: number };

const toLinear = (c: number) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
const toSrgb = (c: number) => (c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055);

function linearOf(hex: string): Linear {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => toLinear(channel / 255)) as Linear;
}

function hexOf(color: Linear): string {
  return `#${color.map((channel) => Math.round(Math.min(1, Math.max(0, toSrgb(channel))) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function hslOf(color: Linear): Hsl {
  const [r, g, b] = color;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (min + max) / 2;
  if (min === max) return { h: 0, s: 0, l };
  const delta = max - min;
  const s = l <= 0.5 ? delta / (max + min) : delta / (2 - max - min);
  const sixths = max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: sixths / 6, s, l };
}

function hueToChannel(p: number, q: number, t: number): number {
  const turn = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
  if (turn < 1 / 6) return p + (q - p) * 6 * turn;
  if (turn < 1 / 2) return q;
  if (turn < 2 / 3) return p + (q - p) * 6 * (2 / 3 - turn);
  return p;
}

function fromHsl({ h, s, l }: Hsl): Linear {
  const hue = ((h % 1) + 1) % 1;
  const saturation = Math.min(1, Math.max(0, s));
  const lightness = Math.min(1, Math.max(0, l));
  if (saturation === 0) return [lightness, lightness, lightness];
  const p = lightness <= 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const q = 2 * lightness - p;
  return [hueToChannel(q, p, hue + 1 / 3), hueToChannel(q, p, hue), hueToChannel(q, p, hue - 1 / 3)];
}

const lerp = (from: Linear, to: Linear, amount: number): Linear => from.map((channel, i) => channel + (to[i] - channel) * amount) as Linear;

function paintsOf(fighter: Fighter, random: () => number): Paints {
  const typeColor = TYPE_COLOR[fighter.type];
  const own = linearOf(fighter.color && HEX.test(fighter.color) ? fighter.color : typeColor);
  const hsl = hslOf(own);
  // Each repo sits a little to one side of its language's colour, so a team in one language isn't one colour.
  hsl.h = (hsl.h + between(random, -0.07, 0.07) + 1) % 1;
  hsl.l = Math.max(DARKEST, hsl.l + between(random, -0.08, 0.1));
  let colour = fromHsl(hsl);
  let trim = linearOf(typeColor);
  const trimHsl = hslOf(trim);
  if (Math.abs(trimHsl.h - hsl.h) < TRIM_CLASH) trim = fromHsl({ h: trimHsl.h + 0.45, s: trimHsl.s, l: trimHsl.l + 0.08 });
  if (fighter.retired) {
    colour = lerp(colour, linearOf(GREY), 0.8);
    trim = lerp(trim, linearOf(GREY), 0.7);
  }
  return { base: hexOf(colour), light: hexOf(lerp(colour, linearOf(WHITE), 0.5)), dark: hexOf(lerp(colour, linearOf(BLACK), 0.32)), accent: hexOf(trim) };
}

/** The plan's own draws, in the order its model always made them. */
function bodyOf(plan: Body["plan"], random: () => number): Body {
  switch (plan) {
    case "golem":
      return { plan, top: (["chimneys", "horns", "antenna", "fins"] as const)[pick(random, 4)] };
    case "turtle":
      return { plan, shell: (["dome", "spikes", "ridge"] as const)[pick(random, 3)] };
    case "warden":
      return { plan, top: (["helm", "horns", "visor"] as const)[pick(random, 3)] };
    case "critter": {
      const top = (["ears", "buns", "bunny", "horn"] as const)[pick(random, 4)];
      return { plan, top, tail: random() < 0.5 ? "ball" : "spike" };
    }
    case "brawler":
      return { plan, top: (["band", "mohawk", "ears"] as const)[pick(random, 3)] };
    case "rhino": {
      const horns = random() < 0.5 ? "one" : "two";
      return { plan, horns, top: random() < 0.5 ? "ears" : "plates" };
    }
    case "bird":
      return { plan, bars: [between(random, 0.14, 0.4), between(random, 0.14, 0.4), between(random, 0.14, 0.4)] };
    case "fox": {
      const ears = random() < 0.5 ? "tall" : "wide";
      return { plan, ears, tail: random() < 0.5 ? "brush" : "blade" };
    }
    case "imp":
      return { plan, horns: (["curved", "straight", "single"] as const)[pick(random, 3)] };
    case "wisp": {
      const curl = between(random, 0.5, 1.1);
      return { plan, curl, top: (["horns", "ears", "crest", "halo"] as const)[pick(random, 4)] };
    }
    case "orb":
      return { plan, top: (["feeler", "feelers", "ears", "feelers"] as const)[pick(random, 4)] };
    case "tome":
      return { plan, face: random() < 0.5 ? "glasses" : "bare" };
  }
}

/** A fighter's creature. A run's fighter (with its card) takes a body of its role and wears its cost on a sash. */
export function creatureRecipe(fighter: Fighter | RunFighter): CreatureRecipe {
  const random = seededRandom(`creature:${fighter.fullName.toLowerCase()}`);
  const paints = paintsOf(fighter, random);
  const family = familyOf(fighter);
  // A body is always drawn, so a repo whose words pick its body still takes this draw.
  const drawn = family[pick(random, family.length)];
  const named = about(fighter, family.map((plan): [RegExp, Body["plan"]] => [WORDS[plan], plan]));
  const body = bodyOf(named ?? drawn, random);
  const eyeHeight = between(random, 1, 1.45);
  const eyeSize = between(random, 0.9, 1.2);
  // Bigger repos are bigger creatures, within reason: both have to fit the arena.
  const grown = 0.86 + Math.min(fighter.level, 100) * 0.0042;
  const scale: [number, number, number] = [grown * between(random, 0.92, 1.1), grown * between(random, 0.92, 1.1), grown];
  return { body, paints, emblem: about(fighter, EMBLEMS) ?? null, sash: sashOf(fighter), eyeHeight, eyeSize, scale, shiny: fighter.shiny, phase: random() * 10 };
}
