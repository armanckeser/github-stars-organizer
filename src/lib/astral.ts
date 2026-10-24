import { z } from "zod";
import type { Repo, StarList, ListItem } from "./collections";

// Importing the JSON file Astral (astralapp.com) exports: each Astral tag becomes a
// GitHub List and Astral notes join the repo's notes. Pure, so the dialog can show
// the plan before anything is written. Astral keys stars by GitHub's numeric repo
// id and exports only stars that have a tag or a note.

/** GitHub refuses a 33rd List. */
export const GITHUB_LIST_LIMIT = 32;

const astralStarSchema = z.object({
  repo_id: z.number().int(),
  notes: z.string().nullish(),
  tags: z.array(z.object({ name: z.string() })).default([]),
});

const astralExportSchema = z.array(astralStarSchema);

export type AstralStar = z.infer<typeof astralStarSchema>;

export class InvalidAstralExportError extends Error {}

export function parseAstralExport(json: unknown): AstralStar[] {
  const result = astralExportSchema.safeParse(json);
  if (!result.success) {
    throw new InvalidAstralExportError("This file isn't an Astral export. In Astral, open Settings and press Export to get one.");
  }
  if (result.data.length === 0) {
    throw new InvalidAstralExportError("This Astral export is empty. Astral only exports stars that have a tag or a note.");
  }
  return result.data;
}

export type AstralTag = {
  name: string;
  /** The List with this name already, matched without case. */
  existingList: StarList | null;
  /** Starred repos with this tag that aren't in the List yet. */
  toAdd: Repo[];
  /** Starred repos with this tag, including ones already in the List. */
  starred: number;
};

export type AstralNote = { repo: Repo; notes: string };

export type AstralPlan = {
  /** Most-used first. */
  tags: AstralTag[];
  notes: AstralNote[];
  /** Repos in the export that are no longer starred, so nothing can be attached to them. */
  notStarred: number;
  /** How many new Lists GitHub will still accept. */
  listSlots: number;
};

export type StoredLists = { repos: Repo[]; lists: StarList[]; list_items: ListItem[] };

const LEFTOVER_TAGS_PREFIX = "Astral tags: ";

function cleanTagNames(star: AstralStar): string[] {
  const names = star.tags.map((tag) => tag.name.trim()).filter(Boolean);
  return [...new Map(names.map((name) => [name.toLowerCase(), name])).values()];
}

/**
 * Notes after the import: the repo's own notes, then the Astral note and any tags
 * that didn't become Lists. A part already present isn't added again, so importing
 * the same file twice changes nothing.
 */
function mergeNotes(current: string | null, additions: string[]): string | null {
  const existing = current?.trim() ?? "";
  const missing = additions.filter((part) => part && !existing.includes(part));
  if (missing.length === 0) return null;
  return [existing, ...missing].filter(Boolean).join("\n\n");
}

/**
 * What importing an Astral export would change. `asLists` names the tags (any case)
 * that become Lists; every other tag is kept as a line in the repo's notes.
 */
export function planAstralImport(stars: AstralStar[], stored: StoredLists, asLists: ReadonlySet<string>): AstralPlan {
  const repoByGithubId = new Map(stored.repos.map((repo) => [repo.github_id, repo]));
  const listByName = new Map(stored.lists.map((list) => [list.name.toLowerCase(), list]));
  const members = new Set(stored.list_items.map((item) => `${item.list_id}:${item.repo_id}`));
  const chosen = new Set([...asLists].map((name) => name.toLowerCase()));

  const tags = new Map<string, AstralTag>();
  const notes: AstralNote[] = [];
  let notStarred = 0;

  for (const star of stars) {
    const repo = repoByGithubId.get(star.repo_id);
    if (!repo) {
      notStarred++;
      continue;
    }
    const names = cleanTagNames(star);
    for (const name of names) {
      const key = name.toLowerCase();
      let tag = tags.get(key);
      if (!tag) {
        tag = { name, existingList: listByName.get(key) ?? null, toAdd: [], starred: 0 };
        tags.set(key, tag);
      }
      tag.starred++;
      if (!tag.existingList || !members.has(`${tag.existingList.id}:${repo.id}`)) tag.toAdd.push(repo);
    }
    const leftover = names.filter((name) => !chosen.has(name.toLowerCase()));
    const merged = mergeNotes(repo.notes, [
      star.notes?.trim() ?? "",
      leftover.length ? `${LEFTOVER_TAGS_PREFIX}${leftover.join(", ")}` : "",
    ]);
    if (merged !== null) notes.push({ repo, notes: merged });
  }

  return {
    tags: [...tags.values()].sort((a, b) => b.starred - a.starred || a.name.localeCompare(b.name)),
    notes,
    notStarred,
    listSlots: Math.max(0, GITHUB_LIST_LIMIT - stored.lists.length),
  };
}

/** Tags that match a List already, then the most-used others while GitHub has room. */
export function defaultListTags(plan: AstralPlan): Set<string> {
  const selected = new Set<string>();
  let slots = plan.listSlots;
  for (const tag of plan.tags) {
    if (tag.existingList) selected.add(tag.name);
    else if (slots > 0) {
      selected.add(tag.name);
      slots--;
    }
  }
  return selected;
}

/** New Lists the chosen tags need, which can't exceed `listSlots`. */
export function newListCount(plan: AstralPlan, asLists: ReadonlySet<string>): number {
  return plan.tags.filter((tag) => asLists.has(tag.name) && !tag.existingList).length;
}

/** Where the import writes, per mode: GitHub and this app's rows. */
export type AstralWriter = {
  /** Makes the List on GitHub and returns the key `addToList` takes. */
  createList: (name: string) => Promise<StarList>;
  addToList: (list: StarList, repo: Repo) => Promise<void>;
  setNotes: (repo: Repo, notes: string) => Promise<void>;
};

export type AstralFailure = { what: string; reason: string };
export type AstralResult = { listsCreated: number; added: number; notes: number; failed: AstralFailure[] };
export type AstralProgress = { done: number; total: number };

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Applies the plan one write at a time. A failed write is recorded and the rest
 * carry on, so one repo GitHub refuses doesn't strand the others.
 */
export async function applyAstralImport(
  plan: AstralPlan,
  asLists: ReadonlySet<string>,
  writer: AstralWriter,
  onProgress: (progress: AstralProgress) => void = () => {},
): Promise<AstralResult> {
  const tags = plan.tags.filter((tag) => asLists.has(tag.name));
  const total = tags.reduce((sum, tag) => sum + tag.toAdd.length + (tag.existingList ? 0 : 1), 0) + plan.notes.length;
  const result: AstralResult = { listsCreated: 0, added: 0, notes: 0, failed: [] };
  let done = 0;
  const step = () => onProgress({ done: ++done, total });

  for (const tag of tags) {
    let list = tag.existingList;
    if (!list) {
      try {
        list = await writer.createList(tag.name);
        result.listsCreated++;
      } catch (error) {
        result.failed.push({ what: `List "${tag.name}"`, reason: reasonOf(error) });
      }
      step();
    }
    for (const repo of tag.toAdd) {
      if (list) {
        try {
          await writer.addToList(list, repo);
          result.added++;
        } catch (error) {
          result.failed.push({ what: `${repo.full_name} in "${tag.name}"`, reason: reasonOf(error) });
        }
      }
      step();
    }
  }
  for (const note of plan.notes) {
    try {
      await writer.setNotes(note.repo, note.notes);
      result.notes++;
    } catch (error) {
      result.failed.push({ what: `Notes on ${note.repo.full_name}`, reason: reasonOf(error) });
    }
    step();
  }
  return result;
}
