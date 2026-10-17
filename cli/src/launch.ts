import type { Hono } from "hono";
import type { GitHubClient } from "../../server/github.ts";
import { buildBackup } from "./backup.ts";
import { createBackupStore, type BackupStore, type BackupSummary } from "./backup-store.ts";
import { createLocalServer } from "./server.ts";
import { readGitHubSnapshot } from "./snapshot.ts";

export type LaunchOptions = { github: GitHubClient; login: string; home: string; appDir: string; port: number };
export type Launched = { app: Hono; store: BackupStore; launchBackup: BackupSummary };

export class BackupFailedError extends Error {}

/**
 * Backs up the account's stars and Lists, then builds the server. The server
 * doesn't exist until the backup is on disk, so nothing can change on GitHub
 * without a backup from just before; if the backup fails, the app doesn't start.
 */
export async function launch({ github, login, home, appDir, port }: LaunchOptions): Promise<Launched> {
  const store = createBackupStore(home, login);
  let launchBackup: BackupSummary;
  try {
    launchBackup = await store.save(buildBackup(login, "launch", await readGitHubSnapshot(github), new Date()));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new BackupFailedError(`Couldn't back up your stars and Lists (${reason}), so nothing was started and nothing changed.`);
  }
  const app = createLocalServer({ github, appDir, port, store, login });
  return { app, store, launchBackup };
}
