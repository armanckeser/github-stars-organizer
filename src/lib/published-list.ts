// Turns a profile (a person's top four, their reviews and their Lists) plus their
// repos into the Markdown for a GitHub README. The top four, each review and each
// List are cards: images the demo's Worker draws from what is in their address
// (server/cards.ts, worker/src/cards.ts). Pure: no storage, no GitHub.

import { isQuiet } from "./star-waves";
import { CLASSES, characterParams, defaultCharacter, type Character } from "../../server/character";

export type ComposeRepo = {
  id: string;
  full_name: string;
  url: string;
  description: string | null;
  notes: string | null;
  language: string | null;
  stars: number;
  usefulness_rating: number | null;
  is_archived: boolean;
  pushed_at: string | null;
};

export type ComposeList = { id: string; name: string; is_private?: boolean };
export type ComposeListItem = { list_id: string; repo_id: string };

// An empty heading means the section's default one (see defaultHeading).
// A character of null follows the username: its default figure, no class yet.
export type Section =
  | { id: string; kind: "character"; character: Character | null; heading: string }
  | { id: string; kind: "topFour"; repoIds: string[]; heading: string }
  | { id: string; kind: "reviews"; repoIds: string[]; heading: string }
  | { id: string; kind: "list"; listId: string; heading: string }
  | { id: string; kind: "rating"; min: number; heading: string };

export type Options = {
  // Under a List's card, the repos themselves, folded shut until clicked.
  repos: boolean;
  notes: boolean;
  language: boolean;
  stars: boolean;
  credit: boolean;
};

export type Composition = {
  // The GitHub username the cards are signed with. Without one the README is plain text.
  login: string;
  title: string;
  intro: string;
  sections: Section[];
  options: Options;
  // Quiet repos to list anyway. Archived repos can't be kept.
  keepQuiet: string[];
};

export type Composed = {
  markdown: string;
  // Repos a List or rating section asked for that the README leaves out, each repo once.
  leftOut: { archived: ComposeRepo[]; quiet: ComposeRepo[] };
  // Quiet repos in the README because the composition keeps them.
  keptQuiet: ComposeRepo[];
  // Repos shown under each section, by section id.
  counts: Record<string, number>;
};

export const APP_URL = "https://stars-demo.armanckeser.com/";
export const REPO_URL = "https://github.com/armanckeser/github-stars-organizer";
export const CARD_ORIGIN: string = (import.meta.env?.VITE_CARD_ORIGIN as string | undefined) ?? "https://stars-demo.armanckeser.com";
export const CREDIT_LINE = `Made with [Stard](${APP_URL})`;
export const DEFAULT_RATING_MIN = 4;
export const DEFAULT_OPTIONS: Options = { repos: true, notes: true, language: false, stars: false, credit: true };
export const TOP_FOUR = 4;
// A review travels in its card's address, and GitHub's image proxy has a length limit.
export const MAX_REVIEW_CHARS = 400;
const LIST_CARD_REPOS = 6;
const LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export function validLogin(login: string): boolean {
  return LOGIN.test(login.trim());
}

export function defaultHeading(section: Section, lists: ComposeList[]): string {
  if (section.kind === "list") return lists.find((l) => l.id === section.listId)?.name ?? "List";
  if (section.kind === "character") return "Character";
  if (section.kind === "topFour") return "Top four";
  if (section.kind === "reviews") return "Reviews";
  return `Rated ${section.min} or higher`;
}

function byRatingThenStars(a: ComposeRepo, b: ComposeRepo): number {
  return (b.usefulness_rating ?? 0) - (a.usefulness_rating ?? 0) || b.stars - a.stars || a.full_name.localeCompare(b.full_name);
}

// A starting point that already looks finished: the four best-rated repos (the most
// starred when nothing is rated), the repos that have both a rating and a note as
// reviews, and one section per public List in the sidebar's order. A private List
// stays out: its owner kept it off their profile on purpose.
export function defaultComposition(lists: ComposeList[], repos: ComposeRepo[], login = ""): Composition {
  const alive = repos.filter((r) => !r.is_archived).sort(byRatingThenStars);
  const reviewed = alive.filter((r) => r.usefulness_rating && r.notes?.trim()).slice(0, 3);
  return {
    login,
    title: "",
    intro: "",
    sections: [
      { id: "character", kind: "character", character: null, heading: "" },
      { id: "topFour", kind: "topFour", repoIds: alive.slice(0, TOP_FOUR).map((r) => r.id), heading: "" },
      ...(reviewed.length ? [{ id: "reviews", kind: "reviews" as const, repoIds: reviewed.map((r) => r.id), heading: "" }] : []),
      ...lists.filter((l) => !l.is_private).map((l) => ({ id: `list:${l.id}`, kind: "list" as const, listId: l.id, heading: "" })),
    ],
    options: DEFAULT_OPTIONS,
    keepQuiet: [],
  };
}

// Text a person typed, or GitHub holds, goes into a line as text: no stray emphasis, links or tags.
function plain(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/[\\`*_[\]<>]/g, "\\$&");
}

function starsLabel(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "star" : "stars"}`;
}

const ratingText = (rating: number) => "★".repeat(rating) + "☆".repeat(5 - rating);

export function cardUrl(kind: "top4" | "review" | "list" | "trainer", params: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") query.set(key, String(value));
  }
  return `${CARD_ORIGIN}/api/card/${kind}.svg?${query}`;
}

// A card as Markdown: an image that is also a link. Alt text can't hold brackets or line breaks.
function cardMarkdown(alt: string, src: string, href: string): string {
  return `[![${alt.replace(/[[\]\\]/g, "").replace(/\s+/g, " ").trim()}](${src})](${href})`;
}

function repoLine(repo: ComposeRepo, options: Options): string {
  const note = options.notes ? plain(repo.notes ?? "") : "";
  const text = note || plain(repo.description ?? "");
  const facts = [options.language ? repo.language : null, options.stars ? starsLabel(repo.stars) : null]
    .filter(Boolean)
    .map((f) => plain(f!))
    .join(", ");
  let line = `- [${plain(repo.full_name)}](${repo.url})`;
  if (text) line += ` - ${text}`;
  if (facts) line += ` (${facts})`;
  return line;
}

// The most starred first, as the List page sorts by default.
function byStars(a: ComposeRepo, b: ComposeRepo): number {
  return b.stars - a.stars || a.full_name.localeCompare(b.full_name);
}

export function composeMarkdown(
  composition: Composition,
  data: { repos: ComposeRepo[]; lists: ComposeList[]; listItems: ComposeListItem[] },
  now: number,
): Composed {
  const { repos, lists, listItems } = data;
  const { options } = composition;
  const login = composition.login.trim();
  const cards = validLogin(login);
  const profileUrl = `${APP_URL}?user=${encodeURIComponent(login)}`;
  const repoById = new Map(repos.map((r) => [r.id, r]));
  const keep = new Set(composition.keepQuiet);

  const archived = new Map<string, ComposeRepo>();
  const quiet = new Map<string, ComposeRepo>();
  const keptQuiet = new Map<string, ComposeRepo>();
  const counts: Record<string, number> = {};

  // The repos a List or rating section asks for, minus the dead ones, which are noted
  // for the left-out count. A repo someone picked by hand is theirs to show.
  function usable(requested: ComposeRepo[]): ComposeRepo[] {
    return requested.filter((repo) => {
      if (repo.is_archived) {
        archived.set(repo.id, repo);
        return false;
      }
      if (!isQuiet(repo, now)) return true;
      if (keep.has(repo.id)) {
        keptQuiet.set(repo.id, repo);
        return true;
      }
      quiet.set(repo.id, repo);
      return false;
    });
  }

  const blocks: string[] = [];
  if (composition.title.trim()) blocks.push(`# ${plain(composition.title)}`);
  if (composition.intro.trim()) blocks.push(composition.intro.trim());

  for (const section of composition.sections) {
    const heading = `## ${plain(section.heading.trim() || defaultHeading(section, lists))}`;

    if (section.kind === "character") {
      // A character is only a card: the figure can't be written as text.
      counts[section.id] = cards ? 1 : 0;
      if (!cards) continue;
      const character = section.character ?? defaultCharacter(login);
      const klass = CLASSES[character.klass];
      blocks.push(
        cardMarkdown(
          `${character.name}, a ${klass.label} on Stard. Battle ${login}.`,
          cardUrl("trainer", characterParams(login, character)),
          `${APP_URL}battle?b=${encodeURIComponent(login)}`,
        ),
      );
      continue;
    }

    if (section.kind === "topFour") {
      const picked = section.repoIds.flatMap((id) => repoById.get(id) ?? []).slice(0, TOP_FOUR);
      counts[section.id] = picked.length;
      if (picked.length === 0) continue;
      if (!cards) {
        blocks.push(heading, picked.map((r) => repoLine(r, options)).join("\n"));
        continue;
      }
      const rated = picked.some((r) => r.usefulness_rating);
      const src = cardUrl("top4", {
        user: login,
        repos: picked.map((r) => r.full_name).join(","),
        ratings: rated ? picked.map((r) => r.usefulness_rating ?? 0).join(",") : null,
      });
      // The card carries its own heading, so the README doesn't repeat one above it.
      blocks.push(cardMarkdown(`${login}'s top four repos on GitHub: ${picked.map((r) => r.full_name).join(", ")}`, src, profileUrl));
      continue;
    }

    if (section.kind === "reviews") {
      const picked = section.repoIds.flatMap((id) => repoById.get(id) ?? []);
      counts[section.id] = picked.length;
      if (picked.length === 0) continue;
      const reviews = picked.map((repo) => {
        const text = (repo.notes ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_REVIEW_CHARS);
        const rating = repo.usefulness_rating;
        if (!cards) {
          return `- [${plain(repo.full_name)}](${repo.url})${rating ? ` ${ratingText(rating)}` : ""}${text ? ` - ${plain(text)}` : ""}`;
        }
        const alt = `${repo.full_name}${rating ? `, rated ${rating} of 5` : ""}${text ? `: ${text}` : ""}`;
        return cardMarkdown(alt, cardUrl("review", { user: login, repo: repo.full_name, rating, text }), repo.url);
      });
      blocks.push(heading, reviews.join(cards ? "\n\n" : "\n"));
      continue;
    }

    let requested: ComposeRepo[];
    if (section.kind === "list") {
      const ids = new Set(listItems.filter((li) => li.list_id === section.listId).map((li) => li.repo_id));
      requested = repos.filter((r) => ids.has(r.id)).sort(byStars);
    } else {
      requested = repos.filter((r) => (r.usefulness_rating ?? 0) >= section.min).sort(byRatingThenStars);
    }
    const shown = usable(requested);
    counts[section.id] = shown.length;
    // A heading over nothing reads as a mistake.
    if (shown.length === 0) continue;
    const lines = shown.map((r) => repoLine(r, options)).join("\n");
    if (!cards) {
      blocks.push(heading, lines);
      continue;
    }
    const title = section.heading.trim() || defaultHeading(section, lists);
    const src = cardUrl("list", {
      user: login,
      title,
      count: shown.length,
      repos: shown.slice(0, LIST_CARD_REPOS).map((r) => r.full_name).join(","),
    });
    blocks.push(cardMarkdown(`${title}, a list of ${shown.length} ${shown.length === 1 ? "repo" : "repos"} by ${login}`, src, profileUrl));
    if (options.repos) {
      // GitHub renders Markdown inside <details> only after a blank line.
      blocks.push(`<details>\n<summary>${shown.length === 1 ? "1 repo" : `All ${shown.length} repos`}</summary>\n\n${lines}\n\n</details>`);
    }
  }

  if (options.credit) blocks.push(CREDIT_LINE);

  return {
    markdown: blocks.join("\n\n") + "\n",
    leftOut: { archived: [...archived.values()], quiet: [...quiet.values()] },
    keptQuiet: [...keptQuiet.values()],
    counts,
  };
}
