// GitHub Lists exist only in GraphQL, which needs a token, so this runs where a
// token lives: the demo snapshot script at build time and the demo's Lists
// Worker (worker/) at request time. Each caller injects its own transport.
export type GraphQL = <T>(query: string, variables: Record<string, unknown>) => Promise<T>;

export type PublicList = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  repoGithubIds: number[];
};

type PageInfo = { endCursor: string | null; hasNextPage: boolean };
type ItemsConnection = { pageInfo: PageInfo; nodes: { databaseId?: number }[] };

const PAGE_SIZE = 100;

const LISTS_QUERY = `
  query($login: String!, $after: String) {
    user(login: $login) {
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
    }
  }
`;

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
  user: {
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

// Private Lists are dropped here, not by callers: the token belongs to the demo's
// owner, so asking for the owner's own login would otherwise return their private Lists.
export async function fetchPublicLists(graphql: GraphQL, login: string): Promise<PublicList[]> {
  const lists: PublicList[] = [];
  let after: string | null = null;
  do {
    const data: ListsPage = await graphql<ListsPage>(LISTS_QUERY, { login, after });
    if (!data.user) throw new UserNotFoundError(`No GitHub user called ${login}.`);
    const page = data.user.lists;
    for (const list of page.nodes) {
      if (list.isPrivate) continue;
      const firstPage = githubIds(list.items);
      const rest = list.items.pageInfo.hasNextPage
        ? await remainingItems(graphql, list.id, list.items.pageInfo.endCursor)
        : [];
      lists.push({
        id: list.id,
        name: list.name,
        description: list.description,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
        repoGithubIds: [...firstPage, ...rest],
      });
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return lists;
}
