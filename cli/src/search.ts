import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { starredPages, topicsOf, type GitHubClient } from "../../server/github.ts";
import { fetchViewerLists } from "../../server/github-lists.ts";
import { isQuiet } from "../../src/lib/star-waves.ts";

// `npx github-stars-organizer search <words>`: lets a coding agent check the
// user's own stars before it suggests a library or tool. Reads a copy of the
// stars kept on disk, so a search costs no GitHub calls until the copy is a day
// old, and needs no running server.

export const STALE_AFTER_MS = 86_400_000;
const DEFAULT_LIMIT = 10;
const DESCRIPTION_CHARS = 100;

export type IndexedStar = {
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  isArchived: boolean;
  pushedAt: string | null;
  /** When the latest release came out; null when the repo has never released. */
  lastReleaseAt: string | null;
  starredAt: string;
  lists: string[];
};

/** Bumped when the stored fields change, so an older copy is read again from GitHub. */
export const INDEX_VERSION = 2;

export type StarIndex = { version: number; login: string; refreshedAt: string; stars: IndexedStar[] };

export function indexFile(home: string): string {
  return path.join(home, "search-index.json");
}

export async function readIndex(home: string): Promise<StarIndex | null> {
  try {
    return JSON.parse(await readFile(indexFile(home), "utf8")) as StarIndex;
  } catch {
    return null;
  }
}

export function isStale(index: StarIndex | null, now: number): boolean {
  return !index || index.version !== INDEX_VERSION || now - Date.parse(index.refreshedAt) >= STALE_AFTER_MS;
}

/** Every star with the names of the Lists it is in, read fresh from GitHub. */
export async function buildIndex(github: GitHubClient, login: string, now: Date): Promise<StarIndex> {
  const lists = await fetchViewerLists(github.graphql);
  const listsOf = new Map<string, string[]>();
  for (const list of lists) {
    for (const repo of list.repos) listsOf.set(repo.fullName, [...(listsOf.get(repo.fullName) ?? []), list.name]);
  }
  const stars: IndexedStar[] = [];
  for await (const edges of starredPages(github)) {
    for (const { node, starredAt } of edges) {
      stars.push({
        fullName: node.nameWithOwner,
        description: node.description,
        language: node.primaryLanguage?.name ?? null,
        topics: topicsOf(node).split(",").filter(Boolean),
        stars: node.stargazerCount,
        isArchived: node.isArchived ?? false,
        pushedAt: node.pushedAt ?? null,
        lastReleaseAt: node.latestRelease?.publishedAt ?? null,
        starredAt,
        lists: listsOf.get(node.nameWithOwner) ?? [],
      });
    }
  }
  return { version: INDEX_VERSION, login, refreshedAt: now.toISOString(), stars };
}

export async function saveIndex(home: string, index: StarIndex): Promise<void> {
  await mkdir(home, { recursive: true });
  const file = indexFile(home);
  const partial = `${file}.${randomUUID()}.partial`;
  await writeFile(partial, JSON.stringify(index));
  await rename(partial, file);
}

// Words that match nearly every description, so they would only add noise.
const STOP_WORDS = new Set(["a", "an", "and", "app", "for", "from", "in", "into", "my", "of", "on", "or", "the", "to", "tool", "with"]);

function termsOf(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/[\s,]+/).filter((term) => term.length > 1 && !STOP_WORDS.has(term)))];
}

/**
 * Stars matching any of the words, best first. A word in the repo name counts
 * most, then topics and List names, then the description and language.
 */
export function searchStars(stars: IndexedStar[], query: string, limit = DEFAULT_LIMIT): IndexedStar[] {
  const terms = termsOf(query);
  if (!terms.length) return [];
  const scored = stars.map((star) => {
    const name = star.fullName.toLowerCase();
    const tags = [...star.topics, ...star.lists].join(" ").toLowerCase();
    const text = `${star.description ?? ""} ${star.language ?? ""}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (name.includes(term)) score += 3;
      if (tags.includes(term)) score += 2;
      if (text.includes(term)) score += 1;
    }
    return { star, score };
  });
  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.star.stars - a.star.stars)
    .slice(0, limit)
    .map(({ star }) => star);
}

function ago(iso: string, now: number): string {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (days < 1) return "today";
  if (days < 60) return `${days}d ago`;
  if (days < 730) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function compactCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}

/** One line per star for an agent to read: name, size, Lists, and whether it is still alive. */
export function formatResults(results: IndexedStar[], now: number): string {
  return results
    .map((star) => {
      const state = star.isArchived
        ? "ARCHIVED"
        : isQuiet({ is_archived: false, pushed_at: star.pushedAt }, now)
          ? `QUIET, last push ${star.pushedAt ? ago(star.pushedAt, now) : "never"}`
          : `active, last push ${star.pushedAt ? ago(star.pushedAt, now) : "unknown"}`;
      const release = star.lastReleaseAt ? `, last release ${ago(star.lastReleaseAt, now)}` : "";
      const lists = star.lists.length ? ` · Lists: ${star.lists.join(", ")}` : "";
      const description = star.description
        ? `\n  ${star.description.length > DESCRIPTION_CHARS ? `${star.description.slice(0, DESCRIPTION_CHARS - 1)}…` : star.description}`
        : "";
      return `${star.fullName} · ${compactCount(star.stars)} stars · ${state}${release}${lists}${description}`;
    })
    .join("\n");
}
