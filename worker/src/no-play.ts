import { OPPONENTS } from "../../server/run/rules.ts";
import { gql } from "./battle.ts";
import { LOGIN } from "./cards.ts";

// An account opts out of being played against with a file called `no-play` in a
// repo called `stard` (OPPONENTS.md). Such an account is never a run's opponent, and
// GET /api/run/pool won't read its stars for someone else's run. Its own runs still work.
//
//   GET /api/run/opponents   { optedOut: [login] }, the accounts in OPPONENTS that opted out

export const OPPONENTS_PATH = /^\/api\/run\/opponents$/;
const NO_PLAY_REPO = "stard";
const NO_PLAY_FILE = "no-play";
const FORBIDDEN = 403;

/** Which of `logins` opted out, in lower case. */
export type OptOuts = (logins: readonly string[]) => Promise<string[]>;

/** Reads every login's `stard/no-play` in one GraphQL query. A missing repo or file is no opt-out. */
export async function readOptOuts(token: string, logins: readonly string[]): Promise<string[]> {
  if (logins.length === 0) return [];
  const found = await gql<Record<string, { noPlay: { oid: string } | null } | null>>(
    token,
    `query {${logins
      .map((login, i) => ` o${i}: repository(owner: ${JSON.stringify(login)}, name: ${JSON.stringify(NO_PLAY_REPO)}) { noPlay: object(expression: ${JSON.stringify(`HEAD:${NO_PLAY_FILE}`)}) { oid } }`)
      .join("")} }`,
  );
  return logins.filter((_, i) => found[`o${i}`]?.noPlay).map((login) => login.toLowerCase());
}

/** The account opted out and the read is for someone else's run. */
export class OptedOut extends Error {
  readonly status = FORBIDDEN;
  constructor(login: string) {
    super(`${login} has asked not to be played against.`);
  }
}

/**
 * Refuses a pool read for someone else's run (`for` names whose run) when the account
 * opted out. Comes before the pool's cache, so a pool cached from the account's own
 * run is never handed to anyone else.
 */
export async function checkPoolRead(params: URLSearchParams, optOuts: OptOuts): Promise<void> {
  const login = (params.get("login") ?? "").toLowerCase();
  const forRun = (params.get("for") ?? login).toLowerCase();
  if (!LOGIN.test(login) || forRun === login) return;
  const [opted] = await optOuts([login]);
  if (opted) throw new OptedOut(params.get("login") ?? login);
}

/** The body of GET /api/run/opponents. */
export async function opponentsBody(optOuts: OptOuts): Promise<{ optedOut: string[] }> {
  return { optedOut: await optOuts(OPPONENTS) };
}
