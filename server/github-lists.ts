// GitHub Lists exist only in GraphQL, which needs a token, so this runs where a
// token lives: the self-host server, the npx CLI's localhost server (cli/), the
// demo snapshot script at build time and the demo's Lists Worker (worker/). Each
// caller injects its own transport. It lives in server/ because the self-host
// Docker image is built from that directory alone, and imports nothing.
export type GraphQL = <T>(query: string, variables: Record<string, unknown>) => Promise<T>;

export type ListRepo = { githubId: number; nodeId: string; fullName: string };

export type GitHubList = {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
  repos: ListRepo[];
};

// A change to one repo's membership in one List (see changeRepoList in github.ts).
export type RepoListChange = {
  repoNodeId: string;
  repoGithubId: number;
  githubListId: string;
  change: "add" | "remove";
};

// The Lists Worker's response for the demo. Kept to the fields the demo reads, and
// kept stable: the deployed Worker and the deployed demo update independently.
export type PublicList = Omit<GitHubList, "isPrivate" | "repos"> & { repoGithubIds: number[] };

export function toPublicList(list: GitHubList): PublicList {
  return {
    id: list.id, name: list.name, description: list.description,
    createdAt: list.createdAt, updatedAt: list.updatedAt,
    repoGithubIds: list.repos.map((repo) => repo.githubId),
  };
}

type PageInfo = { endCursor: string | null; hasNextPage: boolean };
type ItemNode = { databaseId?: number; id?: string; nameWithOwner?: string };
type ItemsConnection = { pageInfo: PageInfo; nodes: ItemNode[] };

const PAGE_SIZE = 100;
// Items are read one List per request, a few at a time: a single query asking
// for every List's items makes GitHub time out with a 502 on accounts with a
// couple of dozen Lists, while one List's items answer in about 2s.
const CONCURRENT_LISTS = 8;

const LISTS_SELECTION = `
  lists(first: ${PAGE_SIZE}, after: $after) {
    pageInfo { endCursor hasNextPage }
    nodes { id name description isPrivate createdAt updatedAt }
  }
`;

const USER_LISTS_QUERY = `query($login: String!, $after: String) { owner: user(login: $login) { ${LISTS_SELECTION} } }`;
const VIEWER_LISTS_QUERY = `query($after: String) { owner: viewer { ${LISTS_SELECTION} } }`;

const LIST_ITEMS_QUERY = `
  query($id: ID!, $after: String) {
    node(id: $id) {
      ... on UserList {
        items(first: ${PAGE_SIZE}, after: $after) {
          pageInfo { endCursor hasNextPage }
          nodes { ... on Repository { databaseId id nameWithOwner } }
        }
      }
    }
  }
`;

type ListNode = Omit<GitHubList, "repos">;

type ListsPage = {
  owner: { lists: { pageInfo: PageInfo; nodes: ListNode[] } } | null;
};

export class UserNotFoundError extends Error {}

function reposOf(items: ItemsConnection): ListRepo[] {
  return items.nodes.flatMap((item) =>
    item.databaseId !== undefined && item.id !== undefined && item.nameWithOwner !== undefined
      ? [{ githubId: item.databaseId, nodeId: item.id, fullName: item.nameWithOwner }]
      : [],
  );
}

async function listItems(graphql: GraphQL, listId: string): Promise<ListRepo[]> {
  const repos: ListRepo[] = [];
  let after: string | null = null;
  do {
    const data: { node: { items: ItemsConnection } } = await graphql(LIST_ITEMS_QUERY, { id: listId, after });
    repos.push(...reposOf(data.node.items));
    after = data.node.items.pageInfo.hasNextPage ? data.node.items.pageInfo.endCursor : null;
  } while (after);
  return repos;
}

async function mapConcurrently<T, R>(items: T[], limit: number, map: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await map(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchListNodes(graphql: GraphQL, query: string, login: string | null): Promise<ListNode[]> {
  const lists: ListNode[] = [];
  let after: string | null = null;
  do {
    const data: ListsPage = await graphql<ListsPage>(query, login === null ? { after } : { login, after });
    if (!data.owner) throw new UserNotFoundError(`No GitHub user called ${login}.`);
    lists.push(...data.owner.lists.nodes);
    after = data.owner.lists.pageInfo.hasNextPage ? data.owner.lists.pageInfo.endCursor : null;
  } while (after);
  return lists;
}

function withItems(graphql: GraphQL, lists: ListNode[]): Promise<GitHubList[]> {
  return mapConcurrently(lists, CONCURRENT_LISTS, async (list) => ({ ...list, repos: await listItems(graphql, list.id) }));
}

// Private Lists are dropped here, not by callers: the token belongs to the demo's
// owner, so asking for the owner's own login would otherwise return their private Lists.
export async function fetchPublicLists(graphql: GraphQL, login: string): Promise<GitHubList[]> {
  const lists = await fetchListNodes(graphql, USER_LISTS_QUERY, login);
  return withItems(graphql, lists.filter((list) => !list.isPrivate));
}

// The token owner's own Lists, private ones included.
export async function fetchViewerLists(graphql: GraphQL): Promise<GitHubList[]> {
  return withItems(graphql, await fetchListNodes(graphql, VIEWER_LISTS_QUERY, null));
}
