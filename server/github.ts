// Every GitHub call that writes or reads with the user's token, shared by the
// self-host server (index.ts) and the npx CLI's localhost server (cli/). The
// Docker image is built from server/ alone, so this imports nothing outside it.
import { HEALTH_BATCH_QUERY, type HealthBatchData } from "./health.ts";
import { fetchViewerLists, type GitHubList, type RepoListChange } from "./github-lists.ts";

// Points both servers at a fake GitHub for testing writes without touching a
// real account (scripts/fake-github.ts).
const DEFAULT_API_URL = "https://api.github.com";

export class GitHubError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type GraphQLResponse<TData> = { data?: TData; errors?: { message: string }[]; message?: string };

export type GitHubClient = {
  graphql: <TData>(query: string, variables?: Record<string, unknown>) => Promise<TData>;
  rest: (method: string, path: string) => Promise<void>;
};

export function createGitHubClient(token: string, apiUrl: string = process.env.GITHUB_API_URL ?? DEFAULT_API_URL): GitHubClient {
  const headers = { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "github-stars-organizer" };
  return {
    async graphql<TData>(query: string, variables?: Record<string, unknown>): Promise<TData> {
      const response = await fetch(`${apiUrl}/graphql`, { method: "POST", headers, body: JSON.stringify({ query, variables }) });
      const json = (await response.json().catch(() => ({}))) as GraphQLResponse<TData>;
      if (!response.ok) throw new GitHubError(response.status, json.message ?? `GitHub returned ${response.status}.`);
      if (json.errors?.length) throw new GitHubError(502, json.errors[0].message);
      return json.data as TData;
    },
    async rest(method: string, path: string): Promise<void> {
      const response = await fetch(`${apiUrl}${path}`, { method, headers });
      if (!response.ok) {
        const json = (await response.json().catch(() => ({}))) as { message?: string };
        throw new GitHubError(response.status, json.message ?? `GitHub returned ${response.status}.`);
      }
    },
  };
}

export type StarredRepoNode = {
  databaseId: number;
  id: string;
  name: string;
  nameWithOwner: string;
  owner: { login: string };
  description: string | null;
  url: string;
  homepageUrl: string | null;
  primaryLanguage: { name: string } | null;
  stargazerCount: number;
  forkCount: number;
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  isArchived?: boolean;
  pushedAt?: string | null;
  createdAt?: string | null;
};

export type StarredEdge = { node: StarredRepoNode; starredAt: string };

type StarredData = {
  viewer: {
    starredRepositories: {
      edges: StarredEdge[];
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
    };
  };
};

const STARRED_REPOS_QUERY = `
  query($first: Int!, $after: String) {
    viewer {
      starredRepositories(first: $first, after: $after, orderBy: {field: STARRED_AT, direction: DESC}) {
        totalCount
        pageInfo { endCursor hasNextPage }
        edges {
          starredAt
          node {
            id databaseId name nameWithOwner owner { login }
            description url homepageUrl
            primaryLanguage { name }
            stargazerCount forkCount
            isArchived pushedAt createdAt
            repositoryTopics(first: 10) { nodes { topic { name } } }
          }
        }
      }
    }
  }
`;

/** The viewer's stars, newest first, one page of 100 at a time. Stop early by breaking out. */
export async function* starredPages(client: GitHubClient): AsyncGenerator<StarredEdge[]> {
  let after: string | null = null;
  do {
    const data: StarredData = await client.graphql<StarredData>(STARRED_REPOS_QUERY, { first: 100, after });
    const connection = data.viewer.starredRepositories;
    yield connection.edges;
    after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (after);
}

export function topicsOf(node: StarredRepoNode): string {
  return node.repositoryTopics.nodes.map((t) => t.topic.name).join(",");
}

export async function fetchHealthNodes(client: GitHubClient, nodeIds: string[]): Promise<HealthBatchData> {
  return client.graphql<HealthBatchData>(HEALTH_BATCH_QUERY, { ids: nodeIds });
}

export async function createList(client: GitHubClient, name: string, description: string | null, isPrivate = false): Promise<string> {
  const data = await client.graphql<{ createUserList: { list: { id: string } } }>(
    `mutation($input: CreateUserListInput!) { createUserList(input: $input) { list { id } } }`,
    { input: { name, description: description ?? "", isPrivate } },
  );
  return data.createUserList.list.id;
}

export async function updateList(client: GitHubClient, listId: string, changes: { name?: string; description?: string | null }): Promise<void> {
  const input: Record<string, unknown> = { listId };
  if (changes.name !== undefined) input.name = changes.name;
  if (changes.description !== undefined) input.description = changes.description ?? "";
  await client.graphql(`mutation($input: UpdateUserListInput!) { updateUserList(input: $input) { list { id } } }`, { input });
}

export async function deleteList(client: GitHubClient, listId: string): Promise<void> {
  await client.graphql(`mutation($input: DeleteUserListInput!) { deleteUserList(input: $input) { user { id } } }`, { input: { listId } });
}

// One membership write at a time, so two changes to the same repo can't both
// read the old set and the second overwrite the first.
let membershipQueue: Promise<unknown> = Promise.resolve();

function withListLock<T>(write: () => Promise<T>): Promise<T> {
  const run = membershipQueue.catch(() => undefined).then(write);
  membershipQueue = run;
  return run;
}

const SET_REPO_LISTS = `mutation($input: UpdateUserListsForItemInput!) { updateUserListsForItem(input: $input) { user { id } } }`;

function listsHolding(lists: GitHubList[], repoGithubId: number): string[] {
  return lists.filter((list) => list.repos.some((repo) => repo.githubId === repoGithubId)).map((list) => list.id);
}

/**
 * Adds a repo to one List, or removes it from one, leaving its other Lists alone.
 *
 * updateUserListsForItem replaces a repo's whole set of Lists, and GitHub has no
 * field listing the Lists a repo is in. So this re-reads every List from GitHub
 * right before writing, rather than trusting a local copy that may be stale or
 * cut short, changes the one List, and sends the full set back.
 *
 * Returns the repo's Lists after the change.
 */
export function changeRepoList(client: GitHubClient, request: RepoListChange): Promise<string[]> {
  return withListLock(async () => {
    const lists = await fetchViewerLists(client.graphql);
    const target = lists.find((list) => list.id === request.githubListId);
    const current = listsHolding(lists, request.repoGithubId);
    if (!target) {
      if (request.change === "remove") return current;
      throw new GitHubError(404, "That List no longer exists on GitHub.");
    }
    const has = current.includes(target.id);
    if ((request.change === "add") === has) return current;
    const next = request.change === "add" ? [...current, target.id] : current.filter((id) => id !== target.id);
    await client.graphql(SET_REPO_LISTS, { input: { itemId: request.repoNodeId, listIds: next } });
    return next;
  });
}

export type ListAddition = { repoNodeId: string; repoGithubId: number; fullName: string; githubListId: string };
export type FailedWrite = { what: string; reason: string };

/**
 * Adds many repos to Lists in one pass, for a restore: reads every List once,
 * then writes each repo's set once (its current Lists plus the new ones), all
 * under the same lock as changeRepoList so nothing interleaves.
 */
export function addReposToLists(client: GitHubClient, additions: ListAddition[]): Promise<FailedWrite[]> {
  return withListLock(async () => {
    const lists = await fetchViewerLists(client.graphql);
    const byRepo = new Map<number, ListAddition[]>();
    for (const addition of additions) byRepo.set(addition.repoGithubId, [...(byRepo.get(addition.repoGithubId) ?? []), addition]);
    const failed: FailedWrite[] = [];
    for (const [repoGithubId, repoAdditions] of byRepo) {
      const current = listsHolding(lists, repoGithubId);
      const next = [...new Set([...current, ...repoAdditions.map((addition) => addition.githubListId)])];
      if (next.length === current.length) continue;
      try {
        await client.graphql(SET_REPO_LISTS, { input: { itemId: repoAdditions[0].repoNodeId, listIds: next } });
      } catch (error) {
        failed.push({ what: `Add ${repoAdditions[0].fullName} to its Lists`, reason: error instanceof Error ? error.message : String(error) });
      }
    }
    return failed;
  });
}

export async function addStar(client: GitHubClient, repoNodeId: string): Promise<void> {
  await client.graphql(`mutation($input: AddStarInput!) { addStar(input: $input) { starrable { id } } }`, { input: { starrableId: repoNodeId } });
}

export async function unstar(client: GitHubClient, owner: string, name: string): Promise<void> {
  await client.rest("DELETE", `/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
}
