import { describe, expect, test } from "vitest";
import { battle, drawFromStars, fieldTeam, fighterFor, instantSeed, matchup, seededRandom, typeOf, type Fighter, type RepoFacts } from "./battle.ts";

const NOW = Date.parse("2026-11-10T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function facts(fullName: string, extra: Partial<RepoFacts> = {}): RepoFacts {
  return {
    fullName, description: "A tool", stars: 5000, forks: 300, language: "TypeScript", color: "#3178c6", avatarUrl: null,
    isArchived: false, createdAt: daysAgo(365 * 4 + 30), pushedAt: daysAgo(3), openIssues: 50, closedIssues: 450,
    releases: 12, contributors: 40, commits: 2000, ...extra,
  };
}

const fighter = (fullName: string, extra: Partial<RepoFacts> = {}, player = "nobody") => fighterFor(facts(fullName, extra), player, NOW);

describe("cards", () => {
  test("a language gives a type, and an unknown one is docs", () => {
    expect(typeOf("Rust")).toBe("systems");
    expect(typeOf("Python")).toBe("data");
    expect(typeOf("Markdown")).toBe("docs");
    expect(typeOf(null)).toBe("docs");
  });

  test("each type beats the next round the ring, and docs has no edge", () => {
    expect(matchup("systems", "scripts")).toBe(1);
    expect(matchup("scripts", "systems")).toBe(-1);
    expect(matchup("data", "systems")).toBe(1);
    expect(matchup("systems", "web")).toBe(0);
    expect(matchup("docs", "web")).toBe(0);
    expect(matchup("web", "docs")).toBe(0);
  });

  test("level follows the log of the stars and stays between 1 and 100", () => {
    expect(fighter("a/b", { stars: 0 }).level).toBe(1);
    expect(fighter("a/b", { stars: 999 }).level).toBe(60);
    expect(fighter("a/b", { stars: 400_000 }).level).toBe(100);
  });

  test("a repo pushed lately hits harder and moves faster than a quiet one", () => {
    const live = fighter("a/live");
    const quiet = fighter("a/quiet", { pushedAt: daysAgo(900) });
    expect(live.attack).toBeGreaterThan(quiet.attack);
    expect(live.speed).toBeGreaterThan(quiet.speed);
    expect(live.hp).toBe(quiet.hp);
  });

  test("a repo that closes its issues defends better", () => {
    expect(fighter("a/b", { openIssues: 10, closedIssues: 990 }).defense).toBeGreaterThan(fighter("a/b", { openIssues: 990, closedIssues: 10 }).defense);
  });

  test("more contributors mean more HP, more commits more attack, and age more defense", () => {
    expect(fighter("a/b", { contributors: 900 }).hp).toBeGreaterThan(fighter("a/b", { contributors: 2 }).hp);
    expect(fighter("a/b", { commits: 15_000 }).attack).toBeGreaterThan(fighter("a/b", { commits: 30 }).attack);
    expect(fighter("a/b", { createdAt: daysAgo(365 * 9) }).defense).toBeGreaterThan(fighter("a/b", { createdAt: daysAgo(40) }).defense);
    expect(fighter("a/b").age).toBe(4);
  });

  test("a card names its weakness and resistance from the ring, and docs has neither", () => {
    const web = fighter("a/b");
    expect([web.type, web.weakness, web.resistance]).toEqual(["web", "scripts", "apps"]);
    const docs = fighter("a/b", { language: null });
    expect([docs.weakness, docs.resistance]).toEqual([null, null]);
  });

  test("the everyday move comes from the type and the special from what the repo is best at", () => {
    expect(fighter("a/b").moves[0].name).toBe("Hot Reload");
    expect(fighter("a/b", { stars: 90_000, forks: 10, commits: 50, contributors: 3, releases: 0, pushedAt: daysAgo(500) }).moves[1].name).toBe("Star Storm");
    expect(fighter("a/b", { stars: 30, releases: 40 }).moves[1].name).toBe("Ship It");
    const card = fighter("a/b");
    expect(card.moves[1].damage).toBeGreaterThan(card.moves[0].damage);
  });

  test("health runs from 0 to 10 and an archived repo has none", () => {
    const health = fighter("a/b").health;
    expect(health).toBeGreaterThan(5);
    expect(health).toBeLessThanOrEqual(10);
    expect(fighter("a/b", { isArchived: true }).health).toBe(0);
  });

  test("an armanckeser repo is shiny and stronger for every player; an archived one is retired and weaker", () => {
    const plain = fighter("octo/tool");
    const shiny = fighter("Armanckeser/tool", {}, "octo");
    const retired = fighter("octo/tool", { isArchived: true });
    expect(shiny.shiny).toBe(true);
    expect(plain.shiny).toBe(false);
    expect(shiny.hp).toBeGreaterThan(plain.hp);
    expect(shiny.attack).toBeGreaterThan(plain.attack);
    expect(retired.retired).toBe(true);
    expect(retired.attack).toBeLessThan(plain.attack);
  });

  test("a repo the player owns is home, not shiny, with the same numbers", () => {
    const plain = fighter("octo/tool");
    const home = fighter("Octo/tool", {}, "octo");
    expect(home.home).toBe(true);
    expect(plain.home).toBe(false);
    expect(home.shiny).toBe(false);
    expect([home.hp, home.attack, home.defense, home.speed]).toEqual([plain.hp, plain.attack, plain.defense, plain.speed]);
  });

  test("armanckeser's own repo is both home and shiny for armanckeser", () => {
    const own = fighter("armanckeser/stard", {}, "ArmancKeser");
    expect([own.home, own.shiny]).toEqual([true, true]);
  });
});

describe("drawing from stars", () => {
  const stars = ["a/1", "a/2", "a/3", "a/4", "a/5", "a/6"];

  test("is the same for the same seed and differs between seeds", () => {
    expect(drawFromStars(stars, [], 3, "octo|2026-11-10")).toEqual(drawFromStars(stars, [], 3, "octo|2026-11-10"));
    const days = new Set(Array.from({ length: 12 }, (_, day) => drawFromStars(stars, [], 1, `octo|${day}`)[0]));
    expect(days.size).toBeGreaterThan(1);
  });

  test("never draws a repo twice or one that is already on the team", () => {
    const drawn = drawFromStars(stars, ["A/1", "a/2"], 10, "seed");
    expect(drawn).toHaveLength(4);
    expect(new Set(drawn).size).toBe(4);
    expect(drawn).not.toContain("a/1");
    expect(drawn).not.toContain("a/2");
    expect(drawFromStars([], [], 2, "seed")).toEqual([]);
  });
});

describe("classes", () => {
  const plain = (extra: Partial<RepoFacts> = {}, name = "octo/tool") => fighterFor(facts(name, extra), "nobody", NOW);
  const withClass = (klass: Parameters<typeof fighterFor>[3], extra: Partial<RepoFacts> = {}, name = "octo/tool", player = "nobody") =>
    fighterFor(facts(name, extra), player, NOW, klass);

  test("a rookie changes nothing", () => {
    expect(withClass("rookie")).toEqual(plain());
    expect(plain().perk).toBe(false);
  });

  test("a maintainer's own repos are stronger still, and other repos are not", () => {
    const own = withClass("maintainer", {}, "octo/tool", "octo");
    expect(own.perk).toBe(true);
    expect(own.attack).toBeGreaterThan(fighterFor(facts("octo/tool"), "octo", NOW).attack);
    expect(withClass("maintainer")).toEqual(plain());
  });

  test("a scout's small repos are stronger", () => {
    expect(withClass("scout", { stars: 300 }).hp).toBeGreaterThan(plain({ stars: 300 }).hp);
    expect(withClass("scout", { stars: 3000 })).toEqual(plain({ stars: 3000 }));
  });

  test("a veteran's old repos have more HP and defense, and the same attack", () => {
    const old = { createdAt: daysAgo(365 * 9) };
    expect(withClass("veteran", old).hp).toBeGreaterThan(plain(old).hp);
    expect(withClass("veteran", old).defense).toBeGreaterThan(plain(old).defense);
    expect(withClass("veteran", old).attack).toBe(plain(old).attack);
    expect(withClass("veteran").perk).toBe(false);
  });

  test("an archivist's archived repos fight at full strength", () => {
    const archived = { isArchived: true };
    expect(withClass("archivist", archived).attack).toBe(plain().attack);
    expect(plain(archived).attack).toBeLessThan(plain().attack);
  });

  test("a collector's team of all different types is stronger, and a team with a repeat is not", () => {
    const mixed = [facts("a/1", { language: "Rust" }), facts("a/2", { language: "Python" }), facts("a/3")];
    const repeat = [facts("a/1"), facts("a/2", { language: "Python" }), facts("a/3")];
    const team = fieldTeam(mixed, "nobody", "collector", NOW);
    expect(team.every((f) => f.perk)).toBe(true);
    expect(team[0].hp).toBeGreaterThan(fighterFor(mixed[0], "nobody", NOW).hp);
    expect(fieldTeam(repeat, "nobody", "collector", NOW).some((f) => f.perk)).toBe(false);
  });

  test("a specialist's three cards of one type hit harder, and the odd one out does not", () => {
    const team = fieldTeam([facts("a/1"), facts("a/2"), facts("a/3"), facts("a/4", { language: "Rust" })], "nobody", "specialist", NOW);
    expect(team.map((f) => f.perk)).toEqual([true, true, true, false]);
    expect(team[0].attack).toBeGreaterThan(fighterFor(facts("a/1"), "nobody", NOW).attack);
    expect(team[0].moves[0].damage).toBeGreaterThanOrEqual(fighterFor(facts("a/1"), "nobody", NOW).moves[0].damage);
    expect(team[0].hp).toBe(fighterFor(facts("a/1"), "nobody", NOW).hp);
  });
});

describe("the fight", () => {
  const teamA = [fighter("a/one", { language: "Rust" }), fighter("a/two", { stars: 80_000 })];
  const teamB = [fighter("b/one", { language: "Shell" }), fighter("b/two", { stars: 200, pushedAt: daysAgo(700) })];

  test("the same teams and seed give the same fight", () => {
    expect(battle(teamA, teamB, "seed")).toEqual(battle(teamA, teamB, "seed"));
    expect(seededRandom("x")()).toBe(seededRandom("x")());
    expect(seededRandom("x")()).not.toBe(seededRandom("y")());
  });

  test("ends with one side out and says who is left standing", () => {
    const result = battle(teamA, teamB, "seed");
    expect(result.winner).toBe("a");
    expect(result.standing.b).toBe(0);
    expect(result.standing.a).toBeGreaterThan(0);
    expect(result.events.filter((e) => e.knockedOut && e.side === "a")).toHaveLength(2);
    const last = result.events[result.events.length - 1];
    expect(last.knockedOut).toBe(true);
  });

  test("HP only goes down, and a knocked-out card never hits again", () => {
    const { events } = battle(teamA, teamB, "another seed");
    const gone = new Set<string>();
    const hp = new Map<string, number>();
    for (const e of events) {
      const other = e.side === "a" ? "b" : "a";
      expect(gone.has(`${e.side}${e.attacker}`)).toBe(false);
      const key = `${other}${e.target}`;
      expect(e.targetHp).toBeLessThan(hp.get(key) ?? Infinity);
      hp.set(key, e.targetHp);
      if (e.knockedOut) gone.add(key);
    }
  });

  test("a card's every third hit is its special move", () => {
    const tank = { ...fighter("b/tank"), hp: 100_000, speed: 0 };
    const hits = battle([{ ...fighter("a/x"), speed: 999 }], [tank], "s").events.filter((e) => e.side === "a").slice(0, 6);
    expect(hits.map((e) => e.special)).toEqual([false, false, true, false, false, true]);
    expect(hits[2].move).toBe(fighter("a/x").moves[1].name);
    expect(hits[0].move).toBe("Hot Reload");
  });

  test("the type with the edge does more damage, all else equal", () => {
    const hit = (attacker: Fighter, target: Fighter) => battle([attacker], [{ ...target, speed: 0, hp: 100_000 }], "s").events.find((e) => e.side === "a")!;
    const systems = { ...fighter("a/x", { language: "Rust" }), speed: 999 };
    const strong = hit(systems, fighter("b/x", { language: "Shell" }));
    const weak = hit(systems, fighter("b/x", { language: "Python" }));
    expect(strong.matchup).toBe(1);
    expect(weak.matchup).toBe(-1);
    expect(strong.damage).toBeGreaterThan(weak.damage);
  });

  test("an empty team loses, and two empty teams have no winner", () => {
    expect(battle(teamA, [], "s").winner).toBe("a");
    expect(battle([], [], "s")).toEqual({ winner: null, events: [], standing: { a: 0, b: 0 } });
  });

  test("the instant seed is the same all day and changes with the teams", () => {
    const a = { login: "Octo", team: teamA };
    const b = { login: "hubot", team: teamB };
    expect(instantSeed(a, b, NOW)).toBe(instantSeed({ ...a, login: "octo" }, b, NOW + 3_600_000));
    expect(instantSeed(a, b, NOW)).not.toBe(instantSeed(a, b, NOW + 86_400_000));
    expect(instantSeed(a, b, NOW)).not.toBe(instantSeed(a, { ...b, team: [teamB[0]] }, NOW));
  });
});
