// The counters behind the launch numbers (scripts/stard-counts.mjs): one name per step
// of the funnel, written to Cloudflare Workers Analytics Engine by worker/src/events.ts.
// A count is the event, the site a run came from, and the host it was played on. Never
// a username, an IP address or a user agent.

/** Counted by the Worker itself, where the step happens: a team saved, a team link opened. */
export const WORKER_EVENTS = ["team_saved", "team_opened"] as const;

/** Sent by the Play screen (src/lib/events.ts), which plays the run in the browser. */
export const BROWSER_EVENTS = ["run_started", "round_reached", "run_finished", "challenge_copied", "challenge_started", "reply_copied"] as const;

export const EVENTS = [...BROWSER_EVENTS, ...WORKER_EVENTS] as const;

export type StardEvent = (typeof EVENTS)[number];
export type BrowserEvent = (typeof BROWSER_EVENTS)[number];

/** What the Play screen posts to /api/event, as text so `sendBeacon` needs no preflight. */
export type EventBody = { event: BrowserEvent; round?: number; from?: string };

export const EVENT_PATH = "/api/event";

// A draw counts for neither side, so a run can go past its 7th round; the Worker's
// replay of a run is bounded the same (worker/src/team.ts).
export const MAX_COUNTED_ROUND = 20;
