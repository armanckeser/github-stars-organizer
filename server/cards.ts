// The SVG cards a profile README embeds: a person's top four repos, a review of
// one repo, and a List. Pure: repos in, SVG text out. The demo's Worker fetches the
// repos and serves the result (worker/src/index.ts).
//
// One rule for the look: every repo is a flat-colour poster set in type, and the
// colour is the repo's language. An SVG shown through <img> can't load fonts or
// outside images, so text uses the system font and avatars arrive as data URIs.

import { CLASSES, figureSvg, type Character } from "./character.ts";

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
  const w = ((INNER - middle) / 2 - gap * 3) / 4;
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
    for (let i = 0; i < 4; i++) {
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
