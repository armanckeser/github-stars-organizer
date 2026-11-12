import type { Character } from "../../server/character";
import type { RunFighter } from "../../server/run/rules";
import { CARD_ORIGIN } from "./published-list";

// The Play screen's side of a run. The rules live in server/run/rules.ts, which the
// Worker that referees a run (worker/src/run.ts) shares.

export * from "../../server/run/rules";

export type Player = { login: string; avatarUrl: string | null; character: Character & { level: number }; team: RunFighter[] };

export async function fetchPlayer(login: string): Promise<Player> {
  const response = await fetch(`${CARD_ORIGIN}/api/run/pool?login=${encodeURIComponent(login)}`);
  const body = (await response.json()) as Player & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The cards couldn't be read.");
  return body;
}
