import { SELF_REPO } from "../../server/self-repo.ts";

// Who starred this repo: a player among them wears a star patch (docs/AGENT-TASKS.md,
// Task 12). GitHub is asked at most once an hour per Worker instance, one REST call
// per 100 stargazers.

const READ_EVERY_MS = 3_600_000;
const PER_PAGE = 100;
// A Worker request may make 50 subrequests and a team read needs a few of its own.
const MAX_PAGES = 20;

let held: { readAt: number; logins: Promise<ReadonlySet<string>> } | null = null;
// The last list GitHub gave, for a battle that is ready before the next read is done.
let lastRead: ReadonlySet<string> = new Set();

async function readStargazers(token: string): Promise<ReadonlySet<string>> {
  const logins = new Set<string>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await fetch(`https://api.github.com/repos/${SELF_REPO.owner}/${SELF_REPO.name}/stargazers?per_page=${PER_PAGE}&page=${page}`, {
      headers: { Authorization: `bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "stars-demo-battle" },
    });
    // Since GitHub's 2026-06-30 change only the repo's admins and collaborators can list
    // its stargazers; any other token is answered 404 or 403, and nobody wears the patch.
    if (!response.ok) throw new Error(`GitHub returned ${response.status} for the stargazers`);
    const people = (await response.json()) as { login: string }[];
    for (const person of people) logins.add(person.login.toLowerCase());
    if (people.length < PER_PAGE) break;
  }
  return logins;
}

/** A read of the stargazers, started with the team's read and asked for once the team is ready. */
export type StargazerRead = {
  /** The logins, in lower case: this read's when it is done, else the last list read, so a slow GitHub never holds a battle. */
  soFar(): Promise<ReadonlySet<string>>;
};

/**
 * Who starred this repo. When GitHub can't be read, the last list read stands (empty
 * before the first), and the next try is an hour later: a missing patch is better than
 * a failed battle.
 */
export function supporters(token: string, now: number): StargazerRead {
  if (!held || now - held.readAt >= READ_EVERY_MS) {
    const before = lastRead;
    const logins = readStargazers(token).then(
      (read) => (lastRead = read),
      (error: unknown) => {
        console.error(error);
        return before;
      },
    );
    held = { readAt: now, logins };
  }
  const logins = held.logins;
  // A settled read wins the race: its callback was queued first.
  return { soFar: () => Promise.race([logins, Promise.resolve(lastRead)]) };
}

/** Whether an account asked to be left out of the game: a `stard/no-play` file, or the block list (worker/src/no-play.ts). */
export type Playing = "in" | "left-out";

/** The flag a player's figure carries: there, and true, when they starred Stard and haven't asked to be left out. */
export function supporterMark(starred: ReadonlySet<string>, login: string, playing: Playing): { supporter?: true } {
  if (playing === "left-out" || !starred.has(login.toLowerCase())) return {};
  return { supporter: true };
}
