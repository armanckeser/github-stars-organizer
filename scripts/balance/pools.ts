import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Pool, RunFighter } from "../../server/run/rules.ts";
import { cardFor, type CardFacts } from "../../server/run/stats.ts";

// Real pools for the balance scripts: what the Worker's GET /api/run/pool?login=<login>
// answers, saved as JSON. Each card is made again from its repo's facts with today's
// rules, so a rule change shows in the numbers without a new read.

type PoolFile = { login: string; team: RunFighter[]; facts: { readAt: string; repos: CardFacts[] } };

export function loadPool(path: string): Pool<RunFighter> {
  const file = JSON.parse(readFileSync(path, "utf8")) as PoolFile;
  const readAt = Date.parse(file.facts.readAt);
  const team = file.team.map((fighter, i): RunFighter => {
    const card = cardFor(file.facts.repos[i], readAt);
    return { ...fighter, hp: card.hp, attack: card.attack, defense: card.guard, speed: card.speed, card };
  });
  return { login: file.login || basename(path, ".json"), team };
}

/** The player's pool file first, then the opponents' (`node <script> pool.json p-*.json`). */
export function poolsFromArguments(): { player: Pool<RunFighter>; opponents: Map<string, Pool<RunFighter>> } | null {
  const [player, ...opponents] = process.argv.slice(2);
  if (!player) return null;
  return { player: loadPool(player), opponents: new Map(opponents.map((path) => loadPool(path)).map((pool) => [pool.login.toLowerCase(), pool])) };
}
