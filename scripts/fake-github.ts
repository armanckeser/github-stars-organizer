// A stand-in for api.github.com, so List and unstar writes can be tried without
// touching a real account. It answers the GraphQL and REST calls in
// server/github.ts and src/lib/github-lists.ts from in-memory state.
//
//   npx tsx scripts/fake-github.ts            # listens on :4999
//   GITHUB_API_URL=http://127.0.0.1:4999 GITHUB_TOKEN=fake node cli/dist/cli.js
//   curl http://127.0.0.1:4999/__state        # what "GitHub" now holds
//
// Lists start with more items than one page holds, to exercise item paging.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PORT = Number(process.env.PORT ?? 4999);
const PAGE_SIZE = 100;

type FakeRepo = { databaseId: number; id: string; owner: string; name: string; stars: number; starredAt: string };
type FakeList = { id: string; name: string; description: string; isPrivate: boolean; createdAt: string; updatedAt: string; itemIds: string[] };

const OWNERS = ["greendale", "abed", "troy", "annie", "britta", "chang", "pierce", "jeff", "shirley", "dean"];

const repos: FakeRepo[] = Array.from({ length: 230 }, (_, index) => {
  const databaseId = 1000 + index;
  return {
    databaseId,
    id: `R_${databaseId}`,
    owner: OWNERS[index % OWNERS.length],
    name: `project-${index}`,
    stars: 10 + index * 7,
    starredAt: new Date(Date.UTC(2026, 9, 1) - index * 86_400_000).toISOString(),
  };
});

let nextListNumber = 1;
function newList(name: string, isPrivate: boolean, itemIds: string[]): FakeList {
  const now = new Date().toISOString();
  return { id: `UL_${nextListNumber++}`, name, description: "", isPrivate, createdAt: now, updatedAt: now, itemIds };
}

const lists: FakeList[] = [
  newList("Paintball", false, repos.slice(0, 120).map((repo) => repo.id)),
  newList("Darkest Timeline", true, [repos[0].id, repos[5].id]),
  newList("Troy and Abed in the Morning", false, [repos[1].id]),
];

const writes: string[] = [];

function repoNode(repo: FakeRepo) {
  return {
    id: repo.id, databaseId: repo.databaseId, name: repo.name, nameWithOwner: `${repo.owner}/${repo.name}`,
    owner: { login: repo.owner }, description: `A ${repo.owner} side project`, url: `https://github.com/${repo.owner}/${repo.name}`,
    homepageUrl: null, primaryLanguage: { name: "TypeScript" }, stargazerCount: repo.stars, forkCount: 3,
    isArchived: repo.databaseId % 17 === 0, pushedAt: "2026-09-20T00:00:00Z", createdAt: "2021-04-01T00:00:00Z",
    repositoryTopics: { nodes: [{ topic: { name: "community" } }] },
  };
}

function page<T>(items: T[], after: string | null) {
  const start = after ? Number(after) : 0;
  const slice = items.slice(start, start + PAGE_SIZE);
  const end = start + slice.length;
  return { slice, pageInfo: { endCursor: String(end), hasNextPage: end < items.length } };
}

function listItems(list: FakeList, after: string | null) {
  const { slice, pageInfo } = page(list.itemIds, after);
  return { pageInfo, nodes: slice.map((id) => ({ databaseId: repos.find((repo) => repo.id === id)?.databaseId })) };
}

function listNode(list: FakeList) {
  return { ...list, items: listItems(list, null) };
}

type Variables = Record<string, unknown> & { after?: string | null; input?: Record<string, unknown> };

function answer(query: string, variables: Variables): unknown {
  if (query.includes("viewer { login }")) return { viewer: { login: "abed-nadir" } };
  if (query.includes("starredRepositories")) {
    const { slice, pageInfo } = page(repos, variables.after ?? null);
    return {
      viewer: {
        starredRepositories: { totalCount: repos.length, pageInfo, edges: slice.map((repo) => ({ starredAt: repo.starredAt, node: repoNode(repo) })) },
      },
    };
  }
  if (query.includes("createUserList")) {
    const input = variables.input!;
    const list = newList(String(input.name), Boolean(input.isPrivate), []);
    lists.push(list);
    writes.push(`createUserList ${list.id} "${list.name}"`);
    return { createUserList: { list: { id: list.id, name: list.name } } };
  }
  if (query.includes("updateUserListsForItem")) {
    const { itemId, listIds } = variables.input as { itemId: string; listIds: string[] };
    // Replaces the item's whole set of Lists, as GitHub does.
    for (const list of lists) {
      const shouldHave = listIds.includes(list.id);
      const has = list.itemIds.includes(itemId);
      if (shouldHave && !has) list.itemIds.unshift(itemId);
      if (!shouldHave && has) list.itemIds = list.itemIds.filter((id) => id !== itemId);
    }
    writes.push(`updateUserListsForItem ${itemId} -> [${listIds.join(", ")}]`);
    return { updateUserListsForItem: { user: { id: "U_fake" } } };
  }
  if (query.includes("updateUserList")) {
    const input = variables.input!;
    const list = lists.find((candidate) => candidate.id === input.listId);
    if (!list) throw new Error(`Could not resolve to a UserList with the id of '${input.listId}'.`);
    if (input.name !== undefined) list.name = String(input.name);
    if (input.description !== undefined) list.description = String(input.description);
    writes.push(`updateUserList ${list.id} "${list.name}"`);
    return { updateUserList: { list: { id: list.id } } };
  }
  if (query.includes("deleteUserList")) {
    const listId = variables.input!.listId;
    const index = lists.findIndex((candidate) => candidate.id === listId);
    if (index === -1) throw new Error(`Could not resolve to a UserList with the id of '${listId}'.`);
    lists.splice(index, 1);
    writes.push(`deleteUserList ${listId}`);
    return { deleteUserList: { user: { id: "U_fake" } } };
  }
  if (query.includes("nodes(ids")) {
    const ids = variables.ids as string[];
    return {
      nodes: ids.map((id) => {
        const repo = repos.find((candidate) => candidate.id === id);
        if (!repo) return null;
        return {
          id: repo.id, isArchived: false, pushedAt: "2026-09-20T00:00:00Z", stargazerCount: repo.stars,
          openIssues: { totalCount: 4 }, closedIssues: { totalCount: 40 },
          releases: { nodes: [{ createdAt: "2026-08-01T00:00:00Z" }] },
          defaultBranchRef: { target: { committedDate: "2026-09-20T00:00:00Z" } },
          mentionableUsers: { totalCount: 12 },
        };
      }),
    };
  }
  if (query.includes("node(id")) {
    const list = lists.find((candidate) => candidate.id === variables.id);
    return { node: list ? { items: listItems(list, variables.after ?? null) } : null };
  }
  if (query.includes("lists(")) {
    const { slice, pageInfo } = page(lists, variables.after ?? null);
    return { owner: { lists: { pageInfo, nodes: slice.map(listNode) } }, viewer: { lists: { pageInfo, nodes: slice.map(listNode) } } };
  }
  throw new Error(`fake-github has no answer for: ${query.slice(0, 80)}`);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (request.method === "GET" && url.pathname === "/__state") {
    send(response, 200, {
      stars: repos.length,
      lists: lists.map((list) => ({ id: list.id, name: list.name, isPrivate: list.isPrivate, items: list.itemIds.length, first: list.itemIds.slice(0, 5) })),
      writes,
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/graphql") {
    const { query, variables } = JSON.parse(await readBody(request)) as { query: string; variables?: Variables };
    try {
      send(response, 200, { data: answer(query, variables ?? {}) });
    } catch (error) {
      send(response, 200, { errors: [{ message: error instanceof Error ? error.message : String(error) }] });
    }
    return;
  }
  const unstarMatch = url.pathname.match(/^\/user\/starred\/([^/]+)\/([^/]+)$/);
  if (request.method === "DELETE" && unstarMatch) {
    const [, owner, name] = unstarMatch.map(decodeURIComponent);
    const index = repos.findIndex((repo) => repo.owner === owner && repo.name === name);
    if (index !== -1) {
      const [repo] = repos.splice(index, 1);
      for (const list of lists) list.itemIds = list.itemIds.filter((id) => id !== repo.id);
    }
    writes.push(`unstar ${owner}/${name}`);
    response.writeHead(204).end();
    return;
  }
  send(response, 404, { message: "Not Found" });
});

server.listen(PORT, "127.0.0.1", () => console.log(`fake GitHub on http://127.0.0.1:${PORT} (state at /__state)`));
