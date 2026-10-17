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
// Items are read one List per request, a few at a time: a single query asking
// for every List's items makes GitHub time out with a 502 on accounts with a
// couple of dozen Lists, while one List's items answer in about 2s.
const CONCURRENT_LISTS = 8;

const LISTS_QUERY = `
  query($login: String!, $after: String) {
    user(login: $login) {
      lists(first: ${PAGE_SIZE}, after: $after) {
        pageInfo { endCursor hasNextPage }
        nodes {
          id name description isPrivate createdAt updatedAt
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
        createdAt: string; updatedAt: string;
      }[];
    };
  } | null;
};

export class UserNotFoundError extends Error {}

function githubIds(items: ItemsConnection): number[] {
  return items.nodes.flatMap((item) => (item.databaseId !== undefined ? [item.databaseId] : []));
}

async function listItems(graphql: GraphQL, listId: string): Promise<number[]> {
  const ids: number[] = [];
  let after: string | null = null;
  do {
    const data: { node: { items: ItemsConnection } } = await graphql(LIST_ITEMS_QUERY, { id: listId, after });
    ids.push(...githubIds(data.node.items));
    after = data.node.items.pageInfo.hasNextPage ? data.node.items.pageInfo.endCursor : null;
  } while (after);
  return ids;
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

type ListNode = NonNullable<ListsPage["user"]>["lists"]["nodes"][number];

// Private Lists are dropped here, not by callers: the token belongs to the demo's
// owner, so asking for the owner's own login would otherwise return their private Lists.
export async function fetchPublicLists(graphql: GraphQL, login: string): Promise<PublicList[]> {
  const lists: ListNode[] = [];
  let after: string | null = null;
  do {
    const data: ListsPage = await graphql<ListsPage>(LISTS_QUERY, { login, after });
    if (!data.user) throw new UserNotFoundError(`No GitHub user called ${login}.`);
    const page = data.user.lists;
    lists.push(...page.nodes.filter((list) => !list.isPrivate));
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);

  return mapConcurrently(lists, CONCURRENT_LISTS, async (list) => ({
    id: list.id,
    name: list.name,
    description: list.description,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
    repoGithubIds: await listItems(graphql, list.id),
  }));
}
