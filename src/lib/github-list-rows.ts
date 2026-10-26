import type { StarList, ListItem } from "./collections";
import type { PublicList } from "../../server/github-lists";

// Shapes Lists like the rows Electric streams from Postgres. Items whose repo was
// not loaded (older than the stars read) are skipped.
export function toListRows(
  lists: PublicList[],
  repoIdByGithubId: Map<number, string>,
): { lists: StarList[]; list_items: ListItem[] } {
  return {
    lists: lists.map((l) => ({
      id: l.id,
      github_list_id: l.id,
      name: l.name,
      description: l.description,
      is_private: false,
      created_at: l.createdAt,
      updated_at: l.updatedAt,
    })),
    list_items: lists.flatMap((l) =>
      l.repoGithubIds.flatMap((githubId, position) => {
        const repoId = repoIdByGithubId.get(githubId);
        return repoId ? [{ id: `${l.id}:${repoId}`, list_id: l.id, repo_id: repoId, position, added_at: l.updatedAt }] : [];
      }),
    ),
  };
}
