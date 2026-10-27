// A stand-in for api.github.com, so List, star and unstar writes can be tried
// and tested without touching a real account. It answers the GraphQL and REST
// calls in server/github.ts and server/github-lists.ts from in-memory state.
//
//   npx tsx scripts/fake-github.ts            # listens on :4999
//   GITHUB_API_URL=http://127.0.0.1:4999 GITHUB_TOKEN=fake node cli/dist/cli.js
//   curl http://127.0.0.1:4999/__state        # what "GitHub" now holds
//
// Tests import startFakeGitHub() and seed their own state. Unstarring a repo
// also takes it out of every List, which is what GitHub is believed to do.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";

const PAGE_SIZE = 100;
const DEFAULT_PORT = 4999;
const LISTS_BEFORE_TIMEOUT = 24;
/** A login the fake treats as not existing. */
export const UNKNOWN_LOGIN = "no-such-greendale-student";

export type FakeRepo = { databaseId: number; id: string; owner: string; name: string; stars: number; starredAt: string | null };
export type FakeList = { id: string; name: string; description: string; isPrivate: boolean; createdAt: string; updatedAt: string; itemIds: string[] };

export type FakeSeed = {
  repoCount: number;
  lists: { name: string; isPrivate?: boolean; repoIndexes: number[] }[];
};

export type FakeGitHub = {
  url: string;
  repos: FakeRepo[];
  lists: FakeList[];
  writes: string[];
  /** The next call whose query contains `operation` answers with a GraphQL error. */
  failNext: (operation: string) => void;
  starred: () => FakeRepo[];
  listNamed: (name: string) => FakeList;
  close: () => Promise<void>;
};

const OWNERS = ["greendale", "abed", "troy", "annie", "britta", "chang", "pierce", "jeff", "shirley", "dean"];

export function defaultSeed(): FakeSeed {
  return {
    repoCount: 230,
    lists: [
      { name: "Paintball", repoIndexes: Array.from({ length: 120 }, (_, index) => index) },
      { name: "Darkest Timeline", isPrivate: true, repoIndexes: [0, 5] },
      { name: "Troy and Abed in the Morning", repoIndexes: [1] },
    ],
  };
}

export function fakeRepoName(index: number): string {
  return `${OWNERS[index % OWNERS.length]}/project-${index}`;
}

function seedState(seed: FakeSeed) {
  const repos: FakeRepo[] = Array.from({ length: seed.repoCount }, (_, index) => {
    const databaseId = 1000 + index;
    const [owner, name] = fakeRepoName(index).split("/");
    return {
      databaseId, id: `R_${databaseId}`, owner, name, stars: 10 + index * 7,
      starredAt: new Date(Date.UTC(2026, 9, 1) - index * 86_400_000).toISOString(),
    };
  });
  let nextListNumber = 1;
  const newList = (name: string, isPrivate: boolean, itemIds: string[]): FakeList => {
    const now = new Date().toISOString();
    return { id: `UL_${nextListNumber++}`, name, description: "", isPrivate, createdAt: now, updatedAt: now, itemIds };
  };
  const lists = seed.lists.map((list) => newList(list.name, list.isPrivate ?? false, list.repoIndexes.map((index) => repos[index].id)));
  return { repos, lists, newList };
}

function page<T>(items: T[], after: string | null | undefined) {
  const start = after ? Number(after) : 0;
  const slice = items.slice(start, start + PAGE_SIZE);
  const end = start + slice.length;
  return { slice, pageInfo: { endCursor: String(end), hasNextPage: end < items.length } };
}

type Variables = Record<string, unknown> & { after?: string | null; input?: Record<string, unknown> };

class FakeGraphQLError extends Error {}

export async function startFakeGitHub(seed: FakeSeed = defaultSeed(), port = 0): Promise<FakeGitHub> {
  const { repos, lists, newList } = seedState(seed);
  const writes: string[] = [];
  const failures = new Set<string>();
  const starred = () => repos.filter((repo) => repo.starredAt !== null).sort((a, b) => b.starredAt!.localeCompare(a.starredAt!));
  const byNodeId = (id: unknown) => repos.find((repo) => repo.id === id);

  function repoNode(repo: FakeRepo) {
    return {
      id: repo.id, databaseId: repo.databaseId, name: repo.name, nameWithOwner: `${repo.owner}/${repo.name}`,
      owner: { login: repo.owner }, description: `A ${repo.owner} side project`, url: `https://github.com/${repo.owner}/${repo.name}`,
      homepageUrl: null, primaryLanguage: { name: "TypeScript" }, stargazerCount: repo.stars, forkCount: 3,
      isArchived: repo.databaseId % 17 === 0, pushedAt: "2026-09-20T00:00:00Z", createdAt: "2021-04-01T00:00:00Z",
      repositoryTopics: { nodes: [{ topic: { name: "community" } }] },
    };
  }

  function listItems(list: FakeList, after: string | null | undefined) {
    const { slice, pageInfo } = page(list.itemIds, after);
    return {
      pageInfo,
      nodes: slice.map((id) => {
        const repo = byNodeId(id)!;
        return { databaseId: repo.databaseId, id: repo.id, nameWithOwner: `${repo.owner}/${repo.name}` };
      }),
    };
  }

  function findList(listId: unknown): FakeList {
    const list = lists.find((candidate) => candidate.id === listId);
    if (!list) throw new FakeGraphQLError(`Could not resolve to a UserList with the id of '${listId}'.`);
    return list;
  }

  function answer(query: string, variables: Variables): unknown {
    for (const operation of failures) {
      if (query.includes(operation)) {
        failures.delete(operation);
        throw new FakeGraphQLError(`Something went wrong while executing your query (${operation}).`);
      }
    }
    if (query.includes("viewer { login }")) return { viewer: { login: "abed-nadir" } };
    if (query.includes("starredRepositories")) {
      const { slice, pageInfo } = page(starred(), variables.after);
      return {
        viewer: {
          starredRepositories: { totalCount: starred().length, pageInfo, edges: slice.map((repo) => ({ starredAt: repo.starredAt, node: repoNode(repo) })) },
        },
      };
    }
    if (query.includes("addStar")) {
      const repo = byNodeId(variables.input?.starrableId);
      if (!repo) throw new FakeGraphQLError(`Could not resolve to a node with the global id of '${variables.input?.starrableId}'.`);
      // Like GitHub: starring again gives today's date; starring a starred repo changes nothing.
      repo.starredAt ??= new Date().toISOString();
      writes.push(`addStar ${repo.owner}/${repo.name}`);
      return { addStar: { starrable: { id: repo.id } } };
    }
    if (query.includes("createUserList")) {
      const input = variables.input!;
      const list = newList(String(input.name), Boolean(input.isPrivate), []);
      list.description = String(input.description ?? "");
      lists.push(list);
      writes.push(`createUserList ${list.id} "${list.name}"${list.isPrivate ? " private" : ""}`);
      return { createUserList: { list: { id: list.id, name: list.name } } };
    }
    if (query.includes("updateUserListsForItem")) {
      const { itemId, listIds } = variables.input as { itemId: string; listIds: string[] };
      for (const listId of listIds) findList(listId);
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
      const list = findList(input.listId);
      if (input.name !== undefined) list.name = String(input.name);
      if (input.description !== undefined) list.description = String(input.description);
      writes.push(`updateUserList ${list.id} "${list.name}"`);
      return { updateUserList: { list: { id: list.id } } };
    }
    if (query.includes("deleteUserList")) {
      const list = findList(variables.input!.listId);
      lists.splice(lists.indexOf(list), 1);
      writes.push(`deleteUserList ${list.id}`);
      return { deleteUserList: { user: { id: "U_fake" } } };
    }
    if (query.includes("nodes(ids")) {
      const ids = variables.ids as string[];
      return {
        nodes: ids.map((id) => {
          const repo = byNodeId(id);
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
      return { node: list ? { items: listItems(list, variables.after) } : null };
    }
    if (query.includes("lists(")) {
      if (variables.login === UNKNOWN_LOGIN) return { owner: null };
      // Like GitHub, which times out (502) when one query asks for the items of a couple of dozen Lists.
      if (query.includes("items(") && lists.length > LISTS_BEFORE_TIMEOUT) throw new FakeGraphQLError("We couldn't respond to your request in time.");
      const { slice, pageInfo } = page(lists, variables.after);
      const owner = { lists: { pageInfo, nodes: slice.map((list) => ({ ...list, items: listItems(list, null) })) } };
      return { owner, viewer: owner };
    }
    throw new FakeGraphQLError(`fake-github has no answer for: ${query.slice(0, 80)}`);
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
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/__state") {
      send(response, 200, {
        stars: starred().length,
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
        if (!(error instanceof FakeGraphQLError)) throw error;
        send(response, 200, { errors: [{ message: error.message }] });
      }
      return;
    }
    // A classic token with the repo scope, as the README asks for.
    if (request.method === "GET" && url.pathname === "/user") {
      response.writeHead(200, { "Content-Type": "application/json", "X-OAuth-Scopes": "repo, read:org" });
      response.end(JSON.stringify({ login: "abed-nadir" }));
      return;
    }
    // Every other starred repo, as if GitHub had found them alike.
    if (request.method === "GET" && url.pathname === "/search/repositories") {
      writes.push(`search ${url.searchParams.get("q")}`);
      const items = repos.filter((repo) => repo.databaseId % 2 === 0).map((repo) => ({
        full_name: `${repo.owner}/${repo.name}`, html_url: `https://github.com/${repo.owner}/${repo.name}`,
        description: `A ${repo.owner} side project`, language: "TypeScript", topics: ["community"],
        stargazers_count: repo.stars, pushed_at: "2026-09-20T00:00:00Z", archived: false, fork: false,
      }));
      send(response, 200, { items });
      return;
    }
    const unstarMatch = url.pathname.match(/^\/user\/starred\/([^/]+)\/([^/]+)$/);
    if (request.method === "DELETE" && unstarMatch) {
      const [, owner, name] = unstarMatch.map(decodeURIComponent);
      const repo = repos.find((candidate) => candidate.owner === owner && candidate.name === name);
      if (repo) {
        repo.starredAt = null;
        for (const list of lists) list.itemIds = list.itemIds.filter((id) => id !== repo.id);
      }
      writes.push(`unstar ${owner}/${name}`);
      response.writeHead(204).end();
      return;
    }
    send(response, 404, { message: "Not Found" });
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const { port: boundPort } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${boundPort}`,
    repos, lists, writes, starred,
    failNext: (operation) => { failures.add(operation); },
    listNamed: (name) => lists.find((list) => list.name === name)!,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fake = await startFakeGitHub(defaultSeed(), Number(process.env.PORT ?? DEFAULT_PORT));
  console.log(`fake GitHub on ${fake.url} (state at /__state)`);
}
