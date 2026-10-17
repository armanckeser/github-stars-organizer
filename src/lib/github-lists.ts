// GitHub Lists exist only in GraphQL, which needs a token, so this runs where a
// token lives: the demo snapshot script at build time, the demo's Lists Worker
// (worker/) at request time and the npx CLI's localhost server (cli/). Each
// caller injects its own transport.
export type GraphQL = <T>(query: string, variables: Record<string, unknown>) => Promise<T>;

export type GitHubList = {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
  repoGithubIds: number[];
};

type PageInfo = { endCursor: string | null; hasNextPage: boolean };
type ItemsConnection = { pageInfo: PageInfo; nodes: { databaseId?: number }[] };

const PAGE_SIZE = 100;

const LISTS_SELECTION = `
  lists(first: ${PAGE_SIZE}, after: $after) {
    pageInfo { endCursor hasNextPage }
    nodes {
      id name description isPrivate createdAt updatedAt
      items(first: ${PAGE_SIZE}) {
        pageInfo { endCursor hasNextPage }
        nodes { ... on Repository { databaseId } }
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
          nodes { ... on Repository { databaseId } }
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

function githubIds(items: ItemsConnection): number[] {
  return items.nodes.flatMap((item) => (item.databaseId !== undefined ? [item.databaseId] : []));
}

async function remainingItems(graphql: GraphQL, listId: string, after: string | null): Promise<number[]> {
  const ids: number[] = [];
  let cursor = after;
  while (cursor) {
    const data = await graphql<{ node: { items: ItemsConnection } }>(LIST_ITEMS_QUERY, { id: listId, after: cursor });
    ids.push(...githubIds(data.node.items));
    cursor = data.node.items.pageInfo.hasNextPage ? data.node.items.pageInfo.endCursor : null;
  }
  return ids;
}

async function fetchLists(graphql: GraphQL, query: string, login: string | null): Promise<GitHubList[]> {
  const lists: GitHubList[] = [];
  let after: string | null = null;
  do {
    const data: ListsPage = await graphql<ListsPage>(query, login === null ? { after } : { login, after });
    if (!data.owner) throw new UserNotFoundError(`No GitHub user called ${login}.`);
    const page = data.owner.lists;
    for (const list of page.nodes) {
      const firstPage = githubIds(list.items);
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
        repoGithubIds: [...firstPage, ...rest],
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
