// A GitHub that answers the Worker's GraphQL queries from made-up Greendale accounts,
// so a test can open a match without the network. Every login and repo here is
// invented; nothing is read from a real account.

type Repo = { language: string | null; stars: number; forks: number; topics: string[]; pushedAt: string };

const REPOS: Record<string, Repo> = {
  "greendale/dreamatorium": { language: "TypeScript", stars: 4200, forks: 310, topics: ["simulation", "game"], pushedAt: "2026-11-01T09:00:00Z" },
  "cougar-town/kickpuncher": { language: "TypeScript", stars: 830, forks: 41, topics: ["cli"], pushedAt: "2026-06-15T00:00:00Z" },
  "inspector-spacetime/constables": { language: "Python", stars: 15000, forks: 2100, topics: ["ai", "data"], pushedAt: "2026-10-30T00:00:00Z" },
  "troy-barnes/blanket-fort": { language: "JavaScript", stars: 260, forks: 12, topics: ["web"], pushedAt: "2025-02-02T00:00:00Z" },
  "greendale/paintball-assassin": { language: "Rust", stars: 9100, forks: 640, topics: ["game", "security"], pushedAt: "2026-11-08T00:00:00Z" },
  "city-college/mascot": { language: "Go", stars: 1900, forks: 88, topics: [], pushedAt: "2026-09-09T00:00:00Z" },
  "greendale/human-being": { language: "HTML", stars: 75, forks: 3, topics: ["web"], pushedAt: "2023-04-01T00:00:00Z" },
};

type Account = { readme: string | null; pinned: string[]; stars: string[]; characterFile?: string };

export const HOST = "study-group-abed";
export const GUEST = "study-group-annie";
/** Has a character file kept in this repo, and nothing of their own. */
export const LISTED = "study-group-troy";
/** Has their own `stard/character.md` as well as a file kept in this repo. */
export const OWN_FILE = "study-group-britta";

// `characters/<login>.md` in this repo.
const LISTED_FILES: Record<string, string> = {
  [LISTED]: "name: Troy\nhair: buzz\nhair-color: black\nbeard: stubble\ntop: tee\ntop-color: blue",
  [OWN_FILE]: "name: Britta (kept here)\nhair: long",
};

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
  [OWN_FILE]: { readme: "# Britta", pinned: ["greendale/human-being"], stars: [], characterFile: "name: Britta\nhair: medium\nglasses: square\nhat: beanie" },
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

// Who starred this repo: 150 made-up students, then the host, so the list takes two
// pages of 100.
const STARGAZERS = [...Array.from({ length: 150 }, (_, i) => `greendale-student-${i + 1}`), "Study-Group-Abed"];

/** The REST calls made for this repo's stargazers, one per page asked for. */
export const stargazerCalls: string[] = [];

function stargazers(url: URL): Response {
  stargazerCalls.push(url.search);
  const perPage = Number(url.searchParams.get("per_page") ?? 30);
  const page = Number(url.searchParams.get("page") ?? 1);
  return Response.json(STARGAZERS.slice((page - 1) * perPage, page * perPage).map((login) => ({ login })));
}

/** A stand-in for `fetch` that answers GitHub's GraphQL endpoint and this repo's stargazers. */
export async function fakeGitHub(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname === "/repos/armanckeser/github-stars-organizer/stargazers") return stargazers(url);
  const { query } = JSON.parse(String(init?.body)) as { query: string };
  const user = /user\(login: "([^"]+)"\)/.exec(query);
  if (user) {
    const listed = /HEAD:characters\/([^"]+)\.md/.exec(query);
    const file = listed ? LISTED_FILES[listed[1]] : undefined;
    return Response.json({ data: { user: userNode(user[1]), here: { character: file === undefined ? null : { text: file } } } });
  }
  const data: Record<string, unknown> = {};
  for (const found of query.matchAll(/(r\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\)/g)) {
    data[found[1]] = REPOS[`${found[2]}/${found[3]}`] ? repoNode(`${found[2]}/${found[3]}`) : null;
  }
  return Response.json({ data });
}

/** A `fetch` for when GitHub can't be reached at all. */
export async function unreachable(): Promise<Response> {
  throw new TypeError("fetch failed: GitHub is unreachable");
}
