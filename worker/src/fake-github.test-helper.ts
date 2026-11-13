// A GitHub that answers the Worker's GraphQL queries from made-up Greendale accounts,
// so a test can open a match without the network. Every login and repo here is
// invented; nothing is read from a real account.

import { OPPONENTS } from "../../server/run/rules.ts";

type Repo = { language: string | null; stars: number; forks: number; topics: string[]; pushedAt: string };

/** How many popular repos the fake search finds in each star band. */
export const POPULAR_PER_BAND = 6;

/**
 * Popular repos for GitHub's search to find, six in each star band a rarity starts at
 * (100, 1,000, 10,000 and 100,000 stars), owned by made-up Greendale sponsors.
 */
function popularRepos(): Record<string, Repo> {
  const bands = [
    { owner: "chang-dynasty", stars: 500, language: "Python" },
    { owner: "subway-sandwiches", stars: 5000, language: "Go" },
    { owner: "hawthorne-wipes", stars: 50_000, language: "TypeScript" },
    { owner: "honda-dealership", stars: 200_000, language: "Rust" },
  ];
  return Object.fromEntries(
    bands.flatMap((band) => Array.from({ length: POPULAR_PER_BAND }, (_, i) => [`${band.owner}/sponsor-${i}`, { language: band.language, stars: band.stars + i, forks: 40, topics: [], pushedAt: "2026-10-01T00:00:00Z" }])),
  );
}

const POPULAR_REPOS = popularRepos();
/** Every popular repo the fake search can find. */
export const POPULAR = Object.keys(POPULAR_REPOS);

const REPOS: Record<string, Repo> = {
  "greendale/dreamatorium": { language: "TypeScript", stars: 4200, forks: 310, topics: ["simulation", "game"], pushedAt: "2026-11-01T09:00:00Z" },
  "cougar-town/kickpuncher": { language: "TypeScript", stars: 830, forks: 41, topics: ["cli"], pushedAt: "2026-06-15T00:00:00Z" },
  "inspector-spacetime/constables": { language: "Python", stars: 15000, forks: 2100, topics: ["ai", "data"], pushedAt: "2026-10-30T00:00:00Z" },
  "troy-barnes/blanket-fort": { language: "JavaScript", stars: 260, forks: 12, topics: ["web"], pushedAt: "2025-02-02T00:00:00Z" },
  "greendale/paintball-assassin": { language: "Rust", stars: 9100, forks: 640, topics: ["game", "security"], pushedAt: "2026-11-08T00:00:00Z" },
  "city-college/mascot": { language: "Go", stars: 1900, forks: 88, topics: [], pushedAt: "2026-09-09T00:00:00Z" },
  "greendale/human-being": { language: "HTML", stars: 75, forks: 3, topics: ["web"], pushedAt: "2023-04-01T00:00:00Z" },
  ...POPULAR_REPOS,
};

type Account = { readme: string | null; pinned: string[]; stars: string[]; characterFile?: string };

export const HOST = "study-group-abed";
export const GUEST = "study-group-annie";
/** Has a character file kept in this repo, and nothing of their own. */
export const LISTED = "study-group-troy";
/** Has their own `stard/character.md` as well as a file kept in this repo. */
export const OWN_FILE = "study-group-shirley";
// `characters/<login>.md` in this repo.
const LISTED_FILES: Record<string, string> = {
  [LISTED]: "name: Troy\nhair: buzz\nhair-color: black\nbeard: stubble\ntop: tee\ntop-color: blue",
  [OWN_FILE]: "name: Shirley (kept here)\nhair: long",
};
/** No stars, no pinned repos and no repos of their own. */
export const NEWCOMER = "study-group-pierce";
/** Enough stars to fill a run's pool without any popular repos. */
export const COLLECTOR = "study-group-britta";
// A run's opponents are a fixed list of real logins (server/run/rules.ts). This one
// answers with invented Greendale repos; nothing is read from the real account.
export const RIVAL = OPPONENTS[0];

const ACCOUNTS: Record<string, Account> = {
  // A trainer card and a top four in the `stard` README: a specialist, with an ace from the README.
  [HOST]: {
    readme: `Cool. Cool cool cool.\n![](https://cards.example/api/card/trainer.svg?user=${HOST}&name=Abed&class=specialist)\n![](https://cards.example/api/card/top4.svg?repos=greendale/dreamatorium)`,
    pinned: [],
    stars: ["cougar-town/kickpuncher", "inspector-spacetime/constables", "troy-barnes/blanket-fort"],
  },
  // No README: the default character, the ace from a pinned repo, only two stars.
  [GUEST]: { readme: null, pinned: ["greendale/paintball-assassin"], stars: ["city-college/mascot", "greendale/human-being"] },
  [LISTED]: { readme: null, pinned: ["troy-barnes/blanket-fort"], stars: [] },
  [OWN_FILE]: { readme: "# Shirley", pinned: ["greendale/human-being"], stars: [], characterFile: "name: Shirley\nhair: medium\nglasses: square\nhat: beanie" },
  [NEWCOMER]: { readme: null, pinned: [], stars: [] },
  [COLLECTOR]: { readme: null, pinned: ["greendale/dreamatorium"], stars: [...POPULAR, "city-college/mascot"] },
  [RIVAL]: { readme: null, pinned: ["city-college/mascot"], stars: ["greendale/dreamatorium", "troy-barnes/blanket-fort"] },
};

function repoNode(fullName: string) {
  const repo = REPOS[fullName];
  return {
    nameWithOwner: fullName, description: `${fullName} for the study group`, stargazerCount: repo.stars, forkCount: repo.forks,
    isArchived: false, createdAt: "2019-09-01T00:00:00Z", pushedAt: repo.pushedAt,
    primaryLanguage: repo.language ? { name: repo.language, color: "#3178c6" } : null,
    owner: { avatarUrl: `https://avatars.example/${fullName.split("/")[0]}` },
    repositoryTopics: { nodes: repo.topics.map((name) => ({ topic: { name } })) },
    openIssues: { totalCount: 12 }, closedIssues: { totalCount: 140 }, releases: { totalCount: 6 }, mentionableUsers: { totalCount: 25 },
    defaultBranchRef: { target: { history: { totalCount: 1800 } } },
  };
}

function userNode(login: string) {
  const account = ACCOUNTS[login];
  if (!account) return null;
  return {
    login, avatarUrl: `https://avatars.example/${login}`, createdAt: "2015-08-01T00:00:00Z",
    followers: { totalCount: 30 }, owned: { nodes: [] },
    profile: null,
    stard: account.readme === null ? null : { readme: { text: account.readme }, character: account.characterFile === undefined ? null : { text: account.characterFile } },
    pinnedItems: { nodes: account.pinned.map(repoNode) },
    repositories: { nodes: [] },
    starredRepositories: { nodes: account.stars.map((nameWithOwner) => ({ nameWithOwner, isPrivate: false })) },
  };
}

/** The repos a search finds: those in its `stars:` range, the most stars first. Other qualifiers are ignored. */
function foundBy(search: string): string[] {
  const range = /stars:(\d+)\.\.(\d+)/.exec(search);
  const from = /stars:>=(\d+)/.exec(search);
  const [low, high] = range ? [Number(range[1]), Number(range[2])] : from ? [Number(from[1]), Infinity] : [0, Infinity];
  return Object.keys(REPOS)
    .filter((name) => REPOS[name].stars >= low && REPOS[name].stars <= high)
    .sort((a, b) => REPOS[b].stars - REPOS[a].stars);
}

/** A stand-in for `fetch` that answers GitHub's GraphQL endpoint and nothing else. */
export async function fakeGitHub(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as { query: string };
  const user = /user\(login: "([^"]+)"\)/.exec(query);
  if (user) {
    const listed = /HEAD:characters\/([^"]+)\.md/.exec(query);
    const file = listed ? LISTED_FILES[listed[1]] : undefined;
    return Response.json({ data: { user: userNode(user[1]), here: { character: file === undefined ? null : { text: file } } } });
  }
  const data: Record<string, unknown> = {};
  for (const found of query.matchAll(/(b\d+): search\(query: "([^"]+)", type: REPOSITORY, first: (\d+)\)/g)) {
    data[found[1]] = { nodes: foundBy(found[2]).slice(0, Number(found[3])).map((nameWithOwner) => ({ nameWithOwner })) };
  }
  for (const found of query.matchAll(/(r\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\)/g)) {
    data[found[1]] = REPOS[`${found[2]}/${found[3]}`] ? repoNode(`${found[2]}/${found[3]}`) : null;
  }
  return Response.json({ data });
}

// Any other account a run asks for (OPPONENTS are real logins) is answered with this
// invented one, so no test depends on what a real account has starred.
const STAND_IN: Account = { readme: null, pinned: ["greendale/human-being"], stars: ["city-college/mascot", "troy-barnes/blanket-fort", "cougar-town/kickpuncher"] };

/** What a fake GitHub was asked: every account whose stars were read, in lower case. */
export type FakeGitHub = { fetch: typeof fetch; usersRead: string[] };

/**
 * A fake GitHub where every account exists (unknown ones get a stand-in) and the
 * accounts in `noPlay` have a `stard` repo with a `no-play` file in it.
 */
export function fakeGitHubWhere(options: { noPlay: readonly string[] }): FakeGitHub {
  const usersRead: string[] = [];
  const noPlay = new Set(options.noPlay.map((login) => login.toLowerCase()));
  const answer = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { query } = JSON.parse(String(init?.body)) as { query: string };
    const user = /user\(login: "([^"]+)"\)/.exec(query);
    if (user) {
      usersRead.push(user[1].toLowerCase());
      const account = ACCOUNTS[user[1]] ?? STAND_IN;
      return Response.json({ data: { user: { ...userNode(HOST)!, ...accountNode(account), login: user[1], avatarUrl: `https://avatars.example/${user[1]}` } } });
    }
    const optOuts = [...query.matchAll(/(o\d+): repository\(owner: "([^"]+)", name: "stard"\)/g)];
    if (optOuts.length > 0) {
      return Response.json({ data: Object.fromEntries(optOuts.map((found) => [found[1], noPlay.has(found[2].toLowerCase()) ? { noPlay: { oid: "a1b2c3" } } : null])) });
    }
    return fakeGitHub(_input, init);
  };
  return { fetch: answer as typeof fetch, usersRead };
}

function accountNode(account: Account) {
  return {
    stard: account.readme === null ? null : { readme: { text: account.readme } },
    pinnedItems: { nodes: account.pinned.map(repoNode) },
    starredRepositories: { nodes: account.stars.map((nameWithOwner) => ({ nameWithOwner, isPrivate: false })) },
  };
}

/** A `fetch` for when GitHub can't be reached at all. */
export async function unreachable(): Promise<Response> {
  throw new TypeError("fetch failed: GitHub is unreachable");
}
