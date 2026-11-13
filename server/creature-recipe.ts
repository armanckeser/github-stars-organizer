import { seededRandom, type Fighter } from "./battle.ts";
import { TYPE_COLOR } from "./cards.ts";

// Everything a repo's creature is, decided once: its body, the bits on its head,
// its colours, what floats over it, its eyes and its size. The arena builds it in 3D
// from this (src/components/battle/three/creature.ts) and the share pictures draw it
// flat (server/creature-sticker.ts), so one repo is the same creature in both.
//
// The draws come from one seeded random, in a fixed order. Changing the order
// changes every creature in the game; src/components/battle/three/creature.test.ts
// holds them to the recorded ones.

/** The six bodies. */
export const PLANS = ["golem", "wisp", "orb", "critter", "bird", "tome"] as const;

export type Body =
  | { plan: "golem"; top: "chimneys" | "horns" | "antenna" | "fins" }
  | { plan: "wisp"; curl: number; top: "horns" | "ears" | "crest" | "halo" }
  | { plan: "orb"; top: "feeler" | "feelers" | "ears" }
  | { plan: "critter"; top: "ears" | "buns" | "bunny" | "horn"; tail: "ball" | "spike" }
  | { plan: "bird"; bars: [number, number, number] }
  | { plan: "tome"; face: "glasses" | "bare" };

export type Emblem = "star" | "coin" | "camera" | "lock" | "bolt" | "heart" | "pin" | "cloud" | "gear";

/** The creature's paints as sRGB hex: its body, a lighter and a darker shade of it, and the trim. */
export type Paints = { base: string; light: string; dark: string; accent: string };

export type CreatureRecipe = {
  body: Body;
  paints: Paints;
  emblem: Emblem | null;
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
const BODIES: [RegExp, Body["plan"]][] = [
  [/bot|agent|\bai\b|gpt|llm|robot|auto|engine|compiler|kernel/, "golem"],
  [/cli\b|shell|term|script|bash|cmd|command/, "wisp"],
  [/web|site|css|html|browser|http|react|next|vue|\bui\b|front/, "orb"],
  [/data|\bdb\b|sql|chart|analytic|track|stat|budget|financ|money|metric/, "bird"],
  [/doc|book|awesome|guide|list|learn|note|blog|skill|organiz/, "tome"],
  [/app|mobile|ios|android|swift|game|play|meme|fun/, "critter"],
];

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

/** The plan's own draws, in the order its 3D model always made them. */
function bodyOf(plan: Body["plan"], random: () => number): Body {
  switch (plan) {
    case "golem":
      return { plan, top: (["chimneys", "horns", "antenna", "fins"] as const)[pick(random, 4)] };
    case "wisp": {
      const curl = between(random, 0.5, 1.1);
      return { plan, curl, top: (["horns", "ears", "crest", "halo"] as const)[pick(random, 4)] };
    }
    case "orb":
      return { plan, top: (["feeler", "feelers", "ears", "feelers"] as const)[pick(random, 4)] };
    case "critter": {
      const top = (["ears", "buns", "bunny", "horn"] as const)[pick(random, 4)];
      return { plan, top, tail: random() < 0.5 ? "ball" : "spike" };
    }
    case "bird":
      return { plan, bars: [between(random, 0.14, 0.4), between(random, 0.14, 0.4), between(random, 0.14, 0.4)] };
    case "tome":
      return { plan, face: random() < 0.5 ? "glasses" : "bare" };
  }
}

export function creatureRecipe(fighter: Fighter): CreatureRecipe {
  const random = seededRandom(`creature:${fighter.fullName.toLowerCase()}`);
  const paints = paintsOf(fighter, random);
  // A body is always drawn, so a repo whose words pick its body still takes this draw.
  const drawn = PLANS[pick(random, PLANS.length)];
  const body = bodyOf(about(fighter, BODIES) ?? drawn, random);
  const eyeHeight = between(random, 1, 1.45);
  const eyeSize = between(random, 0.9, 1.2);
  // Bigger repos are bigger creatures, within reason: both have to fit the arena.
  const grown = 0.86 + Math.min(fighter.level, 100) * 0.0042;
  const scale: [number, number, number] = [grown * between(random, 0.92, 1.1), grown * between(random, 0.92, 1.1), grown];
  return { body, paints, emblem: about(fighter, EMBLEMS) ?? null, eyeHeight, eyeSize, scale, shiny: fighter.shiny, phase: random() * 10 };
}
