import type { Character } from "../../server/character";
import { opponentLogin, today, type RunFighter } from "../../server/run/rules";
import { CARD_ORIGIN } from "./published-list";

// The Play screen's side of a run. The rules live in server/run/rules.ts, which the
// Worker that referees a run (worker/src/run.ts) shares.

export * from "../../server/run/rules";

export type Player = { login: string; avatarUrl: string | null; character: Character & { level: number }; team: RunFighter[] };

/** An account's cards for the day. `forRun` names whose run reads them, when that is someone else's. */
export async function fetchPlayer(login: string, forRun?: string): Promise<Player> {
  const whose = forRun ? `&for=${encodeURIComponent(forRun)}` : "";
  const response = await fetch(`${CARD_ORIGIN}/api/run/pool?login=${encodeURIComponent(login)}${whose}`);
  const body = (await response.json()) as Player & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The cards couldn't be read.");
  return body;
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

/** The team `me` plays in a round: an account from OPPONENTS that hasn't asked to be left out (OPPONENTS.md). */
export async function fetchOpponent(me: string, round: number): Promise<Player> {
  return fetchPlayer(opponentLogin(me, round, today(), await opponentsOptedOut()), me);
}
