import { addReposToLists, addStar, createList, type FailedWrite, type GitHubClient, type ListAddition } from "../../server/github.ts";
import type { RestoreResult } from "../../src/lib/local-api.ts";
import { buildBackup, planRestore, type Backup, type RestorePlan } from "../../src/lib/backup.ts";
import type { BackupStore } from "./backup-store.ts";
import { readGitHubSnapshot } from "./snapshot.ts";

export class RestoreRefusedError extends Error {}


export function refuseOtherAccounts(backup: Backup, login: string) {
  if (backup.login !== login) {
    throw new RestoreRefusedError(`This backup is of ${backup.login}'s stars, and you're signed in as ${login}.`);
  }
}

/** What restoring would change, against GitHub as it is right now. Changes nothing. */
export async function previewRestore(github: GitHubClient, login: string, backup: Backup): Promise<RestorePlan> {
  refuseOtherAccounts(backup, login);
  return planRestore(backup, await readGitHubSnapshot(github));
}

/**
 * Puts back what the backup had and GitHub no longer has: re-stars repos,
 * recreates Lists, and re-adds repos to Lists. Never unstars or deletes anything.
 *
 * It re-plans from a fresh read rather than trusting a preview the browser holds,
 * and backs up the current state first, so a restore can itself be undone.
 */
export async function applyRestore(github: GitHubClient, store: BackupStore, login: string, backup: Backup): Promise<RestoreResult> {
  refuseOtherAccounts(backup, login);
  const current = await readGitHubSnapshot(github);
  const beforeRestore = await store.save(buildBackup(login, "before-restore", current, new Date()));
  const plan = planRestore(backup, current);
  const failed: FailedWrite[] = [];

  // Oldest first, so the re-starred repos keep their order relative to each other
  // even though GitHub dates them all today.
  let restarred = 0;
  for (const star of [...plan.restar].sort((a, b) => a.starredAt.localeCompare(b.starredAt))) {
    try {
      await addStar(github, star.nodeId);
      restarred++;
    } catch (error) {
      failed.push({ what: `Star ${star.fullName}`, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  let recreatedLists = 0;
  const listIdFor = new Map(current.lists.map((list) => [list.id, list.id]));
  for (const list of plan.recreateLists) {
    try {
      listIdFor.set(list.id, await createList(github, list.name, list.description, list.isPrivate));
      recreatedLists++;
    } catch (error) {
      failed.push({ what: `Recreate the List "${list.name}"`, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  // A List that couldn't be recreated has no id to add to; its failure is already recorded.
  const additions: ListAddition[] = plan.addToLists.flatMap((addition) => {
    const githubListId = listIdFor.get(addition.listId);
    return githubListId
      ? [{ repoNodeId: addition.repo.nodeId, repoGithubId: addition.repo.githubId, fullName: addition.repo.fullName, githubListId }]
      : [];
  });
  failed.push(...(await addReposToLists(github, additions)));

  return { restarred, recreatedLists, addedToLists: additions.length, failed, beforeRestore };
}
