import { SELF_REPO } from "../../server/self-repo.ts";

// Who starred this repo: a player among them wears a gold band (docs/AGENT-TASKS.md,
// Task 12). GitHub is asked at most once an hour per Worker instance, one REST call
// per 100 stargazers.

const READ_EVERY_MS = 3_600_000;
const PER_PAGE = 100;
// A Worker request may make 50 subrequests and a team read needs a few of its own.
const MAX_PAGES = 20;

let held: { readAt: number; logins: Promise<ReadonlySet<string>> } | null = null;

async function readStargazers(token: string): Promise<ReadonlySet<string>> {
  const logins = new Set<string>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await fetch(`https://api.github.com/repos/${SELF_REPO.owner}/${SELF_REPO.name}/stargazers?per_page=${PER_PAGE}&page=${page}`, {
      headers: { Authorization: `bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "stars-demo-battle" },
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status} for the stargazers`);
    const people = (await response.json()) as { login: string }[];
    for (const person of people) logins.add(person.login.toLowerCase());
    if (people.length < PER_PAGE) break;
  }
  return logins;
}

/**
 * The logins, in lower case, of everyone who starred this repo. When GitHub can't be
 * read, the last list read stands (empty before the first), and the next try is an
 * hour later: a missing band is better than a failed battle.
 */
export async function supporters(token: string, now: number): Promise<ReadonlySet<string>> {
  if (held && now - held.readAt < READ_EVERY_MS) return held.logins;
  const before = held?.logins ?? Promise.resolve(new Set<string>());
  const logins = readStargazers(token).catch(async (error: unknown) => {
    console.error(error);
    return before;
  });
  held = { readAt: now, logins };
  return logins;
}
