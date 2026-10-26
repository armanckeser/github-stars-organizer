import { repoCollection, tagCollection, repoTagCollection, writeWithoutSync } from "./collections";
import { parseBackup, type Backup, type BackupSummary, type LocalLayer } from "./backup";
import { captureLocalLayer, planLocalFill, type LocalRows } from "./local-layer";
import { importFromGitHub } from "./local-sync";
import { localApi, type RestoreResult } from "./local-api";

// The npx build's backups as the browser sees them: the CLI keeps the files and
// writes GitHub; the browser adds its tags, ratings and notes and puts them back.

async function localRows(): Promise<LocalRows> {
  await Promise.all([repoCollection.preload(), tagCollection.preload(), repoTagCollection.preload()]);
  return { repos: repoCollection.toArray, tags: tagCollection.toArray, repo_tags: repoTagCollection.toArray };
}

export async function backUpNow(): Promise<BackupSummary> {
  return localApi.backUpNow({ local: captureLocalLayer(await localRows()) });
}

/**
 * Saves a backup as a file. A launch backup is taken before the browser opens, so
 * it has no tags, ratings or notes of its own; the file gets this browser's current ones.
 */
export async function downloadBackup(summary: BackupSummary): Promise<void> {
  const backup = await localApi.readBackup(summary.id);
  const file: Backup = backup.local ? backup : { ...backup, local: captureLocalLayer(await localRows()) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `stars-organizer-${backup.login}-${summary.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Reads a downloaded backup and hands it to the CLI, which keeps a copy. */
export async function uploadBackupFile(file: File): Promise<BackupSummary> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error(`${file.name} isn't a JSON file.`);
  }
  return localApi.uploadBackup(parseBackup(json));
}

export type LocalFillCounts = { notesAndRatings: number; tags: number; tagLinks: number };

async function fillLocal(layer: LocalLayer): Promise<LocalFillCounts> {
  const fill = planLocalFill(layer, await localRows(), () => crypto.randomUUID());
  await writeWithoutSync(() => {
    for (const repo of fill.repos) repoCollection.update(repo.id, (draft) => { Object.assign(draft, repo); });
    if (fill.tags.length) tagCollection.insert(fill.tags);
    if (fill.repo_tags.length) repoTagCollection.insert(fill.repo_tags);
  });
  return { notesAndRatings: fill.repos.length, tags: fill.tags.length, tagLinks: fill.repo_tags.length };
}

export type FullRestoreResult = RestoreResult & { local: LocalFillCounts | null };

/**
 * Restores GitHub, re-reads it so the re-starred repos are back in the browser,
 * then fills in the backup's tags, ratings and notes where the browser has none.
 */
export async function restoreBackup(summary: BackupSummary): Promise<FullRestoreResult> {
  const result = await localApi.applyRestore({ backupId: summary.id });
  await importFromGitHub();
  const { local } = await localApi.readBackup(summary.id);
  return { ...result, local: local ? await fillLocal(local) : null };
}
