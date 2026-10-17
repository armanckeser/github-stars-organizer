import { starredPages, type GitHubClient } from "../../server/github.ts";
import { fetchViewerLists } from "../../server/github-lists.ts";
import type { GitHubSnapshot } from "./backup.ts";

/** Everything a backup records, read fresh: every star and every List, all pages. */
export async function readGitHubSnapshot(github: GitHubClient): Promise<GitHubSnapshot> {
  const stars: GitHubSnapshot["stars"] = [];
  for await (const edges of starredPages(github)) {
    for (const edge of edges) {
      stars.push({ githubId: edge.node.databaseId, nodeId: edge.node.id, fullName: edge.node.nameWithOwner, starredAt: edge.starredAt });
    }
  }
  return { stars, lists: await fetchViewerLists(github.graphql) };
}
