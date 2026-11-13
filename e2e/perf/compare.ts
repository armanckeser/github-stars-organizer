import { readFileSync } from "node:fs";
import path from "node:path";
import { RESULTS, type FrameStats } from "./summary.ts";

// Prints two perf runs side by side, scenario by scenario, as a markdown table:
//   npx tsx e2e/perf/compare.ts before after [desktop|phone]
// `before` and `after` are PERF_LABEL values; the files are perf-results/<label>-<device>.json.

type Run = { rounds: number; outcomes: string[]; scenarios: { name: string; round: number; stats: FrameStats }[]; snapshots: { round: number; when: string; heapMb: number; render: { calls: number; triangles: number; geometries: number; textures: number } }[] };

const read = (label: string, device: string): Run => JSON.parse(readFileSync(path.join(RESULTS, `${label}-${device}.json`), "utf8")) as Run;

/** A scenario's frames over every round it was played in, merged by the worst of each. */
function merged(run: Run, name: string): FrameStats | null {
  const all = run.scenarios.filter((scenario) => scenario.name === name).map((scenario) => scenario.stats);
  if (all.length === 0) return null;
  const seconds = all.reduce((sum, stats) => sum + stats.seconds, 0);
  return {
    ...all[0],
    seconds,
    fps: Math.round((all.reduce((sum, stats) => sum + stats.fps * stats.seconds, 0) / Math.max(seconds, 0.001)) * 10) / 10,
    interval: { p50: Math.max(...all.map((stats) => stats.interval.p50)), p95: Math.max(...all.map((stats) => stats.interval.p95)), p99: Math.max(...all.map((stats) => stats.interval.p99)), max: Math.max(...all.map((stats) => stats.interval.max)) },
    over16: all.reduce((sum, stats) => sum + stats.over16, 0),
    over33: all.reduce((sum, stats) => sum + stats.over33, 0),
    work: { p50: Math.max(...all.map((stats) => stats.work.p50)), p95: Math.max(...all.map((stats) => stats.work.p95)), p99: Math.max(...all.map((stats) => stats.work.p99)), max: Math.max(...all.map((stats) => stats.work.max)) },
    commitsPerSecond: Math.max(...all.map((stats) => stats.commitsPerSecond)),
    longTasks: all.reduce((sum, stats) => sum + stats.longTasks, 0),
    longTaskMs: all.reduce((sum, stats) => sum + stats.longTaskMs, 0),
  };
}

const cell = (stats: FrameStats | null) => (stats ? `${stats.fps} fps, p95 ${stats.interval.p95} / p99 ${stats.interval.p99} / max ${Math.round(stats.interval.max)} ms, ${stats.over16} missed (${stats.over33} >2), JS p95 ${stats.work.p95} ms, ${stats.commitsPerSecond} commits/s, ${stats.longTasks} long (${stats.longTaskMs} ms)` : "-");

const [before, after, only] = process.argv.slice(2);
for (const device of only ? [only] : ["desktop", "phone"]) {
  const old = read(before, device);
  const now = read(after, device);
  console.log(`\n### ${device}: ${before} (${old.rounds} rounds) → ${after} (${now.rounds} rounds)\n`);
  console.log(`| Scenario | ${before} | ${after} |\n|---|---|---|`);
  const names = [...new Set([...old.scenarios, ...now.scenarios].map((scenario) => scenario.name))];
  for (const name of names) console.log(`| ${name} | ${cell(merged(old, name))} | ${cell(merged(now, name))} |`);
  const ends = (run: Run) => [run.snapshots[0], run.snapshots.find((snapshot) => snapshot.when === "end")!];
  for (const [label, run] of [[before, old], [after, now]] as const) {
    const [first, last] = ends(run);
    console.log(`\n${label}: heap ${first.heapMb} → ${last.heapMb} MB; draw calls ${first.render.calls} → ${last.render.calls}; triangles ${first.render.triangles} → ${last.render.triangles}; geometries ${first.render.geometries} → ${last.render.geometries}; textures ${first.render.textures} → ${last.render.textures}`);
  }
}
