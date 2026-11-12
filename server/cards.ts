// The SVG cards a profile README embeds: a person's top four repos, a review of
// one repo, and a List. Pure: repos in, SVG text out. The demo's Worker fetches the
// repos and serves the result (worker/src/index.ts).
//
// One rule for the look: every repo is a flat-colour poster set in type, and the
// colour is the repo's language. An SVG shown through <img> can't load fonts or
// outside images, so text uses the system font and avatars arrive as data URIs.

import { CLASSES, figureSvg, type Character } from "./character.ts";
import type { CreatureRecipe } from "./creature-recipe.ts";
import { creatureSticker } from "./creature-sticker.ts";
import { setName } from "./run/names.ts";
import { recordOf } from "./run/saved-team.ts";
import { markOf } from "./run/set-glyph.ts";
import { tierColor } from "./run/tiers.ts";

export type CardRepo = {
  fullName: string;
  stars: number;
  language: string | null;
  /** The language's colour on GitHub, as #rrggbb. */
  color: string | null;
  /** The owner's avatar as a data: URI, or null to leave the avatar out. */
  avatar: string | null;
};

export const CARD_WIDTH = 880;
const PAD = 30;
const INNER = CARD_WIDTH - PAD * 2;
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif";

const BG = "#0f1114";
const EDGE = "#262b31";
const TEXT = "#f2f0eb";
const BODY = "#c5cad0";
const MUTED = "#8b949e";
const STAR = "#f5c84b";
const STAR_OFF = "#30363d";
const NO_LANGUAGE = "#3a4049";

// Bold system sans averages a little under 0.6em per character; no font metrics exist here.
const BOLD_CHAR = 0.64;
const REGULAR_CHAR = 0.5;

export function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function compact(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10_000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Dark text on a light poster, light text on a dark one. */
function inkOn(color: string): string {
  const n = parseInt(color.slice(1), 16);
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.6 ? "#14171a" : "#ffffff";
}

function posterColor(repo: CardRepo): string {
  return repo.color && /^#[0-9a-f]{6}$/i.test(repo.color) ? repo.color : NO_LANGUAGE;
}

/**
 * A repo name broken into at most four lines at its hyphens, dots and underscores,
 * so "build-your-own-x" stacks like a film title instead of shrinking to fit one line.
 */
export function nameLines(name: string): string[] {
  const parts = name.match(/[^-_.]+[-_.]*|[-_.]+/g) ?? [name];
  for (let width = 10; ; width += 2) {
    const lines: string[] = [];
    for (const part of parts) {
      const last = lines[lines.length - 1];
      if (last !== undefined && last.length + part.length <= width) lines[lines.length - 1] = last + part;
      else lines.push(part);
    }
    if (lines.length <= 4) return lines;
  }
}

function star(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.42;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(" ");
}

let clipCount = 0;

/** Five stars, `rating` of them filled; a half star is filled on its left side. */
function ratingStars(x: number, y: number, size: number, rating: number): string {
  const r = size / 2;
  const step = size + 3;
  let out = "";
  for (let i = 0; i < 5; i++) {
    const cx = x + r + i * step;
    const points = star(cx, y + r, r);
    const fill = Math.max(0, Math.min(1, rating - i));
    out += `<polygon points="${points}" fill="${fill >= 1 ? STAR : STAR_OFF}"/>`;
    if (fill > 0 && fill < 1) {
      const id = `half${clipCount++}`;
      out += `<clipPath id="${id}"><rect x="${cx - r}" y="${y}" width="${r}" height="${size}"/></clipPath>`;
      out += `<polygon points="${points}" fill="${STAR}" clip-path="url(#${id})"/>`;
    }
  }
  return out;
}

function poster(x: number, y: number, w: number, repo: CardRepo): string {
  const h = w * 1.5;
  const m = w * 0.09;
  const color = posterColor(repo);
  const ink = inkOn(color);
  const [owner, name] = repo.fullName.split("/");
  const lines = nameLines(name ?? repo.fullName);
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.min(w * 0.2, (w - m * 2) / (longest * BOLD_CHAR));
  const lineHeight = size * 1.02;
  const small = Math.max(w * 0.068, 8);
  const nameTop = y + h - m - lineHeight * (lines.length - 1);
  const avatar = w * 0.24;
  const clip = `av${clipCount++}`;

  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${color}"/>`;
  if (repo.avatar) {
    out += `<clipPath id="${clip}"><rect x="${x + m}" y="${y + m}" width="${avatar}" height="${avatar}" rx="${avatar * 0.18}"/></clipPath>`;
    out += `<image href="${escapeXml(repo.avatar)}" x="${x + m}" y="${y + m}" width="${avatar}" height="${avatar}" clip-path="url(#${clip})" preserveAspectRatio="xMidYMid slice"/>`;
  }
  out += `<text x="${x + w - m}" y="${y + m + small}" text-anchor="end" font-size="${small}" font-weight="600" fill="${ink}" fill-opacity="0.8">★ ${compact(repo.stars)}</text>`;
  out += `<text x="${x + m}" y="${nameTop - lineHeight * 0.95}" font-size="${small}" font-weight="600" fill="${ink}" fill-opacity="0.75">${escapeXml(truncate(owner ?? "", 22))}</text>`;
  lines.forEach((line, i) => {
    out += `<text x="${x + m}" y="${nameTop + i * lineHeight}" font-size="${size.toFixed(1)}" font-weight="800" letter-spacing="${(-size * 0.02).toFixed(2)}" fill="${ink}">${escapeXml(line)}</text>`;
  });
  out += `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="5.5" fill="none" stroke="#ffffff" stroke-opacity="0.14"/>`;
  return out;
}

function emptySlot(x: number, y: number, w: number): string {
  return `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${w * 1.5 - 1}" rx="5.5" fill="none" stroke="${EDGE}" stroke-dasharray="5 5"/>`;
}

/** The mark every card carries in its bottom right corner. */
function watermark(height: number): string {
  const y = height - 20;
  return (
    `<polygon points="${star(CARD_WIDTH - PAD - 46, y - 4.5, 6)}" fill="${STAR}"/>` +
    `<text x="${CARD_WIDTH - PAD}" y="${y}" text-anchor="end" font-size="14" font-weight="800" letter-spacing="-0.2" fill="${MUTED}">stard</text>`
  );
}

function label(text: string, y: number): string {
  return (
    `<text x="${PAD}" y="${y}" font-size="12" font-weight="600" letter-spacing="1.8" fill="${MUTED}">${escapeXml(text.toUpperCase())}</text>` +
    `<line x1="${PAD}" y1="${y + 12}" x2="${CARD_WIDTH - PAD}" y2="${y + 12}" stroke="${EDGE}"/>`
  );
}

function card(height: number, title: string, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${height}" viewBox="0 0 ${CARD_WIDTH} ${height}" role="img" aria-label="${escapeXml(title)}" font-family="${FONT}">` +
    `<title>${escapeXml(title)}</title>` +
    `<rect x="0.5" y="0.5" width="${CARD_WIDTH - 1}" height="${height - 1}" rx="12" fill="${BG}" stroke="${EDGE}"/>` +
    body +
    watermark(height) +
    `</svg>`
  );
}

/** Text wrapped to a width given in characters, cut off with an ellipsis after `maxLines`. */
export function wrap(text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const word of text.replace(/\s+/g, " ").trim().split(" ")) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length + 1 + word.length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(truncate(word, width));
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${truncate(kept[maxLines - 1], width - 1).replace(/…$/, "")}…`;
  return kept;
}

/** Four posters in a row under "<login>'s top four", each with the rating its owner gave. */
export function topFourCard(login: string, repos: CardRepo[], ratings: (number | null)[] = []): string {
  const gap = 20;
  const w = (INNER - gap * 3) / 4;
  const top = 76;
  const rated = ratings.some((r) => r !== null && r > 0);
  const height = top + w * 1.5 + (rated ? 34 : 0) + 46;
  let body = label(`${login}’s top four`, 44);
  for (let i = 0; i < 4; i++) {
    const x = PAD + i * (w + gap);
    const repo = repos[i];
    body += repo ? poster(x, top, w, repo) : emptySlot(x, top, w);
    const rating = ratings[i];
    if (repo && rating) body += ratingStars(x, top + w * 1.5 + 14, 15, rating);
  }
  const names = repos.map((r) => r.fullName).join(", ");
  return card(height, `${login}’s top four repos on GitHub: ${names}`, body);
}

/** One repo's poster beside its rating and what its reviewer wrote. */
export function reviewCard(login: string, repo: CardRepo, rating: number | null, text: string): string {
  const w = 120;
  const x = PAD + w + 30;
  const lines = wrap(text, Math.floor((CARD_WIDTH - PAD - x) / (16 * REGULAR_CHAR)), 4);
  let body = poster(PAD, PAD, w, repo);
  body += `<text x="${x}" y="${PAD + 24}" font-size="22" font-weight="700" letter-spacing="-0.3" fill="${TEXT}">${escapeXml(truncate(repo.fullName, 50))}</text>`;
  if (rating) body += ratingStars(x, PAD + 40, 16, rating);
  body += `<text x="${rating ? x + 5 * 19 + 8 : x}" y="${PAD + 53}" font-size="13" fill="${MUTED}">${rating ? "" : "Reviewed "}by ${escapeXml(login)}</text>`;
  lines.forEach((line, i) => {
    body += `<text x="${x}" y="${PAD + 92 + i * 25}" font-size="16" fill="${BODY}">${escapeXml(line)}</text>`;
  });
  const stars = rating ? `, rated ${rating} of 5` : "";
  return card(PAD * 2 + w * 1.5, `${repo.fullName}${stars} by ${login}: ${text}`, body);
}

/** A List's name and size over its first six repos. */
export function listCard(login: string, title: string, count: number, repos: CardRepo[]): string {
  const gap = 16;
  const w = (INNER - gap * 5) / 6;
  const top = 104;
  let body = `<text x="${PAD}" y="56" font-size="26" font-weight="800" letter-spacing="-0.5" fill="${TEXT}">${escapeXml(truncate(title, 52))}</text>`;
  body += `<text x="${PAD}" y="80" font-size="13" fill="${MUTED}">A list by ${escapeXml(login)} · ${count} ${count === 1 ? "repo" : "repos"}</text>`;
  repos.slice(0, 6).forEach((repo, i) => {
    body += poster(PAD + i * (w + gap), top, w, repo);
  });
  return card(top + w * 1.5 + 46, `${title}, a list of ${count} repos by ${login}`, body);
}

export type TrainerFacts = { level: number; since: number | null; followers: number; ownStars: number };

/** A player's character: the figure, the class and its perk, and what GitHub knows about the person. */
export function trainerCard(login: string, character: Character, facts: TrainerFacts): string {
  const klass = CLASSES[character.klass];
  const panel = 180;
  const x = PAD + panel + 28;
  const accent = character.klass === "rookie" ? MUTED : klass.color;
  const stats = [
    facts.since ? `On GitHub since ${facts.since}` : "",
    `${compact(facts.followers)} ${facts.followers === 1 ? "follower" : "followers"}`,
    `${compact(facts.ownStars)} ${facts.ownStars === 1 ? "star" : "stars"} on their repos`,
  ].filter(Boolean).join(" · ");
  let body = `<rect x="${PAD}" y="${PAD}" width="${panel}" height="190" rx="10" fill="${klass.color}"/>`;
  body += `<g transform="translate(${PAD + 27}, ${PAD + 8}) scale(1.05)">${figureSvg(character.look)}</g>`;
  body += `<text x="${x}" y="${PAD + 34}" font-size="30" font-weight="800" letter-spacing="-0.6" fill="${TEXT}">${escapeXml(truncate(character.name, 30))}</text>`;
  body += `<text x="${x}" y="${PAD + 62}" font-size="15" font-weight="700" fill="${accent}">${escapeXml(klass.label)} · Lv ${facts.level}</text>`;
  body += `<text x="${x}" y="${PAD + 86}" font-size="14" fill="${BODY}">${escapeXml(klass.perk)}</text>`;
  if (character.motto) body += `<text x="${x}" y="${PAD + 124}" font-size="17" fill="${TEXT}">“${escapeXml(truncate(character.motto, 66))}”</text>`;
  body += `<text x="${x}" y="${PAD + 160}" font-size="13" fill="${MUTED}">${escapeXml(stats)}</text>`;
  body += `<text x="${x}" y="${PAD + 188}" font-size="12" font-weight="700" letter-spacing="1.8" fill="${STAR}">${escapeXml(`BATTLE ${login.toUpperCase()}`)} →</text>`;
  return card(PAD * 2 + 190, `${character.name}, a level ${facts.level} ${klass.label} on Stard. ${klass.perk}`, body);
}

export type BattleSide = { login: string; team: CardRepo[]; standing: number };

/** How a battle ended: both teams face to face, the knocked-out cards faded. */
export function battleCard(a: BattleSide, b: BattleSide, winner: "a" | "b" | null): string {
  const gap = 10;
  const middle = 60;
  const slots = Math.max(4, a.team.length, b.team.length);
  const w = ((INNER - middle) / 2 - gap * (slots - 1)) / slots;
  const top = 116;
  const won = winner === "a" ? a : winner === "b" ? b : null;
  const lost = winner === "a" ? b : a;
  const headline = won
    ? `${won.login} beat ${lost.login} with ${won.standing} ${won.standing === 1 ? "card" : "cards"} left`
    : `${a.login} and ${b.login} had no cards to play`;
  let body = label(`${a.login} vs ${b.login}`, 44);
  body += `<text x="${PAD}" y="92" font-size="22" font-weight="800" letter-spacing="-0.3" fill="${TEXT}">${escapeXml(truncate(headline, 64))}</text>`;
  [a, b].forEach((side, s) => {
    const left = PAD + s * ((INNER + middle) / 2);
    // Cards fall in team order, so the ones still standing are the last ones.
    const fallen = side.team.length - side.standing;
    for (let i = 0; i < slots; i++) {
      const x = left + i * (w + gap);
      const repo = side.team[i];
      if (!repo) body += emptySlot(x, top, w);
      else body += i < fallen ? `<g opacity="0.28">${poster(x, top, w, repo)}</g>` : poster(x, top, w, repo);
    }
  });
  body += `<text x="${CARD_WIDTH / 2}" y="${top + w * 0.75 + 5}" text-anchor="middle" font-size="14" font-weight="800" letter-spacing="1.5" fill="${MUTED}">VS</text>`;
  return card(top + w * 1.5 + 46, headline, body);
}

/** Shown in place of a card whose address can't be drawn, so a README never holds a broken image. */
export function messageCard(message: string): string {
  return card(96, message, `<text x="${PAD}" y="54" font-size="15" fill="${BODY}">${escapeXml(truncate(message, 90))}</text>`);
}

// The colour of each card type, the same six the app uses.
export const TYPE_COLOR = { systems: "#d9482b", scripts: "#7c5cd6", web: "#1f8fe0", apps: "#1fa866", data: "#d99a0b", docs: "#77818d" } as const;

export type VersusSide = {
  login: string;
  /** The character's name and class, and the class colour the side is tinted with. */
  name: string;
  klass: string;
  tint: string;
  look: Character["look"];
  avatar: string | null;
  team: { name: string; color: string; shiny: boolean }[];
};

const SHARE_WIDTH = 1200;
const SHARE_HEIGHT = 630;

/**
 * Two players face to face before a battle, at the size link previews ask for. Drawn
 * to be turned into a PNG (worker/src/share.ts), so it names one font, the one the
 * Worker carries, in place of the system fonts the other cards use.
 */
export function versusCard(a: VersusSide, b: VersusSide, font: string): string {
  const side = (player: VersusSide, right: boolean): string => {
    // Everything is laid out for the left side; the right side mirrors each x.
    const x = (value: number) => (right ? SHARE_WIDTH - value : value);
    const anchor = right ? "end" : "start";
    const size = Math.min(56, Math.floor(320 / (Math.max(player.login.length, 6) * 0.62)));
    const id = right ? "b" : "a";
    let out = `<g transform="translate(${x(36)},262) scale(${right ? -1 : 1},1)"><svg width="232" height="330" viewBox="0 0 120 170">${figureSvg(player.look)}</svg></g>`;
    out += `<clipPath id="face-${id}"><circle cx="${x(100)}" cy="112" r="46"/></clipPath>`;
    out += `<circle cx="${x(100)}" cy="112" r="50" fill="${player.tint}"/>`;
    if (player.avatar) out += `<image href="${player.avatar}" x="${x(100) - 46}" y="66" width="92" height="92" clip-path="url(#face-${id})" preserveAspectRatio="xMidYMid slice"/>`;
    out += `<text x="${x(168)}" y="${112 + size * 0.1}" text-anchor="${anchor}" font-size="${size}" letter-spacing="-1" fill="${TEXT}">${escapeXml(player.login)}</text>`;
    // A character nobody built has the username for a name and no class worth showing.
    const under = [player.klass === "Rookie" ? "" : player.klass, player.name.toLowerCase() === player.login.toLowerCase() ? "" : player.name].filter(Boolean).join(" · ");
    out += `<text x="${x(170)}" y="${152 + size * 0.1}" text-anchor="${anchor}" font-size="24" fill="${BODY}">${escapeXml(truncate(under, 24))}</text>`;
    player.team.slice(0, 4).forEach((card, i) => {
      const top = 262 + i * 80;
      const left = right ? x(548) : 292;
      out += `<rect x="${left}" y="${top}" width="256" height="64" rx="12" fill="#12161c" stroke="${card.shiny ? STAR : EDGE}" stroke-width="2"/>`;
      out += `<rect x="${right ? left + 244 : left}" y="${top}" width="12" height="64" rx="6" fill="${card.color}"/>`;
      out += `<text x="${right ? left + 228 : left + 28}" y="${top + 41}" text-anchor="${anchor}" font-size="25" letter-spacing="-0.3" fill="${TEXT}">${escapeXml(truncate(card.name, 15))}</text>`;
    });
    return out;
  };
  const title = `${a.login} vs ${b.login}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" viewBox="0 0 ${SHARE_WIDTH} ${SHARE_HEIGHT}" role="img" aria-label="${escapeXml(title)}" font-family="${font}" font-weight="700">` +
    `<rect width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="#0b0e12"/>` +
    `<polygon points="0,0 648,0 552,${SHARE_HEIGHT} 0,${SHARE_HEIGHT}" fill="${a.tint}" opacity="0.34"/>` +
    `<polygon points="648,0 ${SHARE_WIDTH},0 ${SHARE_WIDTH},${SHARE_HEIGHT} 552,${SHARE_HEIGHT}" fill="${b.tint}" opacity="0.3"/>` +
    `<line x1="648" y1="0" x2="552" y2="${SHARE_HEIGHT}" stroke="#ffffff" stroke-opacity="0.25" stroke-width="3"/>` +
    side(a, false) +
    side(b, true) +
    `<text x="605" y="165" text-anchor="middle" font-size="128" letter-spacing="-5" fill="${STAR}">VS</text>` +
    `<text x="600" y="160" text-anchor="middle" font-size="128" letter-spacing="-5" fill="#ffffff">VS</text>` +
    `<polygon points="${star(566, 596, 9)}" fill="${STAR}"/>` +
    `<text x="582" y="604" font-size="24" letter-spacing="-0.3" fill="${TEXT}">stard</text>` +
    `</svg>`
  );
}

// The run's share pictures follow the Play screen's rules (docs/GAME-UI.md): one slate
// material with a gold line on the outer edge, the trainer at the left end of a shelf
// of cards, and each card in the shop's anatomy with its tier on the border, the name
// strip's tint and the cost, and nowhere else. A card's art is its creature, drawn flat
// from the same recipe as the 3D one (server/creature-sticker.ts).

const SLATE = "#0e1418";
const WALL = "#131b20";
const HEX = "#24323b";
const TRIM = "#c9a45c";
const COIN = "#f2c94c";
const MARGIN = 64;

/** A card on a share picture. `cost` is 1 to 5 gold; `language` is lower-case, for its set's initials; a blank card has no creature. */
export type ShareCard = { name: string; cost: number; sets: string[]; language: string | null; creature: CreatureRecipe | null };

/** A player on a share picture: who they are, their trainer, and the cards on their shelf. */
export type ShelfPlayer = {
  login: string;
  name: string;
  klass: string;
  look: Character["look"];
  avatar: string | null;
  cards: ShareCard[];
};

/** `color` blended toward `base`, `amount` of the way from base to color: the shop strip's 30% tier tint. */
function blend(color: string, base: string, amount: number): string {
  const channels = (hex: string) => [0, 2, 4].map((at) => parseInt(hex.slice(1 + at, 3 + at), 16));
  const [a, b] = [channels(color), channels(base)];
  return `#${a.map((value, i) => Math.round(b[i] + (value - b[i]) * amount).toString(16).padStart(2, "0")).join("")}`;
}

const HEX_SIZE = 22;
const GLYPH_SIZE = 12;

function hexagon(x: number, y: number, size: number): string {
  const points = [[0.25, 0.04], [0.75, 0.04], [1, 0.5], [0.75, 0.96], [0.25, 0.96], [0, 0.5]];
  return points.map(([px, py]) => `${(x + px * size).toFixed(1)},${(y + py * size).toFixed(1)}`).join(" ");
}

/** A set's mark inside its hex: lucide's icon in white, or the language's initials. */
function setMark(set: string, language: string | null, x: number, y: number): string {
  const mark = markOf(set, language);
  const middle = { x: x + HEX_SIZE / 2, y: y + HEX_SIZE / 2 };
  if (mark.kind === "initials") {
    const size = mark.text.length > 2 ? 7.5 : 9.5;
    return `<text x="${middle.x}" y="${middle.y + size * 0.36}" text-anchor="middle" font-size="${size}" fill="${TEXT}">${escapeXml(mark.text)}</text>`;
  }
  const glyph = mark.kind === "icon" ? GLYPH_SIZE : GLYPH_SIZE - 1;
  const drawing = mark.node.map(([element, attributes]) => `<${element} ${Object.entries(attributes).filter(([name]) => name !== "key").map(([name, value]) => `${name}="${escapeXml(value)}"`).join(" ")}/>`).join("");
  return `<g transform="translate(${middle.x - glyph / 2} ${middle.y - glyph / 2}) scale(${glyph / 24})" fill="none" stroke="${TEXT}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${drawing}</g>`;
}

/** One card in the shop's anatomy (docs/GAME-UI.md §4): art over a tier-tinted name strip, the tier on a 2px border. */
function shelfCard(x: number, y: number, w: number, h: number, card: ShareCard, id: string): string {
  const tier = tierColor(card.cost);
  const strip = Math.round(Math.min(48, Math.max(34, w * 0.22)));
  const art = h - strip;
  const nameSize = Math.round(Math.min(19, Math.max(14, w * 0.1)));
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${WALL}"/>`;
  if (card.creature) {
    // The creature stands over the set lines, not behind them, so neither hides the other.
    const room = art - SET_BAND;
    const size = Math.min(w, room);
    out += `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${art}"/></clipPath>`;
    out += `<g clip-path="url(#${id})">${creatureSticker(card.creature, { x: x + (w - size) / 2, y: y + (room - size) / 2, size })}</g>`;
  }
  // Under 150px a card keeps the hexes and drops the set names, as a phone's shop card does under 120px.
  const named = w >= 150;
  [...new Set(card.sets)].slice(0, 2).reverse().forEach((set, i) => {
    const top = y + art - 12 - (i + 1) * 26;
    out += `<polygon points="${hexagon(x + 10, top, HEX_SIZE)}" fill="${HEX}"/>` + setMark(set, card.language, x + 10, top);
    if (named) out += `<text x="${x + 39}" y="${top + 17}" font-size="17" fill="${TEXT}">${escapeXml(truncate(setName(set), Math.floor((w - 47) / 9.6)))}</text>`;
  });
  out += `<rect x="${x}" y="${y + art}" width="${w}" height="${strip}" fill="${blend(tier, WALL, 0.3)}"/>`;
  const middle = y + art + strip / 2;
  const costWidth = 34;
  out += `<text x="${x + 12}" y="${middle + nameSize * 0.36}" font-size="${nameSize}" letter-spacing="-0.3" fill="${TEXT}">${escapeXml(truncate(card.name, Math.max(4, Math.floor((w - 24 - costWidth) / (nameSize * 0.58)))))}</text>`;
  out += `<circle cx="${x + w - 34}" cy="${middle}" r="8" fill="${COIN}"/>`;
  out += `<text x="${x + w - 12}" y="${middle + 7}" text-anchor="end" font-size="20" fill="${TEXT}">${card.cost}</text>`;
  out += `<rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="3" fill="none" stroke="${tier}" stroke-width="2"/>`;
  return out;
}

// The two set lines at the foot of a card's art, and the gap under them.
const SET_BAND = 2 * 26 + 12;
const SHELF_TOP = 262;
const SHELF_BOTTOM = 590;
// The trainer stands as tall as the shelf used to be, so taller cards don't make them narrower.
const FIGURE_HEIGHT = 250;

/** The player's trainer at the left end of their shelf, and the cards along it, as Play stands them (docs/GAME-UI.md §6). */
function shelf(player: ShelfPlayer): string {
  const height = SHELF_BOTTOM - SHELF_TOP;
  const figureWidth = Math.round((FIGURE_HEIGHT * 120) / 170);
  let out = `<svg x="${MARGIN - 28}" y="${SHELF_BOTTOM - FIGURE_HEIGHT}" width="${figureWidth}" height="${FIGURE_HEIGHT}" viewBox="0 0 120 170">${figureSvg(player.look)}</svg>`;
  const left = MARGIN - 28 + figureWidth + 8;
  const room = SHARE_WIDTH - MARGIN - left;
  const gap = 14;
  const width = Math.min(200, Math.floor((room - gap * (player.cards.length - 1)) / Math.max(1, player.cards.length)));
  player.cards.forEach((card, i) => {
    out += shelfCard(left + i * (width + gap), SHELF_TOP, width, height, card, `art${i}`);
  });
  return out;
}

/** The player's avatar and name in the top left. */
function nameplate(player: ShelfPlayer): string {
  const size = Math.min(44, Math.floor(700 / (Math.max(player.login.length, 6) * 0.62)));
  let out = `<circle cx="${MARGIN + 30}" cy="94" r="30" fill="${WALL}"/>`;
  if (player.avatar) out += `<clipPath id="face"><circle cx="${MARGIN + 30}" cy="94" r="30"/></clipPath><image href="${escapeXml(player.avatar)}" x="${MARGIN}" y="64" width="60" height="60" clip-path="url(#face)" preserveAspectRatio="xMidYMid slice"/>`;
  out += `<text x="${MARGIN + 78}" y="${94 + size * 0.36}" font-size="${size}" letter-spacing="-0.8" fill="${TEXT}">${escapeXml(player.login)}</text>`;
  // A character nobody built has the username for a name and no class worth showing.
  const under = [player.klass === "Rookie" ? "" : player.klass, player.name.toLowerCase() === player.login.toLowerCase() ? "" : player.name].filter(Boolean).join(" · ");
  if (under) out += `<text x="${MARGIN + 78}" y="${94 + size * 0.36 + 32}" font-size="22" fill="${MUTED}">${escapeXml(truncate(under, 40))}</text>`;
  return out;
}

/** The picture's frame: slate, the gold line on its outer edge, and the mark in the top right. */
function sharePicture(label: string, font: string, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" viewBox="0 0 ${SHARE_WIDTH} ${SHARE_HEIGHT}" role="img" aria-label="${escapeXml(label)}" font-family="${font}" font-weight="700">` +
    `<rect width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="${SLATE}"/>` +
    `<rect x="1" y="1" width="${SHARE_WIDTH - 2}" height="${SHARE_HEIGHT - 2}" fill="none" stroke="${TRIM}" stroke-opacity="0.7" stroke-width="2"/>` +
    body +
    `<polygon points="${star(SHARE_WIDTH - MARGIN - 84, 86, 10)}" fill="${STAR}"/>` +
    `<text x="${SHARE_WIDTH - MARGIN}" y="95" text-anchor="end" font-size="26" letter-spacing="-0.3" fill="${TEXT}">stard</text>` +
    `</svg>`
  );
}

/**
 * The picture's title, left-aligned or across the middle. The sentences about the run
 * live in the link preview's description (worker/src/share.ts, worker/src/team.ts), not here.
 */
function headline(title: string, centred: boolean): string {
  const x = centred ? SHARE_WIDTH / 2 : MARGIN;
  return `<text x="${x}" y="${centred ? 200 : 222}" text-anchor="${centred ? "middle" : "start"}" font-size="88" letter-spacing="-2.8" fill="${TEXT}">${escapeXml(title)}</text>`;
}

/**
 * A run's link preview at the size link previews ask for: the player, their trainer
 * and four cards from their stars for the day. With no player the picture is the run
 * itself, a blank card of each cost, for a /run link with nobody in it. Drawn to be
 * turned into a PNG (worker/src/share.ts), like the versus card.
 */
export function runPreviewCard(player: ShelfPlayer | null, font: string): string {
  if (!player) {
    const width = 180;
    const gap = 16;
    const left = (SHARE_WIDTH - (width * 5 + gap * 4)) / 2;
    const blanks = [1, 2, 3, 4, 5].map((cost, i) => shelfCard(left + i * (width + gap), SHELF_TOP, width, SHELF_BOTTOM - SHELF_TOP, { name: "", cost, sets: [], language: null, creature: null }, `art${i}`));
    return sharePicture("Play a run with your GitHub stars", font, headline("Play a run", true) + blanks.join(""));
  }
  const shown = { ...player, cards: player.cards.slice(0, 4) };
  return sharePicture(
    `Play a run with ${player.login}'s stars`,
    font,
    nameplate(shown) + headline("Play a run", false) + shelf(shown),
  );
}

/**
 * A finished run's team at the size link previews ask for: the player, the record as
 * the title, and the team on the shelf as it ended, the way the run's picture stands
 * the player's cards. Drawn to be turned into a PNG (worker/src/team-picture.ts).
 */
export function savedTeamCard(player: ShelfPlayer, wins: number, losses: number, font: string): string {
  const record = recordOf(wins, losses);
  return sharePicture(`${player.login}'s team: ${record}`, font, nameplate(player) + headline(record, false) + shelf(player));
}
