import type { Character } from "../../server/character";
import { today, type RunFighter } from "../../server/run/rules";
import { CARD_ORIGIN } from "./published-list";

// The Play screen's side of a run. The rules live in server/run/rules.ts, which the
// Worker that referees a run (worker/src/run.ts) shares.

export * from "../../server/run/rules";

export type Player = { login: string; avatarUrl: string | null; character: Character & { level: number }; team: RunFighter[] };

// One read per account and day for the page, so the first opponent can be read while
// the player's own cards are (a cold read is several seconds each).
const reads = new Map<string, Promise<Player>>();

export function fetchPlayer(login: string): Promise<Player> {
  const key = `${login.toLowerCase()}|${today()}`;
  const known = reads.get(key);
  if (known) return known;
  const read = readPlayer(login);
  reads.set(key, read);
  read.catch(() => reads.delete(key));
  return read;
}

async function readPlayer(login: string): Promise<Player> {
  const response = await fetch(`${CARD_ORIGIN}/api/run/pool?login=${encodeURIComponent(login)}`);
  const body = (await response.json()) as Player & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The cards couldn't be read.");
  return body;
}
