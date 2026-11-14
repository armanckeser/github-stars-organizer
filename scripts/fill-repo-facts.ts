// The fill (.github/workflows/fill-repo-facts.yml) reads repo facts with the Action's own
// GitHub token, which has 1,000 points an hour of its own, and keeps them in the Worker's
// D1 table. Players' pools then find them there and spend none of the Worker's 5,000.
// It first reads again what players have seen, oldest first, before it expires; then the
// most-starred repos on GitHub that aren't kept yet; and stops when its points run low.
//
//   GITHUB_TOKEN=... CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx tsx scripts/fill-repo-facts.ts

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { FACTS_KEPT_FOR, gql, readFacts, type FactsNode } from "../worker/src/battle.ts";
import { busyUntil } from "../worker/src/github-budget.ts";
import { KEEP_FACTS } from "../worker/src/repo-facts.ts";

const DAY = 24 * 3600 * 1000;
// The fill runs every 6 hours, so a row read over 5 days ago is read again before it expires.
const READ_AGAIN_AFTER = FACTS_KEPT_FOR - 2 * DAY;
// GitHub's search finds at most 1,000 repos for a query.
const MOST_STARRED = 1000;
// Ten queries of four side by side, then the next ten.
const PER_ROUND = 40;

const sqlText = (text: string) => `'${text.replaceAll("'", "''")}'`;

/** KEEP_FACTS for each of `nodes`, as SQL statements for `wrangler d1 execute --file`. */
export function keepFactsSql(nodes: FactsNode[], readAt: number): string {
  return nodes.map((node) => `${KEEP_FACTS.replace("?, ?, ?", `${sqlText(node.nameWithOwner.toLowerCase())}, ${sqlText(JSON.stringify(node))}, ${readAt}`)};`).join("\n");
}

/** What to read, in order: kept rows older than `readAgainBefore`, oldest first, then `starred` not kept yet. */
export function fillOrder(kept: { name: string; read_at: number }[], starred: string[], readAgainBefore: number): string[] {
  const old = kept.filter((row) => row.read_at < readAgainBefore).sort((a, b) => a.read_at - b.read_at).map((row) => row.name);
  const known = new Set(kept.map((row) => row.name));
  return [...old, ...starred.filter((name) => !known.has(name.toLowerCase()))];
}

function d1(...args: string[]): string {
  return execFileSync("npx", ["wrangler", "d1", "execute", "stard", "--remote", ...args], { cwd: "worker", encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

type SearchPage = { search: { nodes: { nameWithOwner?: string }[]; pageInfo: { endCursor: string | null; hasNextPage: boolean } } };

async function mostStarred(token: string): Promise<string[]> {
  const names: string[] = [];
  let after: string | null = null;
  while (names.length < MOST_STARRED) {
    const cursor = after ? `, after: ${JSON.stringify(after)}` : "";
    const page: SearchPage = await gql<SearchPage>(token, `query { search(query: "stars:>1000 sort:stars-desc", type: REPOSITORY, first: 100${cursor}) { nodes { ... on Repository { nameWithOwner } } pageInfo { endCursor hasNextPage } } }`);
    names.push(...page.search.nodes.flatMap((node) => node.nameWithOwner ?? []));
    if (!page.search.pageInfo.hasNextPage) break;
    after = page.search.pageInfo.endCursor;
  }
  return names;
}

async function fill() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set.");
  const now = Date.now();
  const kept = (JSON.parse(d1("--json", "--command", "SELECT name, read_at FROM repo_facts")) as { results: { name: string; read_at: number }[] }[])[0].results;
  const order = fillOrder(kept, await mostStarred(token), now - READ_AGAIN_AFTER);
  const read: FactsNode[] = [];
  for (let i = 0; i < order.length && busyUntil(Date.now()) === null; i += PER_ROUND) {
    read.push(...(await readFacts(token, order.slice(i, i + PER_ROUND)).catch((error) => (console.error(error), []))));
  }
  console.log(`${kept.length} repos kept, ${order.length} to read, ${read.length} read.`);
  if (read.length === 0) return;
  const file = join(mkdtempSync(join(tmpdir(), "fill-")), "facts.sql");
  writeFileSync(file, keepFactsSql(read, now));
  d1("--file", file);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await fill();
