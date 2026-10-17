import { z } from "zod";
import type { GitHubList, ListRepo } from "../../server/github-lists";

// The backup file: what someone's stars and Lists looked like on GitHub at a
// moment, plus (in a downloaded copy) the tags, ratings and notes the browser
// holds. Pure, so the browser can read and write the same format the CLI does.

export const BACKUP_FORMAT = "github-stars-organizer-backup";
export const BACKUP_VERSION = 1;

const listRepoSchema = z.object({ githubId: z.number().int(), nodeId: z.string(), fullName: z.string() });

const backupStarSchema = listRepoSchema.extend({ starredAt: z.string() });

const backupListSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isPrivate: z.boolean(),
  repos: z.array(listRepoSchema),
});

const localLayerSchema = z.object({
  repos: z.array(z.object({ githubId: z.number().int(), notes: z.string().nullable(), usefulnessRating: z.number().int().min(1).max(5).nullable() })),
  tags: z.array(z.object({ id: z.string(), name: z.string(), color: z.string() })),
  repoTags: z.array(z.object({ githubId: z.number().int(), tagId: z.string() })),
});

export const BACKUP_REASONS = ["launch", "manual", "before-restore", "uploaded"] as const;

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  createdAt: z.string(),
  login: z.string(),
  reason: z.enum(BACKUP_REASONS),
  stars: z.array(backupStarSchema),
  lists: z.array(backupListSchema),
  local: localLayerSchema.optional(),
});

export type Backup = z.infer<typeof backupSchema>;
export type BackupReason = Backup["reason"];
export type BackupStar = z.infer<typeof backupStarSchema>;
export type BackupList = z.infer<typeof backupListSchema>;
export type LocalLayer = z.infer<typeof localLayerSchema>;

export class InvalidBackupError extends Error {}

export function parseBackup(json: unknown): Backup {
  const result = backupSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new InvalidBackupError(`Not a Stars Organizer backup (${issue.path.join(".") || "file"}: ${issue.message}).`);
  }
  return result.data;
}

export type GitHubSnapshot = { stars: BackupStar[]; lists: GitHubList[] };

export function buildBackup(login: string, reason: BackupReason, snapshot: GitHubSnapshot, createdAt: Date): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: createdAt.toISOString(),
    login,
    reason,
    stars: snapshot.stars,
    lists: snapshot.lists.map((list) => ({
      id: list.id, name: list.name, description: list.description, isPrivate: list.isPrivate, repos: list.repos,
    })),
  };
}

export type RestoreAddition = { repo: ListRepo; listId: string; listName: string };

/**
 * What restoring a backup would change on GitHub. Only ever adds: a repo starred
 * or a List made since the backup stays, so restoring can't lose newer work.
 */
export type RestorePlan = {
  restar: BackupStar[];
  recreateLists: BackupList[];
  /** listId is the backup's List id, which for a recreated List is replaced when it is made. */
  addToLists: RestoreAddition[];
};

export function planRestore(backup: Backup, current: GitHubSnapshot): RestorePlan {
  const starredNow = new Set(current.stars.map((star) => star.githubId));
  const listsNow = new Map(current.lists.map((list) => [list.id, list]));
  const restar = backup.stars.filter((star) => !starredNow.has(star.githubId));
  const recreateLists = backup.lists.filter((list) => !listsNow.has(list.id));
  const addToLists = backup.lists.flatMap((list) => {
    const membersNow = new Set(listsNow.get(list.id)?.repos.map((repo) => repo.githubId) ?? []);
    return list.repos
      .filter((repo) => !membersNow.has(repo.githubId))
      .map((repo) => ({ repo, listId: list.id, listName: list.name }));
  });
  return { restar, recreateLists, addToLists };
}

export function changeCount(plan: RestorePlan): number {
  return plan.restar.length + plan.recreateLists.length + plan.addToLists.length;
}

export type BackupEntry = { id: string; reason: BackupReason; createdAt: string };
export type BackupSummary = BackupEntry & { stars: number; lists: number };

export const LAUNCH_BACKUPS_KEPT = 30;

/** Launch backups beyond the newest 30 go; ones a person asked for, or a restore made, never do. */
export function backupsToPrune(entries: BackupEntry[], keep: number = LAUNCH_BACKUPS_KEPT): string[] {
  return entries
    .filter((entry) => entry.reason === "launch")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(keep)
    .map((entry) => entry.id);
}
