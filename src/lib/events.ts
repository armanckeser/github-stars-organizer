import { EVENT_PATH, type BrowserEvent, type EventBody } from "../../server/events";
import { CARD_ORIGIN } from "./published-list";

// The Play screen's counters (server/events.ts), sent to the Worker as beacons. Only the
// public demo counts: a self-hosted build never sends anything anywhere.

/** The site that sent the visitor here, as a host name; "" when there is none or it can't be read. */
function referringHost(): string {
  try {
    return document.referrer ? new URL(document.referrer).hostname : "";
  } catch {
    return "";
  }
}

/** Counts one step of a run. `from` is sent with `run_started` only, the step a visit begins with. */
export function countEvent(event: BrowserEvent, round?: number): void {
  if (import.meta.env.VITE_DEMO !== "1") return;
  const body: EventBody = { event, round, from: event === "run_started" ? referringHost() : undefined };
  // A string goes as text/plain, which needs no preflight; a lost beacon is a lost count, never an error.
  navigator.sendBeacon?.(`${CARD_ORIGIN}${EVENT_PATH}`, JSON.stringify(body));
}
