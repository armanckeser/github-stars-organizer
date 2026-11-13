// A player's character (issue #45): the figure that stands behind their cards, and the
// class that bends the rules a little in their favour. A character is not stored
// anywhere. The person builds one, and everything about it travels in the address of
// the trainer card they paste into their profile README; the game reads it from there.

export const CLASS_IDS = ["rookie", "maintainer", "scout", "collector", "specialist", "veteran", "archivist"] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export const CLASSES: Record<ClassId, { label: string; perk: string; color: string }> = {
  rookie: { label: "Rookie", perk: "No perk yet. Pick a class to get one.", color: "#3a4049" },
  maintainer: { label: "Maintainer", perk: "Repos you own are 8% stronger.", color: "#1fa866" },
  scout: { label: "Scout", perk: "Cards under 1,000 stars are 15% stronger.", color: "#1f8fe0" },
  collector: { label: "Collector", perk: "A team of all different types is 6% stronger.", color: "#7c5cd6" },
  specialist: { label: "Specialist", perk: "Three or more cards of one type hit 10% harder.", color: "#d9482b" },
  veteran: { label: "Veteran", perk: "Cards 8 years or older get 12% more HP and defense.", color: "#d99a0b" },
  archivist: { label: "Archivist", perk: "Archived repos fight at full strength.", color: "#77818d" },
};

// What a figure is made of. Each style part is one id from its list below; each colour
// part is a colour, usually one from its palette. The order of every list is fixed:
// a look code in an address names a part by its place in the list.
export const HAIRS = ["short", "side-part", "long", "bun", "curly", "buzz", "bald", "medium", "mohawk"] as const;
export const TOPS = ["tee", "hoodie", "jacket", "sweater", "shirt"] as const;
export const BEARDS = ["none", "stubble", "full", "goatee", "moustache"] as const;
export const GLASSES = ["none", "round", "square", "shades"] as const;
export const HATS = ["none", "cap", "beanie"] as const;
export const HEADPHONES = ["no", "yes"] as const;

export type Hair = (typeof HAIRS)[number];
export type Top = (typeof TOPS)[number];
export type Beard = (typeof BEARDS)[number];
export type Glasses = (typeof GLASSES)[number];
export type Hat = (typeof HATS)[number];
export type Headphones = (typeof HEADPHONES)[number];
export type Hex = `#${string}`;

export type Look = {
  skin: Hex;
  hair: Hair;
  hairColor: Hex;
  top: Top;
  topColor: Hex;
  beard: Beard;
  glasses: Glasses;
  hat: Hat;
  headphones: Headphones;
};

/** A colour with the name a character file may use for it. */
export type Swatch = { name: string; hex: Hex };

export const SKINS: readonly Swatch[] = [
  { name: "light", hex: "#f6d7c0" }, { name: "fair", hex: "#ecc09c" }, { name: "tan", hex: "#d39a6c" }, { name: "brown", hex: "#a56c43" }, { name: "deep", hex: "#6b4429" },
];
export const HAIR_COLORS: readonly Swatch[] = [
  { name: "black", hex: "#1d1b1a" }, { name: "brown", hex: "#5a3a22" }, { name: "blonde", hex: "#d9b25f" }, { name: "red", hex: "#b4472b" }, { name: "grey", hex: "#9aa0a6" }, { name: "blue", hex: "#3f6fd8" },
];
export const TOP_COLORS: readonly Swatch[] = [
  { name: "green", hex: "#1fa866" }, { name: "blue", hex: "#1f8fe0" }, { name: "purple", hex: "#7c5cd6" }, { name: "red", hex: "#d9482b" },
  { name: "orange", hex: "#e07a1f" }, { name: "yellow", hex: "#e0b21f" }, { name: "charcoal", hex: "#3a4049" }, { name: "white", hex: "#eceae4" },
];

/** The parts in the order a look code lists them. */
export const STYLE_PARTS = { hair: HAIRS, top: TOPS, beard: BEARDS, glasses: GLASSES, hat: HATS, headphones: HEADPHONES } as const;
export const COLOR_PARTS = { skin: SKINS, hairColor: HAIR_COLORS, topColor: TOP_COLORS } as const;
export type StylePart = keyof typeof STYLE_PARTS;
export type ColorPart = keyof typeof COLOR_PARTS;

/** "side-part" as a person reads it: "Side part". */
export const partLabel = (id: string) => `${id.charAt(0).toUpperCase()}${id.slice(1).replace(/-/g, " ")}`;

/**
 * A look as the six numbers it was before glasses, beard, hat and headphones were
 * separate: one slot, `extra`, held at most one of them. Codes in this shape sit in
 * people's READMEs and looks in this shape sit in signed opening posts.
 */
export type LegacyLook = { skin: number; hair: number; hairColor: number; top: number; topColor: number; extra: number };

const LEGACY_LENGTHS = { skin: 5, hair: 6, hairColor: 6, top: 4, topColor: 8, extra: 5 } as const;
const LEGACY_KEYS = ["skin", "hair", "hairColor", "top", "topColor", "extra"] as const;
const NO_EXTRAS = { beard: "none", glasses: "none", hat: "none", headphones: "no" } as const satisfies Pick<Look, Extra>;
type Extra = "beard" | "glasses" | "hat" | "headphones";
// What each value of the old `extra` slot is now, in the old slot's order.
const LEGACY_EXTRAS: readonly Pick<Look, Extra>[] = [
  NO_EXTRAS,
  { ...NO_EXTRAS, glasses: "round" },
  { ...NO_EXTRAS, headphones: "yes" },
  { ...NO_EXTRAS, hat: "cap" },
  { ...NO_EXTRAS, beard: "full" },
];

/** A look in either shape, as today's. */
export function readLook(stored: Look | LegacyLook): Look {
  if (!("extra" in stored)) return stored;
  return {
    skin: SKINS[stored.skin]?.hex ?? SKINS[0].hex,
    hair: HAIRS[stored.hair] ?? HAIRS[0],
    hairColor: HAIR_COLORS[stored.hairColor]?.hex ?? HAIR_COLORS[0].hex,
    top: TOPS[stored.top] ?? TOPS[0],
    topColor: TOP_COLORS[stored.topColor]?.hex ?? TOP_COLORS[0].hex,
    ...(LEGACY_EXTRAS[stored.extra] ?? NO_EXTRAS),
  };
}

/** The same look with no glasses, beard, hat or headphones. */
export const withoutExtras = (look: Look): Look => ({ ...look, ...NO_EXTRAS });

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The figure someone has before they build one: always the same for the same username.
 * Picked from the six old lists, so nobody's default figure changed when parts were added.
 */
export function defaultLook(login: string): Look {
  let h = hash(login.toLowerCase());
  const legacy = {} as LegacyLook;
  for (const key of LEGACY_KEYS) {
    legacy[key] = h % LEGACY_LENGTHS[key];
    h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
  }
  return readLook(legacy);
}

const HEX = /^#?([0-9a-f]{6})$/i;

/** A colour as `#rrggbb` in lower case, or null when the text isn't one. */
export function hexColor(text: string): Hex | null {
  const found = HEX.exec(text.trim());
  return found ? `#${found[1].toLowerCase()}` : null;
}

const encodeColor = (palette: readonly Swatch[], hex: Hex) => {
  const at = palette.findIndex((swatch) => swatch.hex === hex);
  return at >= 0 ? String(at) : hex.slice(1);
};

/**
 * A look as numbers in a fixed order, short enough to sit in an address: "2.0.1.3.5.1".
 * The first six are the old code: skin, hair, hair colour, top, top colour, and the old
 * one-slot extra. A look the old code can't say adds beard, glasses, hat and headphones
 * after it. A colour off the palette is written as its six hex digits.
 */
export function encodeLook(look: Look): string {
  const head = [
    encodeColor(SKINS, look.skin),
    String(HAIRS.indexOf(look.hair)),
    encodeColor(HAIR_COLORS, look.hairColor),
    String(TOPS.indexOf(look.top)),
    encodeColor(TOP_COLORS, look.topColor),
  ];
  const legacy = LEGACY_EXTRAS.findIndex((extras) => (Object.keys(extras) as Extra[]).every((key) => extras[key] === look[key]));
  if (legacy >= 0) return [...head, legacy].join(".");
  return [...head, 0, BEARDS.indexOf(look.beard), GLASSES.indexOf(look.glasses), HATS.indexOf(look.hat), HEADPHONES.indexOf(look.headphones)].join(".");
}

function decodeIndex<T>(list: readonly T[], text: string | undefined): T | undefined {
  if (text === undefined || !/^\d+$/.test(text)) return undefined;
  return list[Number(text)];
}

function decodeColor(palette: readonly Swatch[], text: string | undefined): Hex | undefined {
  if (text === undefined) return undefined;
  if (text.length === 6) return hexColor(text) ?? undefined;
  return decodeIndex(palette, text)?.hex;
}

/** Reads a look code back, old or new. A part that is missing or out of range falls back to `fallback`'s. */
export function decodeLook(code: string | null | undefined, fallback: Look): Look {
  const parts = (code ?? "").split(".");
  const extras = decodeIndex(LEGACY_EXTRAS, parts[5]);
  return {
    skin: decodeColor(SKINS, parts[0]) ?? fallback.skin,
    hair: decodeIndex(HAIRS, parts[1]) ?? fallback.hair,
    hairColor: decodeColor(HAIR_COLORS, parts[2]) ?? fallback.hairColor,
    top: decodeIndex(TOPS, parts[3]) ?? fallback.top,
    topColor: decodeColor(TOP_COLORS, parts[4]) ?? fallback.topColor,
    beard: decodeIndex(BEARDS, parts[6]) ?? extras?.beard ?? fallback.beard,
    glasses: decodeIndex(GLASSES, parts[7]) ?? extras?.glasses ?? fallback.glasses,
    hat: decodeIndex(HATS, parts[8]) ?? extras?.hat ?? fallback.hat,
    headphones: decodeIndex(HEADPHONES, parts[9]) ?? extras?.headphones ?? fallback.headphones,
  };
}

const INK = "#1b1d21";
/** The band worn by someone who starred Stard. */
export const GOLD = "#d4a017";
const GOLD_SHINE = "#f5d76e";

export type Character = { name: string; klass: ClassId; look: Look; motto: string };

/** A figure as it stands on the board: the look, and the gold band when the person starred Stard. */
export type Wearer = { look: Look; supporter: boolean };

export const MAX_NAME = 24;
export const MAX_MOTTO = 70;

export function isClass(value: string | null | undefined): value is ClassId {
  return (CLASS_IDS as readonly string[]).includes(value ?? "");
}

export function defaultCharacter(login: string): Character {
  return { name: login, klass: "rookie", look: defaultLook(login), motto: "" };
}

/** The values a trainer card's address carries, checked and trimmed. */
export function characterFrom(params: URLSearchParams, login: string): Character {
  const klass = params.get("class");
  return {
    name: (params.get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME) || login,
    klass: isClass(klass) ? klass : "rookie",
    look: decodeLook(params.get("look"), defaultLook(login)),
    motto: (params.get("motto") ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_MOTTO),
  };
}

/** The character in a profile README: whatever its trainer card's address says. Null without a card. */
export function characterIn(readme: string, login: string): Character | null {
  const card = /\/api\/card\/trainer\.svg\?([^\s)"'<>]+)/.exec(readme);
  return card ? characterFrom(new URLSearchParams(card[1].replace(/&amp;/g, "&")), login) : null;
}

/** Where a player's character can be written down, as read from GitHub. */
export type CharacterSources = {
  /** `character.md` in the player's own `stard` repo. */
  ownFile: string | null;
  /** The `stard` README and the profile README, in that order. */
  readme: string;
  /** `characters/<login>.md` in this repo. */
  listedFile: string | null;
};

/**
 * A player's character from the first place that has one: their own `character.md`,
 * then a trainer card in their README, then the file kept for them here. Null when
 * none has one, and the look made from the username stands.
 */
export function chosenCharacter(sources: CharacterSources, login: string): Character | null {
  if (sources.ownFile !== null) return characterFromFile(sources.ownFile, login);
  const card = characterIn(sources.readme, login);
  if (card) return card;
  return sources.listedFile !== null ? characterFromFile(sources.listedFile, login) : null;
}

/** The path of the character file kept in this repo for a login. */
export const listedCharacterPath = (login: string) => `characters/${login.toLowerCase()}.md`;

/** The query of a trainer card's address for this character. */
export function characterParams(login: string, character: Character): Record<string, string> {
  return {
    user: login,
    ...(character.name && character.name !== login ? { name: character.name } : {}),
    class: character.klass,
    look: encodeLook(character.look),
    ...(character.motto ? { motto: character.motto } : {}),
  };
}

/** What a character file sets. A key it leaves out is left to the look made from the username. */
export type CharacterFile = { name?: string; klass?: ClassId; motto?: string; look: Partial<Look> };

const plain = (value: string) => value.trim().toLowerCase().replace(/[\s_]+/g, "-");
const oneOf = <T extends string>(list: readonly T[], value: string): T | undefined => list.find((id) => id === plain(value));
const colorIn = (palette: readonly Swatch[], value: string): Hex | undefined => {
  const name = plain(value) === "gray" ? "grey" : plain(value);
  return palette.find((swatch) => swatch.name === name)?.hex ?? hexColor(value) ?? undefined;
};

type FileKey = (file: CharacterFile, value: string) => void;
const setLook = <K extends keyof Look>(key: K, read: (value: string) => Look[K] | undefined): FileKey => (file, value) => {
  const found = read(value);
  if (found !== undefined) file.look[key] = found;
};

// Every key a character file may hold. Anything else on a line is ignored.
const FILE_KEYS: Record<string, FileKey> = {
  name: (file, value) => { file.name = value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) || undefined; },
  class: (file, value) => { const klass = plain(value); if (isClass(klass)) file.klass = klass; },
  motto: (file, value) => { file.motto = value.replace(/\s+/g, " ").trim().slice(0, MAX_MOTTO); },
  skin: setLook("skin", (value) => colorIn(SKINS, value)),
  hair: setLook("hair", (value) => oneOf(HAIRS, value)),
  "hair-color": setLook("hairColor", (value) => colorIn(HAIR_COLORS, value)),
  "hair-colour": setLook("hairColor", (value) => colorIn(HAIR_COLORS, value)),
  top: setLook("top", (value) => oneOf(TOPS, value)),
  "top-color": setLook("topColor", (value) => colorIn(TOP_COLORS, value)),
  "top-colour": setLook("topColor", (value) => colorIn(TOP_COLORS, value)),
  beard: setLook("beard", (value) => oneOf(BEARDS, plain(value) === "mustache" ? "moustache" : value)),
  glasses: setLook("glasses", (value) => oneOf(GLASSES, value)),
  hat: setLook("hat", (value) => oneOf(HATS, value)),
  headphones: setLook("headphones", (value) => oneOf(HEADPHONES, value)),
};

const FILE_LINE = /^\s*(?:[-*]\s+)?([a-z-]+)\s*:\s*`?(.*?)`?\s*$/i;

/** Reads `key: value` lines. Unknown keys and values are skipped, never an error. */
export function readCharacterFile(text: string): CharacterFile {
  const file: CharacterFile = { look: {} };
  for (const line of text.split(/\r?\n/)) {
    const found = FILE_LINE.exec(line);
    if (found) FILE_KEYS[found[1].toLowerCase()]?.(file, found[2]);
  }
  return file;
}

/**
 * The character a file describes. What it leaves out comes from the username's look,
 * except glasses, beard, hat and headphones: a file without them means none.
 */
export function characterFromFile(text: string, login: string): Character {
  const file = readCharacterFile(text);
  const base = defaultCharacter(login);
  return { name: file.name ?? base.name, klass: file.klass ?? base.klass, motto: file.motto ?? "", look: { ...withoutExtras(base.look), ...file.look } };
}

export function shade(color: string, by: number): string {
  const n = parseInt(color.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * by)));
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, "0")}`;
}

/**
 * The figure, as SVG shapes for a 120 by 170 box: flat colour, no outlines, the same
 * plain style as the cards. The caller wraps it in an <svg> or a <g>.
 */
export function figureSvg(look: Look, supporter = false): string {
  const skin = look.skin;
  const skinDark = shade(skin, 0.86);
  const hair = look.hairColor;
  const top = look.topColor;
  const topDark = shade(top, 0.78);
  const topLight = shade(top, 1.18);
  const hatColor = shade(top, 0.7);
  const sleeves = look.top === "tee" ? skin : top;
  const out: string[] = [];

  out.push(`<ellipse cx="60" cy="162" rx="34" ry="6" fill="#000" fill-opacity="0.28"/>`);
  // Legs and shoes.
  out.push(`<rect x="44" y="110" width="14" height="46" rx="6" fill="#2b303b"/><rect x="62" y="110" width="14" height="46" rx="6" fill="#2b303b"/>`);
  out.push(`<rect x="39" y="150" width="21" height="11" rx="5.5" fill="#14171a"/><rect x="60" y="150" width="21" height="11" rx="5.5" fill="#14171a"/>`);
  // Long hair and a hood sit behind the head and shoulders.
  if (look.hair === "long") out.push(`<rect x="31" y="20" width="58" height="66" rx="22" fill="${hair}"/>`);
  if (look.hair === "medium") out.push(`<rect x="33" y="20" width="54" height="46" rx="20" fill="${hair}"/>`);
  if (look.top === "hoodie") out.push(`<ellipse cx="60" cy="52" rx="31" ry="30" fill="${topDark}"/>`);
  // Arms, then hands. A supporter's arms get an edge, so the band has an arm to wrap even
  // when the top is the colour of the panel behind it.
  const armEdge = supporter ? ` stroke="${shade(top, 0.6)}" stroke-width="1.6"` : "";
  out.push(`<rect x="23" y="70" width="15" height="46" rx="7.5" fill="${top}"${armEdge}/><rect x="82" y="70" width="15" height="46" rx="7.5" fill="${top}"${armEdge}/>`);
  if (look.top === "tee") out.push(`<rect x="23" y="90" width="15" height="26" rx="7.5" fill="${sleeves}"/><rect x="82" y="90" width="15" height="26" rx="7.5" fill="${sleeves}"/>`);
  out.push(`<circle cx="30.5" cy="118" r="6.5" fill="${skin}"/><circle cx="89.5" cy="118" r="6.5" fill="${skin}"/>`);
  // Someone who starred Stard wears a gold band on each upper arm, as the 3D figure does:
  // curved edges and a dark underside, 1 past each side of the arm, so it reads as wrapping it.
  if (supporter) for (const x of [23, 82]) out.push(bandAround(x - 1, x + 16));
  // Torso.
  out.push(`<rect x="36" y="66" width="48" height="54" rx="13" fill="${top}"/>`);
  if (look.top === "hoodie") {
    out.push(`<rect x="46" y="98" width="28" height="14" rx="6" fill="${topDark}"/>`);
    out.push(`<rect x="53" y="70" width="2.5" height="16" rx="1.2" fill="#fff" fill-opacity="0.8"/><rect x="64.5" y="70" width="2.5" height="16" rx="1.2" fill="#fff" fill-opacity="0.8"/>`);
  } else if (look.top === "jacket") {
    out.push(`<rect x="53" y="66" width="14" height="54" fill="#f2f0eb"/>`);
    out.push(`<polygon points="53,66 44,66 53,84" fill="${topDark}"/><polygon points="67,66 76,66 67,84" fill="${topDark}"/>`);
  } else if (look.top === "sweater") {
    out.push(`<rect x="36" y="82" width="48" height="6" fill="${topLight}"/><rect x="36" y="96" width="48" height="6" fill="${topDark}"/>`);
  } else if (look.top === "shirt") {
    out.push(`<rect x="59" y="70" width="2" height="48" fill="${topDark}"/>`);
    out.push([78, 90, 102].map((y) => `<circle cx="60" cy="${y}" r="1.6" fill="${topLight}"/>`).join(""));
    out.push(`<polygon points="49,64 60,68 53,77" fill="${topLight}"/><polygon points="71,64 60,68 67,77" fill="${topLight}"/>`);
  }
  // Neck and head.
  out.push(`<rect x="53" y="54" width="14" height="16" rx="5" fill="${skinDark}"/>`);
  out.push(`<circle cx="38" cy="42" r="5.5" fill="${skinDark}"/><circle cx="82" cy="42" r="5.5" fill="${skinDark}"/>`);
  out.push(`<rect x="38" y="18" width="44" height="46" rx="18" fill="${skin}"/>`);
  const jaw = `M41 44 Q41 66 60 66 Q79 66 79 44 Q78 54 68 55 Q60 49 52 55 Q42 54 41 44 Z`;
  if (look.beard === "full") out.push(`<path d="${jaw}" fill="${hair}"/>`);
  if (look.beard === "stubble") out.push(`<path d="${jaw}" fill="${hair}" fill-opacity="0.35"/>`);
  if (look.beard === "goatee") out.push(`<path d="M53 57 Q60 59 67 57 Q66 67 60 67 Q54 67 53 57 Z" fill="${hair}"/>`);
  // Face.
  out.push(`<ellipse cx="51" cy="42" rx="3" ry="4" fill="${INK}"/><ellipse cx="69" cy="42" rx="3" ry="4" fill="${INK}"/>`);
  out.push(`<path d="M54 53.5 Q60 58 66 53.5" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`);
  if (look.beard === "moustache" || look.beard === "goatee") out.push(`<path d="M51 52 Q55 46.5 60 49.5 Q65 46.5 69 52 Q65 50.5 60 52 Q55 50.5 51 52 Z" fill="${hair}"/>`);
  // Hair on top of the head. A hat covers it.
  if (look.hat === "none") out.push(hairTop(look.hair, hair));
  if (look.hat === "cap") out.push(`<path d="M37 33 Q37 11 60 11 Q83 11 83 33 Z" fill="${hatColor}"/><rect x="36" y="28" width="56" height="7" rx="3.5" fill="${shade(top, 0.5)}"/>`);
  if (look.hat === "beanie") out.push(`<path d="M37 34 Q37 8 60 8 Q83 8 83 34 Z" fill="${hatColor}"/><rect x="35" y="27" width="50" height="10" rx="4" fill="${shade(top, 0.55)}"/>`);
  if (look.glasses === "round") {
    out.push(`<circle cx="50.5" cy="41.5" r="7" fill="#fff" fill-opacity="0.3" stroke="${INK}" stroke-width="2"/><circle cx="69.5" cy="41.5" r="7" fill="#fff" fill-opacity="0.3" stroke="${INK}" stroke-width="2"/><rect x="57" y="40" width="6" height="2" fill="${INK}"/>`);
  }
  if (look.glasses === "square") {
    out.push(`<rect x="43.5" y="35.5" width="14" height="12" rx="1.5" fill="#fff" fill-opacity="0.3" stroke="${INK}" stroke-width="2"/><rect x="62.5" y="35.5" width="14" height="12" rx="1.5" fill="#fff" fill-opacity="0.3" stroke="${INK}" stroke-width="2"/><rect x="57" y="40" width="6" height="2" fill="${INK}"/>`);
  }
  if (look.glasses === "shades") {
    out.push(`<rect x="42.5" y="36" width="15.5" height="10" rx="3" fill="${INK}"/><rect x="62" y="36" width="15.5" height="10" rx="3" fill="${INK}"/><rect x="57" y="38" width="6" height="2" fill="${INK}"/>`);
  }
  if (look.headphones === "yes") {
    out.push(`<path d="M35 42 Q35 8 60 8 Q85 8 85 42" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/><rect x="29" y="34" width="11" height="18" rx="5" fill="${topLight}"/><rect x="80" y="34" width="11" height="18" rx="5" fill="${topLight}"/>`);
  }
  return out.join("");
}

const CROWN = `M38 40 V32 Q38 15 60 15 Q82 15 82 32 V40 Q74 27 60 27 Q46 27 38 40 Z`;

function hairTop(style: Hair, hair: Hex): string {
  switch (style) {
    case "short":
    case "long":
      return `<path d="${CROWN}" fill="${hair}"/>`;
    case "medium":
      return `<path d="M37 48 V32 Q37 14 60 14 Q83 14 83 32 V48 Q80 30 60 27 Q40 30 37 48 Z" fill="${hair}"/>`;
    case "side-part":
      return `<path d="M38 42 V32 Q38 13 62 13 Q85 13 82 36 V42 Q80 29 66 25 Q52 34 38 42 Z" fill="${hair}"/>`;
    case "bun":
      return `<circle cx="60" cy="11" r="10" fill="${hair}"/><path d="${CROWN}" fill="${hair}"/>`;
    case "curly":
      return [[42, 25, 10], [54, 17, 11], [67, 17, 11], [79, 25, 10], [37, 36, 7.5], [83, 36, 7.5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${hair}"/>`).join("");
    case "buzz":
      return `<path d="M39 36 V32 Q39 17 60 17 Q81 17 81 32 V36 Q72 23 60 23 Q48 23 39 36 Z" fill="${hair}" fill-opacity="0.8"/>`;
    case "mohawk":
      return `<rect x="54" y="5" width="12" height="26" rx="6" fill="${hair}"/>`;
    case "bald":
      return "";
  }
}

/** The band around an arm from `left` to `right`, on the upper arm of the 120 by 170 figure. */
function bandAround(left: number, right: number): string {
  const middle = (left + right) / 2;
  const front = `<path d="M${left} 80.5 Q${middle} 83 ${right} 80.5 L${right} 86 Q${middle} 88.5 ${left} 86 Z" fill="${GOLD}"/>`;
  const underside = `<path d="M${left} 86 Q${middle} 88.5 ${right} 86 L${right} 87 Q${middle} 89.5 ${left} 87 Z" fill="${shade(GOLD, 0.62)}"/>`;
  const shine = `<path d="M${left + 1} 81.6 Q${middle} 84 ${right - 1} 81.6" fill="none" stroke="${GOLD_SHINE}" stroke-width="1.2"/>`;
  return front + underside + shine;
}

/** The figure as a whole image, for an <img> or a background. */
export function figureImage(look: Look, supporter = false): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 170">${figureSvg(look, supporter)}</svg>`;
}

/** A character's level, from what GitHub knows about the person: followers and stars on their own repos. */
export function characterLevel(followers: number, ownStars: number): number {
  return Math.max(1, Math.min(100, Math.round(Math.log10(followers + ownStars + 1) * 20)));
}
