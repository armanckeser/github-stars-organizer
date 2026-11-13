import { describe, expect, it } from "vitest";
import { countsByDay, countsQuery, starsByDay, table } from "./stard-counts.mjs";

// The daily launch report. The answer below is shaped as the Analytics Engine SQL API's
// FORMAT JSON documents it (meta, data, rows), with 64-bit sums as text the way ClickHouse writes them.
const ANSWER = {
  meta: [{ name: "day", type: "String" }, { name: "event", type: "String" }, { name: "round", type: "Float64" }, { name: "n", type: "UInt64" }],
  data: [
    { day: "2026-11-15", event: "run_started", round: 0, n: "120" },
    { day: "2026-11-15", event: "round_reached", round: 1, n: "118" },
    { day: "2026-11-15", event: "round_reached", round: 2, n: "97" },
    { day: "2026-11-15", event: "round_reached", round: 3, n: "80" },
    { day: "2026-11-15", event: "run_finished", round: 7, n: "41" },
    { day: "2026-11-15", event: "run_finished", round: 5, n: "12" },
    { day: "2026-11-15", event: "team_saved", round: 0, n: "50" },
    { day: "2026-11-16", event: "team_opened", round: 0, n: "9" },
    { day: "2026-11-16", event: "challenge_copied", round: 0, n: 4 },
    { day: "2026-11-16", event: "an_event_from_later", round: 0, n: "3" },
  ],
  rows: 10,
};

describe("the launch report", () => {
  it("counts round 2 apart from the other rounds, and adds up a finish's rounds", () => {
    // Regression guarded: "Round 2" summing every round reached, which reads as more people getting past round 1 than did.
    expect(countsByDay(ANSWER)).toEqual(new Map([
      ["2026-11-15", { Runs: 120, "Round 2": 97, Finished: 53, "Links saved": 50 }],
      ["2026-11-16", { "Links opened": 9, "Challenges copied": 4 }],
    ]));
  });

  it("counts nothing from an answer with no rows", () => {
    expect(countsByDay({ meta: [], data: [], rows: 0 })).toEqual(new Map());
  });

  it("counts new stars by the UTC day they were given", () => {
    expect(starsByDay(["2026-11-15T13:00:00Z", "2026-11-15T23:59:59Z", "2026-11-16T00:00:01Z"])).toEqual(new Map([["2026-11-15", 2], ["2026-11-16", 1]]));
  });

  it("prints every day, zeros on a quiet one, and ? for stars GitHub didn't give", () => {
    expect(table(countsByDay(ANSWER), null, "2026-11-14", "2026-11-16")).toBe([
      "Day         Runs  Round 2  Finished  Links saved  Links opened  Challenges copied  Challenges started  Stars",
      "2026-11-14     0        0         0            0             0                  0                   0      ?",
      "2026-11-15   120       97        53           50             0                  0                   0      ?",
      "2026-11-16     0        0         0            0             9                  4                   0      ?",
    ].join("\n"));
  });

  it("asks for the last days only, with the dataset the Worker writes to", () => {
    expect(countsQuery(14)).toContain("FROM stard_events\nWHERE timestamp > NOW() - INTERVAL '14' DAY");
  });
});
