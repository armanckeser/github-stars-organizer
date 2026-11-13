import { readFileSync } from "node:fs";
import path from "node:path";
import { SourceMapConsumer, type RawSourceMap } from "source-map-js";
import type { LongFrame, Recording } from "./instrument.ts";

// Turns what a scenario recorded into the numbers the harness reports.

/** One display refresh at 60 Hz. */
export const FRAME_BUDGET = 1000 / 60;
/**
 * A frame start this much later than the one before missed at least one refresh, or
 * two. Frame starts land on refreshes, so a frame that kept up is 16.7 ms give or take
 * a little jitter; the 20% margin keeps that jitter out of the count.
 */
export const MISSED_ONE = FRAME_BUDGET * 1.2;
export const MISSED_TWO = FRAME_BUDGET * 2.2;

export type FrameStats = {
  seconds: number;
  fps: number;
  /** Time between frame starts, in ms. */
  interval: { p50: number; p95: number; p99: number; max: number };
  /** Frames that came later than one refresh (missed one), or later than two. */
  over16: number;
  over33: number;
  /** The JavaScript a frame's animation callbacks ran, in ms: the board's update and its draw calls. */
  work: { p50: number; p95: number; p99: number; max: number };
  workOver16: number;
  workOver33: number;
  /** The GPU time of the board's frames, in ms, from timer queries. */
  gpu: { p50: number; p95: number; p99: number; max: number };
  commitsPerSecond: number;
  longTasks: number;
  longTaskMs: number;
  /** The scripts that ran longest in long frames, by name, summed over the scenario. */
  longFrameScripts: { source: string; ms: number }[];
};

const percentile = (sorted: number[], share: number) => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]);
const rounded = (value: number) => Math.round(value * 10) / 10;
const spread = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { p50: rounded(percentile(sorted, 0.5)), p95: rounded(percentile(sorted, 0.95)), p99: rounded(percentile(sorted, 0.99)), max: rounded(sorted.at(-1) ?? 0) };
};

function topScripts(frames: LongFrame[], count: number): { source: string; ms: number }[] {
  const bySource = new Map<string, number>();
  for (const frame of frames) for (const script of frame.scripts) bySource.set(`${script.invoker} → ${script.source}`, (bySource.get(`${script.invoker} → ${script.source}`) ?? 0) + script.duration);
  return [...bySource].sort((a, b) => b[1] - a[1]).slice(0, count).map(([source, ms]) => ({ source, ms: Math.round(ms) }));
}

export function summarize(recording: Recording): FrameStats {
  const { frameStarts, frameWork } = recording;
  const intervals = frameStarts.slice(1).map((start, index) => start - frameStarts[index]);
  const seconds = frameStarts.length > 1 ? (frameStarts.at(-1)! - frameStarts[0]) / 1000 : 0;
  return {
    seconds: rounded(seconds),
    fps: rounded(seconds > 0 ? intervals.length / seconds : 0),
    interval: spread(intervals),
    over16: intervals.filter((interval) => interval > MISSED_ONE).length,
    over33: intervals.filter((interval) => interval > MISSED_TWO).length,
    work: spread(frameWork),
    workOver16: frameWork.filter((work) => work > FRAME_BUDGET).length,
    workOver33: frameWork.filter((work) => work > FRAME_BUDGET * 2).length,
    gpu: spread(recording.gpu),
    commitsPerSecond: rounded(seconds > 0 ? recording.commits / seconds : 0),
    longTasks: recording.longTasks.length,
    longTaskMs: Math.round(recording.longTasks.reduce((sum, duration) => sum + duration, 0)),
    longFrameScripts: topScripts(recording.longFrames, 4),
  };
}

// --- the CPU profile, read back through the build's source maps ---

type ProfileNode = { id: number; callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number }; hitCount?: number; children?: number[] };
export type CpuProfile = { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[]; startTime: number; endTime: number };
export type HotFunction = { name: string; at: string; ms: number; share: number };

/** Where a built file's line and column came from, through its source map in `dist`. */
function sourceMaps(dist: string) {
  const consumers = new Map<string, SourceMapConsumer | null>();
  return (url: string): SourceMapConsumer | null => {
    const file = url.split("/").at(-1) ?? "";
    if (consumers.has(file)) return consumers.get(file) ?? null;
    let consumer: SourceMapConsumer | null;
    try {
      consumer = new SourceMapConsumer(JSON.parse(readFileSync(path.join(dist, "assets", `${file}.map`), "utf8")) as RawSourceMap);
    } catch {
      consumer = null;
    }
    consumers.set(file, consumer);
    return consumer;
  };
}

/** Where a profile node's code came from, through the source maps. */
function placeOf(node: ProfileNode, consumerOf: (url: string) => SourceMapConsumer | null): { name: string; source: string; line: number | null } {
  const { functionName, url, lineNumber, columnNumber } = node.callFrame;
  const consumer = url ? consumerOf(url) : null;
  const original = consumer?.originalPositionFor({ line: lineNumber + 1, column: columnNumber });
  const source = original?.source ? original.source.replace(/^(\.\.\/)+/, "") : url.split("/").at(-1) || "(native)";
  return { name: original?.name ?? (functionName || "(anonymous)"), source, line: original?.line ?? null };
}

/**
 * Time charged to the app's own functions, each with everything it called: every sample
 * goes to the nearest frame up its stack that is the app's code (src/ or server/), so
 * the time three.js spends drawing for the board lands on the board's frame.
 */
export function appCallers(profile: CpuProfile, dist: string, count: number): HotFunction[] {
  const consumerOf = sourceMaps(dist);
  const parent = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const owner = new Map<number, string | null>();
  const ownerOf = (id: number): string | null => {
    if (owner.has(id)) return owner.get(id)!;
    const node = nodes.get(id)!;
    const place = placeOf(node, consumerOf);
    const ours = /^(src|server)\//.test(place.source);
    const found = ours ? `${place.name}@${place.source}:${place.line}` : parent.has(id) ? ownerOf(parent.get(id)!) : null;
    owner.set(id, found);
    return found;
  };
  const byOwner = new Map<string, number>();
  let total = 0;
  profile.samples.forEach((id, index) => {
    const ms = (profile.timeDeltas[index] ?? 0) / 1000;
    if (nodes.get(id)?.callFrame.functionName === "(idle)") return;
    total += ms;
    const found = ownerOf(id) ?? "(not the app's code)";
    byOwner.set(found, (byOwner.get(found) ?? 0) + ms);
  });
  return [...byOwner].sort((a, b) => b[1] - a[1]).slice(0, count).map(([key, ms]) => {
    const [name, at] = key.split("@");
    return { name, at: at ?? "", ms: Math.round(ms), share: Math.round((ms / Math.max(1, total)) * 1000) / 10 };
  });
}

/** The functions the main thread spent the most time in (self time), named from the source maps. */
export function hotFunctions(profile: CpuProfile, dist: string, count: number): HotFunction[] {
  const consumerOf = sourceMaps(dist);
  const selfTime = new Map<number, number>();
  profile.samples.forEach((id, index) => selfTime.set(id, (selfTime.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0) / 1000));
  const total = [...selfTime.values()].reduce((sum, ms) => sum + ms, 0);
  const byFunction = new Map<string, { name: string; at: string; ms: number }>();
  for (const node of profile.nodes) {
    const ms = selfTime.get(node.id) ?? 0;
    if (ms === 0) continue;
    const { functionName, url, lineNumber, columnNumber } = node.callFrame;
    const consumer = url ? consumerOf(url) : null;
    const original = consumer?.originalPositionFor({ line: lineNumber + 1, column: columnNumber });
    const source = original?.source ? original.source.replace(/^(\.\.\/)+/, "") : url.split("/").at(-1) || "(native)";
    const name = original?.name ?? (functionName || "(anonymous)");
    const at = original?.line ? `${source}:${original.line}` : source;
    const key = `${name}@${at}`;
    const known = byFunction.get(key) ?? { name, at, ms: 0 };
    known.ms += ms;
    byFunction.set(key, known);
  }
  return [...byFunction.values()].sort((a, b) => b.ms - a.ms).slice(0, count).map((hot) => ({ ...hot, ms: Math.round(hot.ms), share: Math.round((hot.ms / Math.max(1, total)) * 1000) / 10 }));
}
