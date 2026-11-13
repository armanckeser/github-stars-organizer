import { afterEach, describe, expect, it, vi } from "vitest";
import { callWorker, memoryDataset } from "./worker-host.test-helper.ts";

// The launch counters: the Play screen's beacons, checked and written to the Analytics
// Engine dataset, which is faked in memory at the binding (`memoryDataset`).

// The share picture's assets are bundled by wrangler and can't load in Node; nothing here draws a picture.
vi.mock("@resvg/resvg-wasm/index_bg.wasm", () => ({ default: new Uint8Array() }));
vi.mock("./SpaceGrotesk-Bold.ttf", () => ({ default: new ArrayBuffer(0) }));

afterEach(() => vi.unstubAllGlobals());

const HOST = "stars-demo.example";

describe("POST /api/event", () => {
  it("writes the event, the site the run came from and the host, and nothing about the player", async () => {
    // Regression guarded: a run start that reached the Worker but was never written, so the launch had no numbers.
    const events = memoryDataset();
    const { status } = await callWorker("/api/event", { event: "run_started", from: "news.ycombinator.com" }, { EVENTS: events });
    expect(status).toBe(204);
    expect(events.points).toEqual([{ blobs: ["run_started", "news.ycombinator.com", HOST], doubles: [0], indexes: ["run_started"] }]);
  });

  it("keeps the round a run reached", async () => {
    const events = memoryDataset();
    await callWorker("/api/event", { event: "round_reached", round: 2 }, { EVENTS: events });
    expect(events.points).toEqual([{ blobs: ["round_reached", "", HOST], doubles: [2], indexes: ["round_reached"] }]);
  });

  it.each([
    ["an unknown event", { event: "steal_cookies" }, "Not an event Stard counts."],
    ["an event only the Worker counts", { event: "team_saved" }, "Not an event Stard counts."],
    ["a round below 1", { event: "round_reached", round: 0 }, "A round is 1 to 20."],
    ["a round past 20", { event: "round_reached", round: 21 }, "A round is 1 to 20."],
    ["a round that isn't whole", { event: "round_reached", round: 2.5 }, "A round is 1 to 20."],
    ["a page address as the site", { event: "run_started", from: "news.ycombinator.com/item?id=1" }, "Where a run came from is a host name."],
    ["markup as the site", { event: "run_started", from: "<script>" }, "Where a run came from is a host name."],
    ["a body that isn't an object", "run_started", "An event is a JSON object."],
  ])("refuses %s and writes nothing", async (_case, body, error) => {
    const events = memoryDataset();
    const reply = await callWorker("/api/event", body, { EVENTS: events });
    expect(reply.status).toBe(400);
    expect(reply.body.error).toBe(error);
    expect(events.points).toEqual([]);
  });

  it("answers a Worker without the dataset the same, so a self-hosted Worker needs no setup", async () => {
    const { status } = await callWorker("/api/event", { event: "run_finished", round: 7 });
    expect(status).toBe(204);
  });

  it("refuses a read", async () => {
    const events = memoryDataset();
    const { status } = await callWorker("/api/event", undefined, { EVENTS: events });
    expect(status).toBe(405);
    expect(events.points).toEqual([]);
  });
});
