import { fetchTokenInfo } from "./github-extras";
import { APP_MODE } from "./mode";
import { CARD_ORIGIN } from "./published-list";
import type { GamePlayer, GameState, GameStatus } from "../../server/game";
import type { Side } from "../../server/battle";

// A match played over a GitHub Discussion (issue #47). Reading is public and goes to
// the demo's Worker, which works a match out from its thread. Writing a move means
// posting a comment as the player, so it goes through this install's own server, the
// one that holds their GitHub login. The demo has no such server: it can only watch.

export const CAN_PLAY = APP_MODE !== "demo";

export type Thread = { repo: string; number: number; url: string; title: string; id: string };
export type Match = { thread: Thread; state: GameState };
export type MatchSummary = {
  thread: Thread;
  side: Side;
  opponent: GamePlayer;
  status: GameStatus;
  turn: number;
  yourMove: boolean;
  won: boolean | null;
  reason: string | null;
  lastAt: string | null;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function read<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? fallback);
  return body;
}

/** The GitHub username this install plays as, or null when it can't play. */
export async function playingAs(): Promise<string | null> {
  if (!CAN_PLAY) return null;
  const token = await fetchTokenInfo().catch(() => null);
  return token?.connected ? (token.login ?? null) : null;
}

/** `fresh` skips the few seconds of cache, for right after a move of your own. */
export async function fetchMatch(repo: string, number: number, fresh = false): Promise<Match> {
  const bust = fresh ? `&at=${Date.now()}` : "";
  return read<Match>(await fetch(`${CARD_ORIGIN}/api/game?repo=${encodeURIComponent(repo)}&n=${number}${bust}`), "Couldn't read that match.");
}

export async function fetchMatches(login: string): Promise<MatchSummary[]> {
  return (await read<{ matches: MatchSummary[] }>(await fetch(`${CARD_ORIGIN}/api/games?user=${encodeURIComponent(login)}`), "Couldn't read your matches.")).matches;
}

async function send<T>(path: string, body: unknown): Promise<T> {
  const url = APP_MODE === "local" ? `/api/local/game/${path}` : `${API_URL}/api/game/${path}`;
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return read<T>(response, "GitHub didn't take that. Try again.");
}

/** Challenges someone: the Worker writes the opening post with both teams signed, and this install posts it. */
export async function challenge(me: string, opponent: string): Promise<{ repo: string; number: number; url: string }> {
  const opening = await read<{ title: string; body: string }>(
    await fetch(`${CARD_ORIGIN}/api/game/new?a=${encodeURIComponent(me)}&b=${encodeURIComponent(opponent)}`),
    "Couldn't set up the challenge.",
  );
  return send("challenge", opening);
}

export async function postComment(thread: Thread, body: string): Promise<{ id: string; url: string }> {
  return send("comment", { repo: thread.repo, number: thread.number, body });
}
