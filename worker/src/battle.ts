import { battle, drawFromStars, fieldTeam, instantSeed, type Fighter, type RepoFacts } from "../../server/battle.ts";
import { battleCard, messageCard, trainerCard, type CardRepo, type TrainerFacts } from "../../server/cards.ts";
import { characterFrom, characterIn, characterLevel, defaultCharacter, type Character } from "../../server/character.ts";
import { avatarData, svg, LOGIN, REPO } from "./cards.ts";

// The instant battle (issue #46): two usernames, each one's team read from GitHub,
// a fight decided by server/battle.ts.
//
//   /api/battle?a=<login>&b=<login>            both teams and every hit, as JSON
//   /api/card/battle.svg?a=<login>&b=<login>   how the fight ended, as a card
//
// Nothing a player sends is trusted: the only inputs are two usernames.

export const BATTLE_PATH = /^\/api\/(battle|card\/battle\.svg)$/;
//   /api/card/trainer.svg?user=<login>&name=&class=&look=&motto=   a player's character
export const TRAINER_PATH = /^\/api\/card\/trainer\.svg$/;

const CACHE_SECONDS = 3600;
const TEAM_SIZE = 4;

const FACTS = `nameWithOwner description stargazerCount forkCount isArchived createdAt pushedAt
  primaryLanguage { name color } owner { avatarUrl(size: 192) }
  openIssues: issues(states: OPEN) { totalCount } closedIssues: issues(states: CLOSED) { totalCount }
  releases { totalCount } mentionableUsers { totalCount }
  defaultBranchRef { target { ... on Commit { history { totalCount } } } }`;

type FactsNode = {
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
};

type TeamSource = "profile" | "pinned" | "stars" | "repos";
// `custom` says the character came from a trainer card in the README, not the default.
type Player = Character & TrainerFacts & { custom: boolean };
export type Team = { login: string; avatarUrl: string | null; source: TeamSource; character: Player; team: Fighter[] };

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
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "stars-demo-lists" },
    body: JSON.stringify({ query }),
  });
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

const WILDCARDS = 1;

async function factsFor(token: string, names: string[]): Promise<FactsNode[]> {
  if (names.length === 0) return [];
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

// A player's team is the four they chose plus one wildcard drawn from their stars for
// the day. The four are the top four in their Stard profile, else their pinned repos.
// Someone who chose neither plays a whole team drawn from their stars; someone with
// no stars either plays their own most-starred repos.
export async function teamFor(token: string, login: string, now: number): Promise<Team> {
  const name = JSON.stringify(login);
  const data = await gql<{
    user: (PlayerNode & {
      login: string;
      avatarUrl: string;
      profile: { readme: { text?: string } | null } | null;
      pinnedItems: { nodes: (FactsNode | Record<string, never>)[] };
      repositories: { nodes: FactsNode[] };
      starredRepositories: { nodes: { nameWithOwner: string; isPrivate: boolean }[] };
    }) | null;
  }>(
    token,
    `query { user(login: ${name}) {
      login
      avatarUrl(size: 96)
      ${PLAYER}
      profile: repository(name: ${name}) { readme: object(expression: "HEAD:README.md") { ... on Blob { text } } }
      pinnedItems(first: ${TEAM_SIZE}, types: REPOSITORY) { nodes { ... on Repository { ${FACTS} } } }
      repositories(first: ${TEAM_SIZE}, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: { field: STARGAZERS, direction: DESC }) { nodes { ${FACTS} } }
      starredRepositories(first: 100, orderBy: { field: STARRED_AT, direction: DESC }) { nodes { nameWithOwner isPrivate } }
    } }`,
  );
  if (!data.user) throw new NoSuchUser(login);
  const user = data.user;

  const readme = user.profile?.readme?.text ?? "";
  const built = characterIn(readme, user.login);
  const character: Player = { ...(built ?? defaultCharacter(user.login)), ...trainerFacts(user), custom: built !== null };

  let source: TeamSource = "profile";
  let chosen = await factsFor(token, topFourIn(readme));
  if (chosen.length === 0) {
    source = "pinned";
    chosen = user.pinnedItems.nodes.filter((node): node is FactsNode => "nameWithOwner" in node);
  }
  const stars = user.starredRepositories.nodes.filter((repo) => !repo.isPrivate).map((repo) => repo.nameWithOwner);
  if (chosen.length === 0 && stars.length > 0) source = "stars";
  // Drawn in one go: the wildcard, and the whole team when nothing was chosen.
  const drawn = await factsFor(
    token,
    drawFromStars(stars, chosen.map((node) => node.nameWithOwner), (chosen.length === 0 ? TEAM_SIZE : 0) + WILDCARDS, `${user.login.toLowerCase()}|${new Date(now).toISOString().slice(0, 10)}`),
  );
  if (chosen.length === 0 && drawn.length === 0) {
    source = "repos";
    chosen = user.repositories.nodes;
  }
  // The wildcard is the last card drawn, when there is a team for it to join.
  const wildcards = chosen.length > 0 ? drawn.length : Math.min(WILDCARDS, Math.max(0, drawn.length - 1));
  const nodes = [...chosen, ...drawn];
  const team = fieldTeam(nodes.map(toFacts), user.login, character.klass, now).map((fighter, i) => (i >= nodes.length - wildcards ? { ...fighter, wildcard: true } : fighter));
  return { login: user.login, avatarUrl: user.avatarUrl, source, character, team };
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
export async function trainerResponse(params: URLSearchParams, token: string): Promise<Response> {
  const login = params.get("user") ?? "";
  if (!LOGIN.test(login)) return svg(messageCard("This card needs a GitHub username."), 400, CACHE_SECONDS);
  try {
    const data = await gql<{ user: (PlayerNode & { login: string }) | null }>(token, `query { user(login: ${JSON.stringify(login)}) { login ${PLAYER} } }`);
    if (!data.user) return svg(messageCard(`No GitHub user called ${login}.`), 404, CACHE_SECONDS);
    return svg(trainerCard(data.user.login, characterFrom(params, data.user.login), trainerFacts(data.user)), 200, CACHE_SECONDS);
  } catch (error) {
    console.error(error);
    return svg(messageCard("GitHub didn't answer. This card will be back shortly."), 502, 0);
  }
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
    const [a, b] = await Promise.all([teamFor(token, loginA, now), teamFor(token, loginB, now)]);
    const empty = [a, b].find((side) => side.team.length === 0);
    if (empty) return fail(`${empty.login} has no public repos to play with.`, 404, CACHE_SECONDS);
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
