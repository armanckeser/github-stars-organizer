import { readLook, type Character } from "../../server/character";
import { RESPONSE_SHAPE } from "../../server/response-shape";
import { opponentLogin, type RunFighter } from "../../server/run/rules";
import { CARD_ORIGIN } from "./published-list";

// The Play screen's side of a run. The rules live in server/run/rules.ts, which the
// Worker that referees a run (worker/src/run.ts) shares.

export * from "../../server/run/rules";

/** `supporter` is there, and true, when the player starred Stard. */
export type Player = { login: string; avatarUrl: string | null; supporter?: true; character: Character & { level: number }; team: RunFighter[] };

// One read per account and day for the page, so the first opponent can be read while
// the player's own cards are (a cold read is several seconds each), and a new run reads
// nothing again: the Worker draws an account's pool once a day.
const reads = new Map<string, Promise<Player>>();
const today = () => new Date().toISOString().slice(0, 10);

/** An account's cards. `forRun` names whose run reads them, when that is someone else's. */
export function fetchPlayer(login: string, forRun?: string): Promise<Player> {
  const key = `${login.toLowerCase()}|${forRun?.toLowerCase() ?? ""}|${today()}`;
  const known = reads.get(key);
  if (known) return known;
  const read = readPlayer(login, forRun);
  reads.set(key, read);
  read.catch(() => reads.delete(key));
  return read;
}

async function readPlayer(login: string, forRun?: string): Promise<Player> {
  const url = new URL("/api/run/pool", CARD_ORIGIN);
  url.searchParams.set("login", login);
  if (forRun) url.searchParams.set("for", forRun);
  url.searchParams.set("_shape", RESPONSE_SHAPE);
  const response = await fetch(url);
  const body = (await response.json()) as Player & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The cards couldn't be read.");
  // A copy of the Worker from before the parts were separate sends the old six-number look.
  return { ...body, character: { ...body.character, look: readLook(body.character.look) } };
}

let optedOut: Promise<string[]> | null = null;

// Read once per page: the Worker caches the answer for an hour anyway.
function opponentsOptedOut(): Promise<string[]> {
  optedOut ??= fetch(`${CARD_ORIGIN}/api/run/opponents`)
    .then(async (response) => {
      const body = (await response.json()) as { optedOut?: string[]; error?: string };
      if (!response.ok || !body.optedOut) throw new Error(body.error ?? "The opponents couldn't be read.");
      return body.optedOut;
    })
    .catch((cause: unknown) => {
      optedOut = null;
      throw cause;
    });
  return optedOut;
}

/** The team `me` plays in a round of the run seeded `seed`: an account from OPPONENTS that hasn't asked to be left out (OPPONENTS.md). */
export async function fetchOpponent(me: string, round: number, seed: string): Promise<Player> {
  return fetchPlayer(opponentLogin(me, round, seed, await opponentsOptedOut()), me);
}
