import { battle, drawFromStars, fieldTeam, instantSeed, type Fighter, type RepoFacts } from "../../server/battle.ts";
import { battleCard, messageCard, trainerCard, type CardRepo, type TrainerFacts } from "../../server/cards.ts";
import { characterFrom, characterLevel, chosenCharacter, defaultCharacter, listedCharacterPath, type Character } from "../../server/character.ts";
import { SELF_REPO } from "../../server/self-repo.ts";
import { NO_PLAY_FILE } from "./no-play.ts";
import type { FrozenRepo, SideFacts, TeamSource } from "../../server/game.ts";
import type { RunFighter } from "../../server/run/rules.ts";
import { cardFor } from "../../server/run/stats.ts";
import { avatarData, svg, LOGIN, REPO } from "./cards.ts";
import { askGitHub, busyUntil } from "./github-budget.ts";
import { pickPopular, type PopularList } from "./popular.ts";
import type { FactsStore, KeptFacts } from "./repo-facts.ts";
import { supporterMark, supporters } from "./supporters.ts";

// The instant battle (issue #46): two usernames, each one's team read from GitHub,
// a fight decided by server/battle.ts.
//
//   /api/battle?a=<login>&b=<login>            both teams and every hit, as JSON
//   /api/card/battle.svg?a=<login>&b=<login>   how the fight ended, as a card
//
// Nothing a player sends is trusted: the only inputs are two usernames.

export const BATTLE_PATH = /^\/api\/(battle|card\/battle\.svg)$/;
//   /api/card/trainer.svg?user=<login>&name=&class=&look=&motto=   a player's character
export const RUN_POOL_PATH = /^\/api\/run\/pool$/;
export const TRAINER_PATH = /^\/api\/card\/trainer\.svg$/;

const CACHE_SECONDS = 3600;
const TEAM_SIZE = 4;
// A run's shops are drawn from this many cards: the ace, then the player's stars, own
// repos and popular repos. Each run shuffles its own shops (newRunSeed), and 40 is
// enough that a 5-card shop over a run's 7 or so rounds shows other cards run to run.
// The pool itself is drawn once a day and cached for an hour (worker/src/pool.ts).
const POOL_SIZE = 40;

const FACTS = `nameWithOwner description stargazerCount forkCount isArchived createdAt pushedAt
  primaryLanguage { name color } owner { avatarUrl(size: 192) } repositoryTopics(first: 20) { nodes { topic { name } } }
  openIssues: issues(states: OPEN) { totalCount } closedIssues: issues(states: CLOSED) { totalCount }
  releases { totalCount } mentionableUsers { totalCount }
  defaultBranchRef { target { ... on Commit { history { totalCount } } } }`;

export type FactsNode = {
  nameWithOwner: string;
  description: string | null;
  stargazerCount: number;
  forkCount: number;
  isArchived: boolean;
  createdAt: string | null;
  pushedAt: string | null;
  mentionableUsers: { totalCount: number };
  defaultBranchRef: { target: { history?: { totalCount: number } } | null } | null;
  primaryLanguage: { name: string; color: string | null } | null;
  owner: { avatarUrl: string };
  openIssues: { totalCount: number };
  closedIssues: { totalCount: number };
  releases: { totalCount: number };
  repositoryTopics: { nodes: { topic: { name: string } }[] };
};

// `custom` says the character was written down somewhere, not made from the username.
type Player = Character & TrainerFacts & { custom: boolean };
// `facts` is what GitHub said that `team` was worked out from; `evened` cuts `team` only.
// `supporter` is there, and true, when the player starred this repo.
export type Team = { login: string; avatarUrl: string | null; supporter?: true; source: TeamSource; character: Player; team: Fighter[]; facts: SideFacts };

// What GitHub knows about a person that their character shows.
const PLAYER = `createdAt followers { totalCount }
  owned: repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: { field: STARGAZERS, direction: DESC }) { nodes { stargazerCount } }`;

type PlayerNode = { createdAt: string; followers: { totalCount: number }; owned: { nodes: { stargazerCount: number }[] } };

function trainerFacts(node: PlayerNode): TrainerFacts {
  const ownStars = node.owned.nodes.reduce((sum, repo) => sum + repo.stargazerCount, 0);
  return {
    level: characterLevel(node.followers.totalCount, ownStars),
    since: Number(node.createdAt.slice(0, 4)) || null,
    followers: node.followers.totalCount,
    ownStars,
  };
}

export class NoSuchUser extends Error {}

// GitHub answers a query that names a missing repo with data and an error side by
// side, so partial data is fine here; only a reply with no data at all is a failure.
export async function gql<T>(token: string, query: string): Promise<T> {
  const response = await askGitHub(token, { query });
  const json = (await response.json().catch(() => ({}))) as { data?: T };
  if (!json.data) throw new Error(`GitHub returned ${response.status}`);
  return json.data;
}

function toFacts(node: FactsNode): RepoFacts {
  return {
    fullName: node.nameWithOwner,
    description: node.description,
    stars: node.stargazerCount,
    forks: node.forkCount,
    createdAt: node.createdAt,
    contributors: node.mentionableUsers.totalCount,
    commits: node.defaultBranchRef?.target?.history?.totalCount ?? 0,
    language: node.primaryLanguage?.name ?? null,
    color: node.primaryLanguage?.color ?? null,
    avatarUrl: node.owner.avatarUrl,
    isArchived: node.isArchived,
    pushedAt: node.pushedAt,
    openIssues: node.openIssues.totalCount,
    closedIssues: node.closedIssues.totalCount,
    releases: node.releases.totalCount,
  };
}

/** The repos named by the top-four card in a profile README, if the README has one. */
export function topFourIn(readme: string): string[] {
  const card = /\/api\/card\/top4\.svg\?([^\s)"'<>]+)/.exec(readme);
  if (!card) return [];
  const repos = new URLSearchParams(card[1].replace(/&amp;/g, "&")).get("repos") ?? "";
  return repos.split(",").filter((name) => REPO.test(name)).slice(0, TEAM_SIZE);
}


// GitHub answers several small queries side by side faster than one big one: a run's
// 20 drawn repos took 7 to 8.5 s in one query and about 3 s as five queries of four.
const FACTS_PER_QUERY = 4;

async function factsQuery(token: string, names: string[]): Promise<FactsNode[]> {
  const found = await gql<Record<string, FactsNode | null>>(
    token,
    `query {${names
      .map((repo, i) => {
        const [owner, repoName] = repo.split("/");
        return ` r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(repoName)}) { ${FACTS} }`;
      })
      .join("")} }`,
  );
  return names.flatMap((_, i) => found[`r${i}`] ?? []);
}

// Facts kept longer than this are read from GitHub again: a card's numbers can be a day old.
const FACTS_KEPT_FOR = 24 * 3600 * 1000;

/** The facts of `names`, in their order: those kept in `store` under a day old, the rest read from GitHub and kept. */
async function factsFor(token: string, names: string[], now: number, store?: FactsStore): Promise<FactsNode[]> {
  const known = new Map<string, FactsNode>();
  const kept = store ? await store.read(names).catch((error) => (console.error(error), [] as KeptFacts[])) : [];
  for (const { node, readAt } of kept) if (now - readAt < FACTS_KEPT_FOR) known.set(node.nameWithOwner.toLowerCase(), node);
  const missing = names.filter((name) => !known.has(name.toLowerCase()));
  const chunks: string[][] = [];
  for (let i = 0; i < missing.length; i += FACTS_PER_QUERY) chunks.push(missing.slice(i, i + FACTS_PER_QUERY));
  const read = (await Promise.all(chunks.map((chunk) => factsQuery(token, chunk)))).flat();
  for (const node of read) known.set(node.nameWithOwner.toLowerCase(), node);
  if (store && read.length > 0) await store.keep(read, now).catch((error) => console.error(error));
  return names.flatMap((name) => known.get(name.toLowerCase()) ?? []);
}

// A team is four cards: one ace the player chose and three drawn from their stars for
// the day. The ace is the first of the top four in their Stard profile, else their
// first pinned repo, else their own most-starred repo. Someone with too few stars
// fills the rest from what they chose and then from their own repos, then from
// `popular` when given (a run's pool, worker/src/popular.ts), and may still come up
// short; `evened` then trims the other side to match.
export async function teamFor(token: string, login: string, now: number, size = TEAM_SIZE, popular?: () => Promise<PopularList>, kept?: FactsStore): Promise<Team> {
  const name = JSON.stringify(login);
  const starred = supporters(token, now);
  const data = await gql<{
    here?: { character: { text?: string } | null } | null;
    user: (PlayerNode & {
      login: string;
      avatarUrl: string;
      profile: { readme: { text?: string } | null } | null;
      stard: { readme: { text?: string } | null; character?: { text?: string } | null; noPlay?: { oid: string } | null } | null;
      pinnedItems: { nodes: ({ nameWithOwner: string } | Record<string, never>)[] };
      repositories: { nodes: { nameWithOwner: string }[] };
      starredRepositories: { nodes: { nameWithOwner: string; isPrivate: boolean }[] };
    }) | null;
  }>(
    token,
    `query { user(login: ${name}) {
      login
      avatarUrl(size: 96)
      ${PLAYER}
      profile: repository(name: ${name}) { readme: object(expression: "HEAD:README.md") { ... on Blob { text } } }
      stard: repository(name: "stard") {
        readme: object(expression: "HEAD:README.md") { ... on Blob { text } }
        character: object(expression: "HEAD:character.md") { ... on Blob { text } }
        noPlay: object(expression: ${JSON.stringify(`HEAD:${NO_PLAY_FILE}`)}) { oid }
      }
      pinnedItems(first: ${TEAM_SIZE}, types: REPOSITORY) { nodes { ... on Repository { nameWithOwner } } }
      repositories(first: ${TEAM_SIZE}, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: { field: STARGAZERS, direction: DESC }) { nodes { nameWithOwner } }
      starredRepositories(first: 100, orderBy: { field: STARRED_AT, direction: DESC }) { nodes { nameWithOwner isPrivate } }
    }
    here: repository(owner: ${JSON.stringify(SELF_REPO.owner)}, name: ${JSON.stringify(SELF_REPO.name)}) {
      character: object(expression: ${JSON.stringify(`HEAD:${listedCharacterPath(login)}`)}) { ... on Blob { text } }
    } }`,
  );
  if (!data.user) throw new NoSuchUser(login);
  const user = data.user;

  // Nobody has to give their profile README over to the game: a repo called `stard`
  // is read first, and the two are read together so a part can live in either.
  const readme = `${user.stard?.readme?.text ?? ""}\n${user.profile?.readme?.text ?? ""}`;
  // The file kept here was drawn by someone else, so an account that opted out of being
  // played (OPPONENTS.md) never shows it; its own file and README card still count.
  const listedFile = user.stard?.noPlay ? null : (data.here?.character?.text ?? null);
  const built = chosenCharacter({ ownFile: user.stard?.character?.text ?? null, readme, listedFile }, user.login);
  const character: Player = { ...(built ?? defaultCharacter(user.login)), ...trainerFacts(user), custom: built !== null };

  // The pinned and top repos are read by name only here, and their facts later in the
  // small parallel queries: with their facts in this query, a busy account's read
  // (antfu's: 10.6 s) ran into GitHub's 10-second limit and failed with a 502.
  const pinned = user.pinnedItems.nodes.flatMap((node) => ("nameWithOwner" in node ? [node.nameWithOwner] : []));
  const owned = user.repositories.nodes.map((node) => node.nameWithOwner);

  let source: TeamSource = "profile";
  const fromProfile = await factsFor(token, topFourIn(readme), now, kept);
  let chosen = fromProfile.map((node) => node.nameWithOwner);
  if (chosen.length === 0) {
    source = "pinned";
    chosen = pinned;
  }
  if (chosen.length === 0) {
    source = "repos";
    chosen = owned;
  }
  const ace = chosen.slice(0, 1);
  const stars = user.starredRepositories.nodes.filter((repo) => !repo.isPrivate).map((repo) => repo.nameWithOwner);
  if (ace.length === 0 && stars.length > 0) source = "stars";
  const day = new Date(now).toISOString().slice(0, 10);
  const drawnNames = drawFromStars(stars, ace, size - ace.length, `${user.login.toLowerCase()}|${day}`);
  // An account with few stars fills the rest of its pool from its own repos.
  const spares = [...new Set([...chosen.slice(1), ...owned])]
    .filter((name) => !ace.includes(name) && !drawnNames.includes(name))
    .slice(0, Math.max(0, size - ace.length - drawnNames.length));
  const short = size - ace.length - drawnNames.length - spares.length;
  const fill = short > 0 && popular ? pickPopular(await popular(), short, [...ace, ...drawnNames, ...spares, ...stars], `${user.login.toLowerCase()}|${day}|popular`) : [];

  const known = new Map(fromProfile.map((node) => [node.nameWithOwner, node]));
  const unread = [...ace, ...drawnNames, ...spares, ...fill].filter((name) => !known.has(name));
  for (const node of await factsFor(token, unread, now, kept)) known.set(node.nameWithOwner, node);
  const read = (names: string[]) => names.flatMap((name) => known.get(name) ?? []);
  const aceNodes = read(ace);
  const drawn = read(drawnNames);
  const filled = read(fill);
  if (aceNodes.length === 0 && drawn.length === 0 && filled.length > 0) source = "popular";
  const nodes = [...aceNodes, ...drawn, ...read(spares), ...filled].slice(0, size);
  const fromPopular = new Set(filled.map((node) => node.nameWithOwner));
  const repos: FrozenRepo[] = nodes.map((node, i) => ({
    ...toFacts(node),
    topics: node.repositoryTopics.nodes.map((entry) => entry.topic.name),
    wildcard: i >= aceNodes.length && i < aceNodes.length + drawn.length,
    ...(fromPopular.has(node.nameWithOwner) ? { popular: true } : {}),
  }));
  const team = fieldTeam(repos, user.login, character.klass, now).map((fighter, i) => (repos[i].wildcard ? { ...fighter, wildcard: true } : repos[i].popular ? { ...fighter, popular: true } : fighter));
  const facts: SideFacts = { readAt: new Date(now).toISOString(), character: built, ace: aceNodes[0]?.nameWithOwner ?? null, source, repos };
  const mark = supporterMark(await starred.soFar(), user.login, user.stard?.noPlay ? "left-out" : "in");
  return { login: user.login, avatarUrl: user.avatarUrl, ...mark, source, character, team, facts };
}

/** Both teams cut to the size of the smaller one, so nobody plays five cards against two. */
export function evened(a: Team, b: Team): [Team, Team] {
  const size = Math.min(a.team.length, b.team.length);
  return [{ ...a, team: a.team.slice(0, size) }, { ...b, team: b.team.slice(0, size) }];
}

function json(body: unknown, status: number, cacheSeconds: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function cardRepo(fighter: Fighter): Promise<CardRepo> {
  return {
    fullName: fighter.fullName,
    stars: fighter.stars,
    language: fighter.language,
    color: fighter.color,
    avatar: fighter.avatarUrl ? await avatarData(fighter.avatarUrl) : null,
  };
}

// A trainer card is drawn from its own address, so a card shows what its builder chose
// even before the README is saved. Only the facts come from GitHub.
// `blocked` is the block list (worker/src/no-play.ts): an account on it never wears the star patch.
export async function trainerResponse(params: URLSearchParams, token: string, blocked: ReadonlySet<string> = new Set()): Promise<Response> {
  const login = params.get("user") ?? "";
  if (!LOGIN.test(login)) return svg(messageCard("This card needs a GitHub username."), 400, CACHE_SECONDS);
  try {
    const starred = supporters(token, Date.now());
    const data = await gql<{ user: (PlayerNode & { login: string; stard: { noPlay: { oid: string } | null } | null }) | null }>(
      token,
      `query { user(login: ${JSON.stringify(login)}) { login ${PLAYER} stard: repository(name: "stard") { noPlay: object(expression: ${JSON.stringify(`HEAD:${NO_PLAY_FILE}`)}) { oid } } } }`,
    );
    if (!data.user) return svg(messageCard(`No GitHub user called ${login}.`), 404, CACHE_SECONDS);
    const leftOut = data.user.stard?.noPlay || blocked.has(data.user.login.toLowerCase());
    const mark = supporterMark(await starred.soFar(), data.user.login, leftOut ? "left-out" : "in");
    return svg(trainerCard(data.user.login, characterFrom(params, data.user.login), trainerFacts(data.user), mark.supporter === true), 200, CACHE_SECONDS);
  } catch (error) {
    console.error(error);
    return svg(messageCard("GitHub didn't answer. This card will be back shortly."), 502, 0);
  }
}

/** An account's cards as a run deals them, the ace first: each fighter with its run card. */
export type RunPool = Omit<Team, "team"> & { team: RunFighter[] };

/**
 * Each card gets its run card (server/run/stats.ts), and the fighter takes the card's
 * numbers in place of the battle's, so the board's HP bars match the fight.
 */
export function withRunCards(player: Team): RunPool {
  const readAt = Date.parse(player.facts.readAt);
  const team = player.team.map((fighter, i): RunFighter => {
    const card = cardFor(player.facts.repos[i], readAt);
    return { ...fighter, hp: card.hp, attack: card.attack, defense: card.guard, speed: card.speed, shiny: card.shiny, card };
  });
  return { ...player, team };
}

/** A run's pool. `popular` tops up an account with few stars (worker/src/popular.ts). */
export async function poolResponse(params: URLSearchParams, token: string, popular?: () => Promise<PopularList>, facts?: FactsStore): Promise<Response> {
  const login = params.get("login") ?? "";
  if (!LOGIN.test(login)) return json({ error: "A run needs a GitHub username." }, 400, CACHE_SECONDS);
  const busy = busyUntil(Date.now());
  if (busy) return busyReply(busy);
  try {
    const player = await teamFor(token, login, Date.now(), POOL_SIZE, popular, facts);
    if (player.team.length === 0) return json({ error: `${player.login} has no public repos to play with.` }, 404, CACHE_SECONDS);
    return json(withRunCards(player), 200, CACHE_SECONDS);
  } catch (error) {
    if (error instanceof NoSuchUser) return json({ error: `No GitHub user called ${error.message}.` }, 404, CACHE_SECONDS);
    console.error(error);
    const busy = busyUntil(Date.now());
    if (busy) return busyReply(busy);
    return json({ error: "GitHub didn't answer. Try again shortly." }, 502, 0);
  }
}

const SERVICE_UNAVAILABLE = 503;

function busyReply(until: number): Response {
  const minutes = Math.max(1, Math.ceil((until - Date.now()) / 60_000));
  const when = minutes === 1 ? "a minute" : `${minutes} minutes`;
  return json({ error: `Stard is busy: GitHub lets it read only so many new players an hour. Try again in ${when}.` }, SERVICE_UNAVAILABLE, 0);
}

export async function battleResponse(kind: string, params: URLSearchParams, token: string): Promise<Response> {
  const asCard = kind !== "battle";
  const fail = (message: string, status: number, cacheSeconds: number) =>
    asCard ? svg(messageCard(message), status, cacheSeconds) : json({ error: message }, status, cacheSeconds);

  const loginA = params.get("a") ?? "";
  const loginB = params.get("b") ?? "";
  if (!LOGIN.test(loginA) || !LOGIN.test(loginB)) return fail("A battle needs two GitHub usernames.", 400, CACHE_SECONDS);

  try {
    const now = Date.now();
    const full = await Promise.all([teamFor(token, loginA, now), teamFor(token, loginB, now)]);
    const empty = full.find((side) => side.team.length === 0);
    if (empty) return fail(`${empty.login} has no public repos to play with.`, 404, CACHE_SECONDS);
    const [a, b] = evened(...full);
    const seed = instantSeed(a, b, now);
    const result = battle(a.team, b.team, seed);
    if (!asCard) return json({ a, b, seed, result }, 200, CACHE_SECONDS);
    const [teamA, teamB] = await Promise.all([Promise.all(a.team.map(cardRepo)), Promise.all(b.team.map(cardRepo))]);
    return svg(
      battleCard({ login: a.login, team: teamA, standing: result.standing.a }, { login: b.login, team: teamB, standing: result.standing.b }, result.winner),
      200,
      CACHE_SECONDS,
    );
  } catch (error) {
    if (error instanceof NoSuchUser) return fail(`No GitHub user called ${error.message}.`, 404, CACHE_SECONDS);
    console.error(error);
    return fail("GitHub didn't answer. Try the battle again shortly.", 502, 0);
  }
}
