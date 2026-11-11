// A card's art: the first picture in the repo's README that shows the project (a
// screenshot or a logo), drawn small as a PNG. Badges, counters, avatars, tiny icons
// and heavy files are passed over. The Worker fetches and redraws the picture, so a
// visitor's browser only ever talks to the Worker, never to the README's image hosts.

export type Draw = (svg: string, width: number) => Promise<Uint8Array>;

/** The longer side of the art, in pixels: the app's card, and a poster in a README card. */
export const APP_ART = 480;
export const POSTER_ART = 256;

// Pictures from these services are badges, counters, charts or people, never the project.
const NOT_ART_HOSTS = [
  "shields.io", "badgen.net", "badge.fury.io", "forthebadge.com", "badgesize.io",
  "codecov.io", "coveralls.io", "travis-ci.org", "travis-ci.com", "circleci.com", "app.netlify.com", "api.netlify.com",
  "sonarcloud.io", "snyk.io", "codacy.com", "codeclimate.com", "deepsource.io", "bestpractices.dev", "securityscorecards.dev",
  "gitter.im", "opencollective.com", "star-history.com", "contrib.rocks", "repobeats.axiom.co", "komarev.com",
  "github-readme-stats.vercel.app", "readme-typing-svg.demolab.com", "visitor-badge.laobi.icu", "hits.seeyoufarm.com",
  "pepy.tech", "buymeacoffee.com", "ko-fi.com", "avatars.githubusercontent.com",
];
// A "badge" anywhere in the address (GitHub Actions' badge.svg, GitLab's /badges/), or a Stard card.
const NOT_ART_PATH = /badge|\/api\/card\//i;

const MIN_SIDE = 64;
// Wider than 4:1 is a badge or a strip of text; it would be a sliver on a card.
const MAX_STRETCH = 4;
const MAX_BYTES = 3_000_000;
// A GIF that large is a screen recording; its first frame is rarely the best picture.
const MAX_GIF_BYTES = 1_000_000;
const MAX_TRIES = 3;

type Place = { readme: string; root: string };
type Picture = { format: "png" | "jpeg" | "gif" | "svg"; width: number; height: number; bytes: Uint8Array };

const MIME = { png: "image/png", jpeg: "image/jpeg", gif: "image/gif" } as const;

async function readmeOf(fullName: string, token: string): Promise<{ text: string; place: Place } | null> {
  const response = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
    headers: { Authorization: `bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "stars-demo-lists" },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for the README of ${fullName}`);
  const body = (await response.json()) as { content: string; path: string; download_url: string | null };
  const binary = atob(body.content.replace(/\s/g, ""));
  const text = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  const readme = body.download_url ?? `https://raw.githubusercontent.com/${fullName}/HEAD/${body.path}`;
  return { text, place: { readme, root: readme.slice(0, readme.length - body.path.length) } };
}

function attribute(tag: string, name: string): string | null {
  return new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(1).find((v) => v !== undefined) ?? null;
}

// Width or height written on an <img> in pixels; a percentage says nothing about size.
function declaredSide(tag: string): number | null {
  const sides = ["width", "height"].flatMap((name) => {
    const value = attribute(tag, name);
    return value && /^\d+(px)?$/.test(value) ? [Number.parseInt(value, 10)] : [];
  });
  return sides.length > 0 ? Math.min(...sides) : null;
}

function resolve(src: string, place: Place): URL | null {
  const address = src.replace(/&amp;/g, "&");
  try {
    // A path from the root of the repo, the way GitHub reads one in a README.
    const url = address.startsWith("/") && !address.startsWith("//") ? new URL(address.slice(1), place.root) : new URL(address, place.readme);
    if (url.protocol !== "https:") return null;
    if (url.hostname === "github.com") url.pathname = url.pathname.replace(/^(\/[^/]+\/[^/]+)\/blob\//, "$1/raw/");
    return url;
  } catch {
    return null;
  }
}

/** Every picture in the README in reading order, minus the ones known not to be art before fetching. */
function candidates(text: string, place: Place): string[] {
  // Code and comments are not shown on GitHub, so their pictures aren't either.
  const shown = text.replace(/<!--[\s\S]*?-->/g, "").replace(/^(```|~~~)[\s\S]*?^\1/gm, "");
  const found: string[] = [];
  for (const match of shown.matchAll(/!\[[^\]]*\]\(\s*<?([^\s)>]+)>?[^)]*\)|<img\b[^>]*>/gi)) {
    const src = match[1] ?? attribute(match[0], "src");
    const url = src ? resolve(src, place) : null;
    if (!url) continue;
    const host = url.hostname.toLowerCase();
    const badgeService = NOT_ART_HOSTS.some((name) => host === name || host.endsWith(`.${name}`));
    const declared = match[1] ? null : declaredSide(match[0]);
    const declaredTiny = declared !== null && declared < MIN_SIDE;
    if (badgeService || NOT_ART_PATH.test(url.pathname) || declaredTiny) continue;
    if (!found.includes(url.href)) found.push(url.href);
  }
  return found;
}

// Stops reading once a file passes the limit, so a 50 MB GIF costs no more than 3 MB.
async function readCapped(response: Response, max: number): Promise<Uint8Array | null> {
  if (Number(response.headers.get("Content-Length") ?? 0) > max || !response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    const startOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (startOfFrame) return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function svgSize(text: string): { width: number; height: number } | null {
  const root = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!root) return null;
  const width = Number.parseFloat(attribute(root, "width") ?? "");
  const height = Number.parseFloat(attribute(root, "height") ?? "");
  const pixels = (value: string | null) => value !== null && /^[\d.]+(px)?$/.test(value);
  if (pixels(attribute(root, "width")) && pixels(attribute(root, "height")) && width > 0 && height > 0) return { width, height };
  const box = (attribute(root, "viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  return box.length === 4 && box[2] > 0 && box[3] > 0 ? { width: box[2], height: box[3] } : null;
}

/** The format and size from a file's first bytes. Null for anything else, WebP included: the drawing library can't read WebP. */
function pictureOf(bytes: Uint8Array): Picture | null {
  const starts = (...head: number[]) => head.every((value, i) => bytes[i] === value);
  if (starts(0x89, 0x50, 0x4e, 0x47) && bytes.length > 24) return { format: "png", width: u32be(bytes, 16), height: u32be(bytes, 20), bytes };
  if (starts(0x47, 0x49, 0x46, 0x38) && bytes.length > 10) return { format: "gif", width: u16le(bytes, 6), height: u16le(bytes, 8), bytes };
  if (starts(0xff, 0xd8)) {
    const size = jpegSize(bytes);
    return size && { format: "jpeg", ...size, bytes };
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 2048));
  if (!/<svg[\s>]/i.test(head) || /<html/i.test(head)) return null;
  const size = svgSize(new TextDecoder().decode(bytes));
  return size && { format: "svg", ...size, bytes };
}

// btoa wants a binary string; building one in chunks keeps a large picture off the call stack.
export function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// A photo is never drawn larger than it is; a drawing (SVG) is drawn at full size.
function drawn(picture: Picture, longSide: number, draw: Draw): Promise<Uint8Array> {
  const scale = longSide / Math.max(picture.width, picture.height);
  if (picture.format === "svg") return draw(new TextDecoder().decode(picture.bytes), Math.round(picture.width * scale));
  const width = Math.round(picture.width * Math.min(1, scale));
  const height = Math.round(picture.height * Math.min(1, scale));
  const href = `data:${MIME[picture.format]};base64,${base64(picture.bytes)}`;
  return draw(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="${href}" width="${width}" height="${height}" preserveAspectRatio="none"/></svg>`, width);
}

async function tryPicture(url: string, longSide: number, draw: Draw): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "stars-demo-lists", Accept: "image/*" } });
    if (!response.ok) return null;
    const bytes = await readCapped(response, MAX_BYTES);
    const picture = bytes && pictureOf(bytes);
    if (!picture) return null;
    const short = Math.min(picture.width, picture.height);
    const long = Math.max(picture.width, picture.height);
    const heavyGif = picture.format === "gif" && picture.bytes.length > MAX_GIF_BYTES;
    if (short < MIN_SIDE || long > short * MAX_STRETCH || heavyGif) return null;
    return await drawn(picture, longSide, draw);
  } catch {
    // A host that is down or a file the drawing library rejects: the next picture gets its turn.
    return null;
  }
}

/**
 * The repo's art as a PNG no larger than `longSide`, or null when its README has no
 * picture that fits (the card then shows the creature). Throws when GitHub can't be read.
 */
export async function readmeArt(fullName: string, token: string, draw: Draw, longSide: number): Promise<Uint8Array | null> {
  const readme = await readmeOf(fullName, token);
  if (!readme) return null;
  for (const url of candidates(readme.text, readme.place).slice(0, MAX_TRIES)) {
    const art = await tryPicture(url, longSide, draw);
    if (art) return art;
  }
  return null;
}
