import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { backupsToPrune, parseBackup, BACKUP_REASONS, type Backup, type BackupEntry, type BackupReason } from "./backup.ts";

// Backups live on disk, outside the browser, so clearing site data or switching
// browsers can't take them. One folder per GitHub account, so a backup can only
// be restored onto the account it came from.

export const HOME_ENV = "GITHUB_STARS_ORGANIZER_HOME";

export function defaultHome(): string {
  return process.env[HOME_ENV] ?? path.join(homedir(), ".github-stars-organizer");
}

export type BackupSummary = BackupEntry & { stars: number; lists: number };

export class BackupNotFoundError extends Error {}

const ID_PATTERN = /^[0-9TZ.-]+-(launch|manual|before-restore|uploaded)$/;

function idFor(backup: Backup): string {
  // Colons are not allowed in Windows file names.
  return `${backup.createdAt.replaceAll(":", "-")}-${backup.reason}`;
}

function reasonOf(id: string): BackupReason {
  const reason = BACKUP_REASONS.find((candidate) => id.endsWith(`-${candidate}`));
  if (!reason) throw new BackupNotFoundError(`No backup called ${id}.`);
  return reason;
}

export type BackupStore = {
  directory: string;
  save: (backup: Backup) => Promise<BackupSummary>;
  list: () => Promise<BackupSummary[]>;
  read: (id: string) => Promise<Backup>;
};

export function createBackupStore(home: string, login: string): BackupStore {
  const directory = path.join(home, "backups", login);

  function fileOf(id: string): string {
    if (!ID_PATTERN.test(id)) throw new BackupNotFoundError(`No backup called ${id}.`);
    return path.join(directory, `${id}.json`);
  }

  async function read(id: string): Promise<Backup> {
    let text: string;
    try {
      text = await readFile(fileOf(id), "utf8");
    } catch {
      throw new BackupNotFoundError(`No backup called ${id}.`);
    }
    return parseBackup(JSON.parse(text));
  }

  async function list(): Promise<BackupSummary[]> {
    await mkdir(directory, { recursive: true });
    const ids = (await readdir(directory)).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -".json".length));
    const summaries = await Promise.all(
      ids.filter((id) => ID_PATTERN.test(id)).map(async (id): Promise<BackupSummary | null> => {
        try {
          const backup = await read(id);
          return { id, reason: backup.reason, createdAt: backup.createdAt, stars: backup.stars.length, lists: backup.lists.length };
        } catch {
          return null;
        }
      }),
    );
    return summaries.filter((summary) => summary !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async function save(backup: Backup): Promise<BackupSummary> {
    if (backup.login !== login) throw new Error(`This backup is for ${backup.login}, not ${login}.`);
    await mkdir(directory, { recursive: true });
    const id = idFor(backup);
    const file = fileOf(id);
    // Written beside the target and renamed into place, so a crash mid-write
    // leaves the previous backups intact rather than a half-written one.
    const partial = `${file}.partial`;
    await writeFile(partial, JSON.stringify(backup, null, 2));
    await rename(partial, file);
    const entries = (await list()).map(({ id: entryId, createdAt }) => ({ id: entryId, createdAt, reason: reasonOf(entryId) }));
    for (const stale of backupsToPrune(entries)) await rm(fileOf(stale), { force: true });
    return { id, reason: backup.reason, createdAt: backup.createdAt, stars: backup.stars.length, lists: backup.lists.length };
  }

  return { directory, save, list, read };
}
