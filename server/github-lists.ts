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

const LISTS_SELECTION = `
  lists(first: ${PAGE_SIZE}, after: $after) {
    pageInfo { endCursor hasNextPage }
    nodes {
      id name description isPrivate createdAt updatedAt
      items(first: ${PAGE_SIZE}) {
        pageInfo { endCursor hasNextPage }
        nodes { ... on Repository { databaseId id nameWithOwner } }
      }
    }
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

type ListsPage = {
  owner: {
    lists: {
      pageInfo: PageInfo;
      nodes: {
        id: string; name: string; description: string | null; isPrivate: boolean;
        createdAt: string; updatedAt: string; items: ItemsConnection;
      }[];
    };
  } | null;
};

export class UserNotFoundError extends Error {}

function reposOf(items: ItemsConnection): ListRepo[] {
  return items.nodes.flatMap((item) =>
    item.databaseId !== undefined && item.id !== undefined && item.nameWithOwner !== undefined
      ? [{ githubId: item.databaseId, nodeId: item.id, fullName: item.nameWithOwner }]
      : [],
  );
}

async function remainingItems(graphql: GraphQL, listId: string, after: string | null): Promise<ListRepo[]> {
  const repos: ListRepo[] = [];
  let cursor = after;
  while (cursor) {
    const data = await graphql<{ node: { items: ItemsConnection } }>(LIST_ITEMS_QUERY, { id: listId, after: cursor });
    repos.push(...reposOf(data.node.items));
    cursor = data.node.items.pageInfo.hasNextPage ? data.node.items.pageInfo.endCursor : null;
  }
  return repos;
}

async function fetchLists(graphql: GraphQL, query: string, login: string | null): Promise<GitHubList[]> {
  const lists: GitHubList[] = [];
  let after: string | null = null;
  do {
    const data: ListsPage = await graphql<ListsPage>(query, login === null ? { after } : { login, after });
    if (!data.owner) throw new UserNotFoundError(`No GitHub user called ${login}.`);
    const page = data.owner.lists;
    for (const list of page.nodes) {
      const firstPage = reposOf(list.items);
      const rest = list.items.pageInfo.hasNextPage
        ? await remainingItems(graphql, list.id, list.items.pageInfo.endCursor)
        : [];
      lists.push({
        id: list.id,
        name: list.name,
        description: list.description,
        isPrivate: list.isPrivate,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
        repos: [...firstPage, ...rest],
      });
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return lists;
}

// Private Lists are dropped here, not by callers: the token belongs to the demo's
// owner, so asking for the owner's own login would otherwise return their private Lists.
export async function fetchPublicLists(graphql: GraphQL, login: string): Promise<GitHubList[]> {
  return (await fetchLists(graphql, USER_LISTS_QUERY, login)).filter((list) => !list.isPrivate);
}

// The token owner's own Lists, private ones included.
export async function fetchViewerLists(graphql: GraphQL): Promise<GitHubList[]> {
  return fetchLists(graphql, VIEWER_LISTS_QUERY, null);
}
