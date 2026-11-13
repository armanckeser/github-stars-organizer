import { afterEach, describe, expect, it, vi } from "vitest";
import { countEvent } from "./events";
import { CARD_ORIGIN } from "./published-list";

// The Play screen's counters. The beacon is the browser's boundary, recorded here.

type Beacon = { url: string; body: unknown };

function recordBeacons(referrer: string): Beacon[] {
  const sent: Beacon[] = [];
  vi.stubGlobal("navigator", { sendBeacon: (url: string, body: string) => sent.push({ url, body: JSON.parse(body) }) > 0 });
  vi.stubGlobal("document", { referrer });
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("countEvent", () => {
  it("sends nothing from a self-hosted build", () => {
    // Regression guarded: a self-hosted install phoning home to the public demo's Worker.
    const sent = recordBeacons("https://news.ycombinator.com/item?id=1");
    vi.stubEnv("VITE_DEMO", "");
    countEvent("run_started");
    countEvent("round_reached", 2);
    expect(sent).toEqual([]);
  });

  it("sends a run start from the public demo with the host of the site it came from", () => {
    const sent = recordBeacons("https://news.ycombinator.com/item?id=1");
    vi.stubEnv("VITE_DEMO", "1");
    countEvent("run_started");
    expect(sent).toEqual([{ url: `${CARD_ORIGIN}/api/event`, body: { event: "run_started", from: "news.ycombinator.com" } }]);
  });

  it("sends where a visit came from with the run start only", () => {
    // Regression guarded: the referring site on every round, which says nothing more and follows the player through the run.
    const sent = recordBeacons("https://news.ycombinator.com/item?id=1");
    vi.stubEnv("VITE_DEMO", "1");
    countEvent("round_reached", 3);
    expect(sent).toEqual([{ url: `${CARD_ORIGIN}/api/event`, body: { event: "round_reached", round: 3 } }]);
  });

  it("sends an empty site when the visit came from nowhere", () => {
    const sent = recordBeacons("");
    vi.stubEnv("VITE_DEMO", "1");
    countEvent("run_started");
    expect(sent).toEqual([{ url: `${CARD_ORIGIN}/api/event`, body: { event: "run_started", from: "" } }]);
  });
});
