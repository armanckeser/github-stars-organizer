// The launch numbers, one row per day: the counters the Worker writes to Workers
// Analytics Engine (worker/src/events.ts), next to the repo's new stars on GitHub.
//
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node scripts/stard-counts.mjs [days]
//
// The token is a custom one with "Account | Account Analytics | Read". Stars come from
// `gh api` as whoever gh is signed in as (the repo is public); GH=<path> picks the gh to run.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DATASET = "stard_events";
const REPO = "armanckeser/github-stars-organizer";
const DEFAULT_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The table's columns, left to right, each a count of one event (and round). */
export const COLUMNS = [
  { title: "Runs", event: "run_started" },
  { title: "Round 2", event: "round_reached", round: 2 },
  { title: "Finished", event: "run_finished" },
  { title: "Links saved", event: "team_saved" },
  { title: "Links opened", event: "team_opened" },
  { title: "Challenges copied", event: "challenge_copied" },
  { title: "Challenges started", event: "challenge_started" },
];

/** Every event per day and round. A point stands for `_sample_interval` points once Cloudflare samples. */
export const countsQuery = (days) =>
  `SELECT formatDateTime(timestamp, '%Y-%m-%d') AS day, blob1 AS event, double1 AS round, sum(_sample_interval) AS n
FROM ${DATASET}
WHERE timestamp > NOW() - INTERVAL '${days}' DAY
GROUP BY day, event, round
ORDER BY day
FORMAT JSON`;

/**
 * The SQL API's JSON answer as counts per day and column title. Numbers can arrive as
 * text (ClickHouse writes 64-bit integers as strings), so each is read with Number.
 * @param {{ data: { day: string; event: string; round: number | string; n: number | string }[] }} answer
 * @returns {Map<string, Record<string, number>>}
 */
export function countsByDay(answer) {
  const days = new Map();
  for (const row of answer.data) {
    const column = COLUMNS.find((each) => each.event === row.event && (each.round === undefined || each.round === Number(row.round)));
    if (!column) continue;
    const counts = days.get(row.day) ?? {};
    counts[column.title] = (counts[column.title] ?? 0) + Number(row.n);
    days.set(row.day, counts);
  }
  return days;
}

/**
 * New stars per day, from the `starred_at` times GitHub gives with the star+json media type.
 * @param {string[]} starredAt
 * @returns {Map<string, number>}
 */
export function starsByDay(starredAt) {
  const days = new Map();
  for (const time of starredAt) days.set(time.slice(0, 10), (days.get(time.slice(0, 10)) ?? 0) + 1);
  return days;
}

/**
 * One row per day from `first` to `last` (YYYY-MM-DD, UTC), a day with nothing counted as zeros.
 * @param {Map<string, Record<string, number>>} counts
 * @param {Map<string, number> | null} stars null when GitHub couldn't be read
 */
export function table(counts, stars, first, last) {
  const titles = [...COLUMNS.map((column) => column.title), "Stars"];
  const rows = [];
  for (let day = new Date(`${first}T00:00:00Z`); day.toISOString().slice(0, 10) <= last; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    const counted = counts.get(date) ?? {};
    rows.push([date, ...COLUMNS.map((column) => String(counted[column.title] ?? 0)), stars ? String(stars.get(date) ?? 0) : "?"]);
  }
  const header = ["Day", ...titles];
  const widths = header.map((title, i) => Math.max(title.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => cells.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join("  ");
  return [line(header), ...rows.map(line)].join("\n");
}

async function readCounts(days) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw new Error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Account Analytics: Read).");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: countsQuery(days),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Cloudflare answered ${response.status}: ${text}`);
  return JSON.parse(text);
}

function readStars() {
  try {
    const output = execFileSync(process.env.GH ?? "gh", ["api", "-H", "Accept: application/vnd.github.star+json", `repos/${REPO}/stargazers`, "--paginate", "--jq", ".[].starred_at"], { encoding: "utf8" });
    return starsByDay(output.split("\n").filter(Boolean));
  } catch (error) {
    console.error(`Stars couldn't be read from GitHub (${error.message.split("\n")[0]}).`);
    return null;
  }
}

async function main() {
  const days = Number(process.argv[2] ?? DEFAULT_DAYS);
  const last = new Date().toISOString().slice(0, 10);
  const first = new Date(Date.now() - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  const counts = countsByDay(await readCounts(days));
  console.log(table(counts, readStars(), first, last));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
