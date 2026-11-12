import { OPPONENTS } from "../../server/run/rules.ts";
import { gql } from "./battle.ts";
import { LOGIN } from "./cards.ts";

// An account opts out of being played against with a file called `no-play` in a
// repo called `stard` (OPPONENTS.md). Such an account is never a run's opponent, and
// GET /api/run/pool won't read its stars for someone else's run. Its own runs still work.
//
// Someone who asks by message or issue instead goes on the block list: the `NO_PLAY`
// secret, logins split by commas. A blocked account counts as opted out everywhere, and
// its stars aren't read at all, so nobody can play as it either. A secret rather than a
// file in the repo, so the list of who asked isn't public:
//
//   npx wrangler secret put NO_PLAY   # torvalds,someone-else
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

/** The accounts on the block list, in lower case. Anything that isn't a login is dropped. */
export function blockListOf(secret: string | undefined): ReadonlySet<string> {
  const logins = (secret ?? "").split(",").map((login) => login.trim().toLowerCase());
  return new Set(logins.filter((login) => LOGIN.test(login)));
}

/** `optOuts`, with every account on the block list counted as opted out without asking GitHub. */
export function withBlockList(optOuts: OptOuts, blocked: ReadonlySet<string>): OptOuts {
  return async (logins) => {
    const listed = logins.map((login) => login.toLowerCase()).filter((login) => blocked.has(login));
    const rest = logins.filter((login) => !blocked.has(login.toLowerCase()));
    return [...listed, ...(rest.length > 0 ? await optOuts(rest) : [])];
  };
}

/** What an account asked: not to be someone else's opponent (the file), or not to be played at all (the block list). */
type Refusal = "as-opponent" | "at-all";
const REFUSALS: Record<Refusal, (login: string) => string> = {
  "as-opponent": (login) => `${login} has asked not to be played against.`,
  "at-all": (login) => `${login} has asked not to be played.`,
};

/** The account opted out and the read is for someone else's run, or it is on the block list. */
export class OptedOut extends Error {
  readonly status = FORBIDDEN;
  constructor(login: string, refusal: Refusal) {
    super(REFUSALS[refusal](login));
  }
}

/**
 * Refuses a pool read for someone else's run (`for` names whose run) when the account
 * opted out, and any read of an account on the block list. Comes before the pool's
 * cache, so a pool cached from the account's own run is never handed to anyone else.
 */
export async function checkPoolRead(params: URLSearchParams, optOuts: OptOuts, blocked: ReadonlySet<string>): Promise<void> {
  const asked = params.get("login") ?? "";
  const login = asked.toLowerCase();
  const forRun = (params.get("for") ?? login).toLowerCase();
  if (blocked.has(login)) throw new OptedOut(asked, "at-all");
  if (!LOGIN.test(login) || forRun === login) return;
  const [opted] = await optOuts([login]);
  if (opted) throw new OptedOut(asked, "as-opponent");
}

/** The body of GET /api/run/opponents. */
export async function opponentsBody(optOuts: OptOuts): Promise<{ optedOut: string[] }> {
  return { optedOut: await optOuts(OPPONENTS) };
}
