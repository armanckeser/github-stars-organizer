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

// What a figure is made of. Each part is an index into its list below.
export type Look = { skin: number; hair: number; hairColor: number; top: number; topColor: number; extra: number };

export const LOOK_PARTS = {
  skin: ["Light", "Fair", "Tan", "Brown", "Deep"],
  hair: ["Short", "Side part", "Long", "Bun", "Curly", "Buzz"],
  hairColor: ["Black", "Brown", "Blonde", "Red", "Grey", "Blue"],
  top: ["Tee", "Hoodie", "Jacket", "Sweater"],
  topColor: ["Green", "Blue", "Purple", "Red", "Orange", "Yellow", "Charcoal", "White"],
  extra: ["None", "Glasses", "Headphones", "Cap", "Beard"],
} as const satisfies Record<keyof Look, readonly string[]>;

const LOOK_KEYS = ["skin", "hair", "hairColor", "top", "topColor", "extra"] as const;

export const SKIN = ["#f6d7c0", "#ecc09c", "#d39a6c", "#a56c43", "#6b4429"];
export const HAIR = ["#1d1b1a", "#5a3a22", "#d9b25f", "#b4472b", "#9aa0a6", "#3f6fd8"];
export const TOP = ["#1fa866", "#1f8fe0", "#7c5cd6", "#d9482b", "#e07a1f", "#e0b21f", "#3a4049", "#eceae4"];
const INK = "#1b1d21";

export type Character = { name: string; klass: ClassId; look: Look; motto: string };

export const MAX_NAME = 24;
export const MAX_MOTTO = 70;

export function isClass(value: string | null | undefined): value is ClassId {
  return (CLASS_IDS as readonly string[]).includes(value ?? "");
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The figure someone has before they build one: always the same for the same username. */
export function defaultLook(login: string): Look {
  let h = hash(login.toLowerCase());
  const look = {} as Look;
  for (const key of LOOK_KEYS) {
    look[key] = h % LOOK_PARTS[key].length;
    h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
  }
  return look;
}

/** A look as six digits in a fixed order, short enough to sit in an address: "2.0.1.3.5.1". */
export function encodeLook(look: Look): string {
  return LOOK_KEYS.map((key) => look[key]).join(".");
}

/** Reads a look back. A part that is missing or out of range falls back to `fallback`'s. */
export function decodeLook(code: string | null | undefined, fallback: Look): Look {
  const parts = (code ?? "").split(".");
  const look = { ...fallback };
  LOOK_KEYS.forEach((key, i) => {
    const value = Number(parts[i]);
    if (parts[i] !== undefined && parts[i] !== "" && Number.isInteger(value) && value >= 0 && value < LOOK_PARTS[key].length) look[key] = value;
  });
  return look;
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

function shade(color: string, by: number): string {
  const n = parseInt(color.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * by)));
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, "0")}`;
}

/**
 * The figure, as SVG shapes for a 120 by 170 box: flat colour, no outlines, the same
 * plain style as the cards. The caller wraps it in an <svg> or a <g>.
 */
export function figureSvg(look: Look): string {
  const skin = SKIN[look.skin] ?? SKIN[0];
  const skinDark = shade(skin, 0.86);
  const hair = HAIR[look.hairColor] ?? HAIR[0];
  const top = TOP[look.topColor] ?? TOP[0];
  const topDark = shade(top, 0.78);
  const topLight = shade(top, 1.18);
  const style = LOOK_PARTS.top[look.top];
  const hairStyle = LOOK_PARTS.hair[look.hair];
  const extra = LOOK_PARTS.extra[look.extra];
  const sleeves = style === "Tee" ? skin : top;
  const out: string[] = [];

  out.push(`<ellipse cx="60" cy="162" rx="34" ry="6" fill="#000" fill-opacity="0.28"/>`);
  // Legs and shoes.
  out.push(`<rect x="44" y="110" width="14" height="46" rx="6" fill="#2b303b"/><rect x="62" y="110" width="14" height="46" rx="6" fill="#2b303b"/>`);
  out.push(`<rect x="39" y="150" width="21" height="11" rx="5.5" fill="#14171a"/><rect x="60" y="150" width="21" height="11" rx="5.5" fill="#14171a"/>`);
  // Long hair and a hood sit behind the head and shoulders.
  if (hairStyle === "Long") out.push(`<rect x="31" y="20" width="58" height="66" rx="22" fill="${hair}"/>`);
  if (style === "Hoodie") out.push(`<ellipse cx="60" cy="52" rx="31" ry="30" fill="${topDark}"/>`);
  // Arms, then hands.
  out.push(`<rect x="23" y="70" width="15" height="46" rx="7.5" fill="${top}"/><rect x="82" y="70" width="15" height="46" rx="7.5" fill="${top}"/>`);
  if (style === "Tee") out.push(`<rect x="23" y="90" width="15" height="26" rx="7.5" fill="${sleeves}"/><rect x="82" y="90" width="15" height="26" rx="7.5" fill="${sleeves}"/>`);
  out.push(`<circle cx="30.5" cy="118" r="6.5" fill="${skin}"/><circle cx="89.5" cy="118" r="6.5" fill="${skin}"/>`);
  // Torso.
  out.push(`<rect x="36" y="66" width="48" height="54" rx="13" fill="${top}"/>`);
  if (style === "Hoodie") {
    out.push(`<rect x="46" y="98" width="28" height="14" rx="6" fill="${topDark}"/>`);
    out.push(`<rect x="53" y="70" width="2.5" height="16" rx="1.2" fill="#fff" fill-opacity="0.8"/><rect x="64.5" y="70" width="2.5" height="16" rx="1.2" fill="#fff" fill-opacity="0.8"/>`);
  } else if (style === "Jacket") {
    out.push(`<rect x="53" y="66" width="14" height="54" fill="#f2f0eb"/>`);
    out.push(`<polygon points="53,66 44,66 53,84" fill="${topDark}"/><polygon points="67,66 76,66 67,84" fill="${topDark}"/>`);
  } else if (style === "Sweater") {
    out.push(`<rect x="36" y="82" width="48" height="6" fill="${topLight}"/><rect x="36" y="96" width="48" height="6" fill="${topDark}"/>`);
  }
  // Neck and head.
  out.push(`<rect x="53" y="54" width="14" height="16" rx="5" fill="${skinDark}"/>`);
  out.push(`<circle cx="38" cy="42" r="5.5" fill="${skinDark}"/><circle cx="82" cy="42" r="5.5" fill="${skinDark}"/>`);
  out.push(`<rect x="38" y="18" width="44" height="46" rx="18" fill="${skin}"/>`);
  if (extra === "Beard") out.push(`<path d="M41 44 Q41 66 60 66 Q79 66 79 44 Q78 54 68 55 Q60 49 52 55 Q42 54 41 44 Z" fill="${hair}"/>`);
  // Face.
  out.push(`<ellipse cx="51" cy="42" rx="3" ry="4" fill="${INK}"/><ellipse cx="69" cy="42" rx="3" ry="4" fill="${INK}"/>`);
  out.push(`<path d="M54 53.5 Q60 58 66 53.5" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`);
  // Hair on top of the head. A cap covers it.
  if (extra !== "Cap") {
    if (hairStyle === "Short" || hairStyle === "Long") out.push(`<path d="M38 40 V32 Q38 15 60 15 Q82 15 82 32 V40 Q74 27 60 27 Q46 27 38 40 Z" fill="${hair}"/>`);
    if (hairStyle === "Side part") out.push(`<path d="M38 42 V32 Q38 13 62 13 Q85 13 82 36 V42 Q80 29 66 25 Q52 34 38 42 Z" fill="${hair}"/>`);
    if (hairStyle === "Bun") out.push(`<circle cx="60" cy="11" r="10" fill="${hair}"/><path d="M38 40 V32 Q38 15 60 15 Q82 15 82 32 V40 Q74 27 60 27 Q46 27 38 40 Z" fill="${hair}"/>`);
    if (hairStyle === "Curly") out.push([[42, 25, 10], [54, 17, 11], [67, 17, 11], [79, 25, 10], [37, 36, 7.5], [83, 36, 7.5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${hair}"/>`).join(""));
    if (hairStyle === "Buzz") out.push(`<path d="M39 36 V32 Q39 17 60 17 Q81 17 81 32 V36 Q72 23 60 23 Q48 23 39 36 Z" fill="${hair}" fill-opacity="0.8"/>`);
  } else {
    out.push(`<path d="M37 33 Q37 11 60 11 Q83 11 83 33 Z" fill="${topDark}"/><rect x="36" y="28" width="56" height="7" rx="3.5" fill="${shade(top, 0.6)}"/>`);
  }
  if (extra === "Glasses") {
    out.push(`<rect x="43.5" y="35.5" width="14" height="12" rx="4.5" fill="#fff" fill-opacity="0.3" stroke="${INK}" stroke-width="2"/><rect x="62.5" y="35.5" width="14" height="12" rx="4.5" fill="#fff" fill-opacity="0.3" stroke="${INK}" stroke-width="2"/><rect x="57" y="40" width="6" height="2" fill="${INK}"/>`);
  }
  if (extra === "Headphones") {
    out.push(`<path d="M35 42 Q35 8 60 8 Q85 8 85 42" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/><rect x="29" y="34" width="11" height="18" rx="5" fill="${topLight}"/><rect x="80" y="34" width="11" height="18" rx="5" fill="${topLight}"/>`);
  }
  return out.join("");
}

/** The figure as a whole image, for an <img> or a background. */
export function figureImage(look: Look): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 170">${figureSvg(look)}</svg>`;
}

/** A character's level, from what GitHub knows about the person: followers and stars on their own repos. */
export function characterLevel(followers: number, ownStars: number): number {
  return Math.max(1, Math.min(100, Math.round(Math.log10(followers + ownStars + 1) * 20)));
}
