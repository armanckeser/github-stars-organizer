import { fieldTeam, seededRandom, type RepoFacts } from "../server/battle.ts";
import { defaultCharacter } from "../server/character.ts";
import type { RunFighter } from "../server/run/rules.ts";
import { cardFor, type CardFacts } from "../server/run/stats.ts";
import type { Player } from "../src/lib/run.ts";

// What `GET /api/run/pool` answers, for made-up accounts, so the browser tests play a
// whole run with no network. Every repo here is invented; nothing is read from GitHub.

const READ_AT = Date.parse("2026-11-11T12:00:00Z");
const POOL_SIZE = 21;

const LANGUAGES: [string | null, string][] = [
  ["TypeScript", "#3178c6"], ["JavaScript", "#f1e05a"], ["Python", "#3572a5"], ["Rust", "#dea584"], ["Go", "#00add8"],
  ["C", "#555555"], ["Shell", "#89e051"], ["Ruby", "#701516"], ["Jupyter Notebook", "#da5b0b"], [null, "#3a4049"],
];
const TOPICS = ["cli", "ai", "web", "database", "security", "game", "paintball", "chicken-fingers"];
const WORDS = ["dreamatorium", "paintball", "blanket-fort", "kickpuncher", "constables", "pillow-fort", "darkest-timeline", "human-being", "chang-bot", "troy-and-abed", "spanish-101", "cool-cool", "air-con", "pop-pop", "mascot", "rich-the-doctor", "study-room-f", "dean-pelton", "levels", "lava", "borchert"];

function repoFor(login: string, index: number): CardFacts {
  const random = seededRandom(`${login}|repo|${index}`);
  const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];
  const [language, color] = pick(LANGUAGES);
  const stars = Math.round(10 ** (1 + random() * 4.4));
  const facts: RepoFacts = {
    fullName: `greendale-${login}/${WORDS[index % WORDS.length]}`,
    description: "Made up for the browser tests.",
    stars,
    forks: Math.round(stars * random() * 0.4),
    language,
    color,
    avatarUrl: null,
    isArchived: random() < 0.05,
    createdAt: new Date(READ_AT - random() * 9 * 365 * 86_400_000).toISOString(),
    pushedAt: new Date(READ_AT - random() * 400 * 86_400_000).toISOString(),
    openIssues: Math.round(random() * 300),
    closedIssues: Math.round(random() * 900),
    releases: Math.round(random() * 40),
    contributors: 1 + Math.round(random() * 120),
    commits: 50 + Math.round(random() * 6000),
  };
  return { ...facts, topics: [pick(TOPICS), pick(TOPICS)].filter((topic, i, all) => all.indexOf(topic) === i) };
}

/** A made-up account's pool, the same every time for the same login. */
export function poolFor(login: string): Player {
  const repos = Array.from({ length: POOL_SIZE }, (_, i) => repoFor(login, i));
  const team = fieldTeam(repos, login, "rookie", READ_AT).map((fighter, i): RunFighter => {
    const card = cardFor(repos[i], READ_AT);
    return { ...fighter, hp: card.hp, attack: card.attack, defense: card.guard, speed: card.speed, shiny: card.shiny, card };
  });
  return { login, avatarUrl: null, character: { ...defaultCharacter(login), level: 3 }, team };
}
