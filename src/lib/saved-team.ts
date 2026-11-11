import { savedUnitsAt, type SavedTeam } from "../../server/run/saved-team";
import type { Snapshot } from "../../server/run/types";
import { APP_URL, CARD_ORIGIN } from "./published-list";
import type { Player, Unit } from "./run";

// A finished run's team, for its share link (worker/src/team.ts). The Worker plays
// the run's fights again before it signs a team, so the link can be trusted.

export * from "../../server/run/saved-team";

async function answered<T>(response: Response, otherwise: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? otherwise);
  return body;
}

/** Saves the team a run fought with at each round. `against` is the saved team's token when the run was played against one. */
export async function saveTeam(login: string, rounds: Snapshot[], against?: string): Promise<{ token: string; team: SavedTeam }> {
  const body = { login, against, rounds: rounds.map((round) => ({ units: round.units.map((unit) => ({ repo: unit.card.fullName, col: unit.col, row: unit.row })), boosts: round.boosts })) };
  const response = await fetch(`${CARD_ORIGIN}/api/run/team`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return answered(response, "The team couldn't be saved.");
}

export async function openTeam(token: string): Promise<SavedTeam> {
  return answered(await fetch(`${CARD_ORIGIN}/api/run/team?t=${encodeURIComponent(token)}`), "The team couldn't be read.");
}

export const teamLink = (token: string) => `${APP_URL}team?t=${token}`;

/** A round against a saved team: the team as it stood then, and its owner shown as the opponent. */
export function savedRound(saved: SavedTeam, round: number): { opponent: Player; theirs: Unit[] } {
  return { opponent: { login: saved.login, avatarUrl: saved.avatarUrl, character: saved.character, team: saved.fighters }, theirs: savedUnitsAt(saved, round) };
}
