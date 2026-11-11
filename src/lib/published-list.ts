// Turns a composition (what someone wants in a published awesome list) plus their
// repos and Lists into the README's Markdown, and says which repos it left out.
// Pure: no storage, no GitHub (issue #39).

import { isQuiet } from "./star-waves";

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
export type Section =
  | { id: string; kind: "list"; listId: string; heading: string }
  | { id: string; kind: "highlights"; repoIds: string[]; heading: string }
  | { id: string; kind: "rating"; min: number; heading: string };

export type Options = {
  notes: boolean;
  language: boolean;
  stars: boolean;
  credit: boolean;
};

export type Composition = {
  title: string;
  intro: string;
  sections: Section[];
  options: Options;
  // Quiet repos to include anyway. Archived repos can't be kept.
  keepQuiet: string[];
};

export type Composed = {
  markdown: string;
  // Repos a section asked for that the README leaves out, each repo once.
  leftOut: { archived: ComposeRepo[]; quiet: ComposeRepo[] };
  // Quiet repos in the README because the composition keeps them.
  keptQuiet: ComposeRepo[];
  // Repos written under each section, by section id.
  counts: Record<string, number>;
};

export const CREDIT_LINE = "Made with [Stars Organizer](https://github.com/armanckeser/github-stars-organizer)";
export const DEFAULT_RATING_MIN = 4;
export const DEFAULT_OPTIONS: Options = { notes: true, language: false, stars: false, credit: true };

export function defaultHeading(section: Section, lists: ComposeList[]): string {
  if (section.kind === "list") return lists.find((l) => l.id === section.listId)?.name ?? "List";
  if (section.kind === "highlights") return "Highlights";
  return `Rated ${section.min} or higher`;
}

// One section per List, in the order given, which is the order of the app's sidebar.
// A private List stays out: its owner kept it off their profile on purpose.
export function defaultComposition(lists: ComposeList[]): Composition {
  return {
    title: "Awesome stars",
    intro: "",
    sections: lists
      .filter((l) => !l.is_private)
      .map((l) => ({ id: `list:${l.id}`, kind: "list" as const, listId: l.id, heading: "" })),
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
  const repoById = new Map(repos.map((r) => [r.id, r]));
  const keep = new Set(composition.keepQuiet);

  const archived = new Map<string, ComposeRepo>();
  const quiet = new Map<string, ComposeRepo>();
  const keptQuiet = new Map<string, ComposeRepo>();
  const counts: Record<string, number> = {};

  // The repos a section asks for, minus the dead ones, which are noted for the left-out count.
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
    let requested: ComposeRepo[];
    if (section.kind === "list") {
      const ids = new Set(listItems.filter((li) => li.list_id === section.listId).map((li) => li.repo_id));
      requested = repos.filter((r) => ids.has(r.id)).sort(byStars);
    } else if (section.kind === "highlights") {
      requested = section.repoIds.flatMap((id) => repoById.get(id) ?? []);
    } else {
      requested = repos
        .filter((r) => (r.usefulness_rating ?? 0) >= section.min)
        .sort((a, b) => (b.usefulness_rating ?? 0) - (a.usefulness_rating ?? 0) || byStars(a, b));
    }
    const shown = usable(requested);
    counts[section.id] = shown.length;
    // A heading over nothing reads as a mistake.
    if (shown.length === 0) continue;
    const heading = section.heading.trim() || defaultHeading(section, lists);
    blocks.push(`## ${plain(heading)}`, shown.map((r) => repoLine(r, composition.options)).join("\n"));
  }

  if (composition.options.credit) blocks.push(CREDIT_LINE);

  return {
    markdown: blocks.join("\n\n") + "\n",
    leftOut: { archived: [...archived.values()], quiet: [...quiet.values()] },
    keptQuiet: [...keptQuiet.values()],
    counts,
  };
}
