// GitHub gives the Worker's one token 5,000 GraphQL points an hour, and says how many
// are left in every reply's headers. Once fewer than RESERVE are left, a pool that isn't
// cached yet isn't read, so the cards in people's READMEs, the opt-out checks and runs
// already under way keep working until the hour resets. Each isolate keeps what the
// last reply it saw said: every isolate asks GitHub often, so each learns within a read.

export const RESERVE = 300;

let left = { points: Number.POSITIVE_INFINITY, resetAt: 0 };

/** A POST to GitHub's GraphQL API, noting how many points its reply says are left. */
export async function askGitHub(token: string, body: unknown): Promise<Response> {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "stars-demo-lists" },
    body: JSON.stringify(body),
  });
  const points = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset");
  if (points !== null && reset !== null) left = { points: Number(points), resetAt: Number(reset) * 1000 };
  return response;
}

/** When GitHub's points come back (epoch ms), if too few are left at `now` to read a new pool. */
export function busyUntil(now: number): number | null {
  return left.points < RESERVE && now < left.resetAt ? left.resetAt : null;
}
