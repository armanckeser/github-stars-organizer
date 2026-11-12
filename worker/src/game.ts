import { decodeOpening, encodeOpening, openingBody, readOpening, replay, type GameComment, type GameState, type Opening } from "../../server/game.ts";
import { LOGIN, REPO } from "./cards.ts";
import { NoSuchUser, evened, gql, teamFor, type Team } from "./battle.ts";

// The async battle's referee (issue #47, rules in server/game.ts). A match is a GitHub
// Discussion; this Worker stores none of it. It does three things:
//
//   /api/game/new?a=<host>&b=<guest>     the opening post for a challenge, teams signed
//   /api/game?repo=<owner/name>&n=<num>  a thread's match, worked out from its comments
//   /api/games?user=<login>              the matches someone is in
//
// The signature stops a host from editing the stats in their own opening post. It is
// the only secret in the game: the dice and every rule are public.

export const GAME_PATH = /^\/api\/(game\/new|game|games)$/;

const APP = "https://stars-demo.armanckeser.com/";
export const TITLE = "Stard battle";
const MAX_COMMENT_PAGES = 5;
const LISTED = 12;

function json(body: unknown, status: number, cacheSeconds = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function sign(key: string, text: string): Promise<string> {
  const encoder = new TextEncoder();
  const hmac = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", hmac, encoder.encode(text)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const playerOf = (team: Team) => ({
  login: team.login, name: team.character.name, klass: team.character.klass, look: team.character.look, level: team.character.level, avatarUrl: team.avatarUrl,
});

async function newGame(params: URLSearchParams, token: string, key: string): Promise<Response> {
  const loginA = params.get("a") ?? "";
  const loginB = params.get("b") ?? "";
  if (!LOGIN.test(loginA) || !LOGIN.test(loginB)) return json({ error: "A challenge needs two GitHub usernames." }, 400);
  if (loginA.toLowerCase() === loginB.toLowerCase()) return json({ error: "You can't challenge yourself." }, 400);
  const now = Date.now();
  const full = await Promise.all([teamFor(token, loginA, now), teamFor(token, loginB, now)]);
  const empty = full.find((side) => side.team.length === 0);
  if (empty) return json({ error: `${empty.login} has no public repos to play with.` }, 404);
  const [a, b] = evened(...full);
  const opening: Opening = { v: 2, players: { a: playerOf(a), b: playerOf(b) }, teams: { a: a.team, b: b.team }, facts: { a: a.facts, b: b.facts } };
  const payload = encodeOpening(opening);
  return json({
    title: `${TITLE}: ${a.login} vs ${b.login}`,
    body: openingBody(opening, payload, await sign(key, payload), `${APP}battle?me=${encodeURIComponent(b.login)}`),
    opening,
  }, 200);
}

type CommentNode = {
  id: string;
  body: string;
  createdAt: string;
  url: string;
  author: { login: string; avatarUrl: string } | null;
  editor: { login: string } | null;
};

type DiscussionNode = {
  id: string;
  number: number;
  title: string;
  url: string;
  body: string;
  updatedAt: string;
  author: { login: string } | null;
  repository: { nameWithOwner: string; owner: { login: string } };
  comments: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: CommentNode[] };
};

const COMMENTS = `pageInfo { hasNextPage endCursor } nodes { id body createdAt url author { login avatarUrl(size: 48) } editor { login } }`;
const DISCUSSION = `id number title url body updatedAt author { login } repository { nameWithOwner owner { login } } comments(first: 100) { ${COMMENTS} }`;

// `id` is the thread's id on GitHub, which seeds the match's dice.
export type Thread = { repo: string; number: number; url: string; title: string; id: string };
type Match = { thread: Thread; state: GameState };

/** The opening in a thread's first post, once its signature checks out. Needs nothing from GitHub. */
export async function openingIn(body: string, key: string): Promise<Opening | string> {
  const found = readOpening(body);
  const opening = found ? decodeOpening(found.payload) : null;
  if (!found || !opening) return "This thread isn't a Stard battle.";
  if ((await sign(key, found.payload)) !== found.signature) return "This battle's opening post was changed, so the match can't be trusted.";
  return opening;
}

// A thread is a match when its opening carries teams this Worker signed, and the
// thread sits in the challenger's own repo, written by the challenger.
async function matchFrom(discussion: DiscussionNode, token: string, key: string, now: number): Promise<Match | string> {
  const opening = await openingIn(discussion.body, key);
  if (typeof opening === "string") return opening;
  const host = opening.players.a.login.toLowerCase();
  if (discussion.author?.login.toLowerCase() !== host || discussion.repository.owner.login.toLowerCase() !== host) {
    return "This battle wasn't opened by its challenger in their own repo.";
  }

  const nodes = [...discussion.comments.nodes];
  let page = discussion.comments.pageInfo;
  const [owner, name] = discussion.repository.nameWithOwner.split("/");
  for (let i = 1; i < MAX_COMMENT_PAGES && page.hasNextPage; i++) {
    const more = await gql<{ repository: { discussion: { comments: DiscussionNode["comments"] } } }>(
      token,
      `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { discussion(number: ${discussion.number}) { comments(first: 100, after: ${JSON.stringify(page.endCursor)}) { ${COMMENTS} } } } }`,
    );
    nodes.push(...more.repository.discussion.comments.nodes);
    page = more.repository.discussion.comments.pageInfo;
  }
  const comments: GameComment[] = nodes.flatMap((node) =>
    node.author
      ? [{ id: node.id, author: node.author.login, avatarUrl: node.author.avatarUrl, body: node.body, createdAt: node.createdAt, editedBy: node.editor?.login ?? null, url: node.url }]
      : [],
  );
  return {
    thread: { repo: discussion.repository.nameWithOwner, number: discussion.number, url: discussion.url, title: discussion.title, id: discussion.id },
    state: replay(opening, discussion.id, comments, now),
  };
}

async function game(params: URLSearchParams, token: string, key: string): Promise<Response> {
  const repo = params.get("repo") ?? "";
  const number = Number(params.get("n"));
  if (!REPO.test(repo) || !Number.isInteger(number) || number < 1) return json({ error: "A match is a repo and a thread number." }, 400);
  const [owner, name] = repo.split("/");
  const data = await gql<{ repository: { discussion: DiscussionNode | null } | null }>(
    token,
    `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { discussion(number: ${number}) { ${DISCUSSION} } } }`,
  );
  const discussion = data.repository?.discussion;
  if (!discussion) return json({ error: "No such thread on GitHub." }, 404);
  const match = await matchFrom(discussion, token, key, Date.now());
  // A few seconds of cache: a busy match is asked for by both players and anyone watching.
  return typeof match === "string" ? json({ error: match }, 422) : json(match, 200, 5);
}

async function games(params: URLSearchParams, token: string, key: string): Promise<Response> {
  const login = params.get("user") ?? "";
  if (!LOGIN.test(login)) return json({ error: "Not a GitHub username." }, 400);
  const query = `"${TITLE}" in:title involves:${login} sort:updated-desc`;
  const data = await gql<{ search: { nodes: (DiscussionNode | Record<string, never>)[] } }>(
    token,
    `query { search(type: DISCUSSION, first: ${LISTED}, query: ${JSON.stringify(query)}) { nodes { ... on Discussion { ${DISCUSSION} } } } }`,
  );
  const now = Date.now();
  const found = await Promise.all(
    data.search.nodes.filter((node): node is DiscussionNode => "id" in node).map((node) => matchFrom(node, token, key, now).catch(() => "unreadable")),
  );
  const me = login.toLowerCase();
  const matches = found.flatMap((match) => {
    if (typeof match === "string") return [];
    const { state, thread } = match;
    const side = state.players.a.login.toLowerCase() === me ? "a" : state.players.b.login.toLowerCase() === me ? "b" : null;
    if (!side) return [];
    return [{
      thread,
      side,
      opponent: state.players[side === "a" ? "b" : "a"],
      status: state.status,
      turn: state.turn,
      // A challenge waits on the challenged player; a match in play waits on whoever is next.
      yourMove: state.status === "waiting" ? side === "b" : state.next === side,
      won: state.winner === null ? null : state.winner === side,
      reason: state.reason,
      lastAt: state.lastAt,
    }];
  });
  return json({ matches }, 200, 20);
}

export async function gameResponse(kind: string, params: URLSearchParams, token: string, key: string | undefined): Promise<Response> {
  if (!key) return json({ error: "Battles aren't set up on this server yet." }, 503);
  try {
    if (kind === "game/new") return await newGame(params, token, key);
    if (kind === "game") return await game(params, token, key);
    return await games(params, token, key);
  } catch (error) {
    if (error instanceof NoSuchUser) return json({ error: `No GitHub user called ${error.message}.` }, 404);
    console.error(error);
    return json({ error: "GitHub didn't answer. Try again shortly." }, 502);
  }
}
