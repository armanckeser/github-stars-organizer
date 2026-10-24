import { apiAddRepoToList, apiCreateList, apiPatch } from "./api";
import type { AstralWriter } from "./astral";
import { repoCollection, writeWithoutSync, type StarList } from "./collections";
import { backUpNow } from "./local-backups";
import { localApi } from "./local-api";
import { importFromGitHub } from "./local-sync";
import { APP_MODE } from "./mode";

// Where an Astral import writes. Self-hosted: the Hono API, which writes Postgres
// and GitHub, and Electric streams the rows back. npx: the CLI writes GitHub and a
// re-import afterwards brings the new Lists into the browser.

const serverWriter: AstralWriter = {
  createList: async (name) => {
    const { list } = (await apiCreateList({ name, description: null })) as unknown as { list: StarList };
    return list;
  },
  addToList: async (list, repo) => {
    await apiAddRepoToList(list.id, { repo_id: repo.id });
  },
  setNotes: async (repo, notes) => {
    await apiPatch("repos", repo.id, { notes });
  },
};

const localWriter: AstralWriter = {
  createList: async (name) => {
    const { githubListId } = await localApi.createList({ name, description: null });
    const now = new Date().toISOString();
    return { id: githubListId, github_list_id: githubListId, name, description: null, is_private: false, created_at: now, updated_at: now };
  },
  addToList: async (list, repo) => {
    if (!repo.node_id || !list.github_list_id) throw new Error("Import your stars again first.");
    await localApi.changeMembership({ repoNodeId: repo.node_id, repoGithubId: repo.github_id, githubListId: list.github_list_id, change: "add" });
  },
  setNotes: (repo, notes) => writeWithoutSync(() => repoCollection.update(repo.id, (draft) => { draft.notes = notes; })),
};

export const astralWriter = APP_MODE === "local" ? localWriter : serverWriter;

/** npx only: a backup of how things were, kept under Backups like any other. */
export async function beforeAstralImport(): Promise<void> {
  if (APP_MODE === "local") await backUpNow();
}

/** npx only: reads GitHub back so the new Lists and memberships show up. */
export async function afterAstralImport(): Promise<void> {
  if (APP_MODE === "local") await importFromGitHub();
}
