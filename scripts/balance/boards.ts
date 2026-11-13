import { seededRandom } from "../../server/battle.ts";
import { fight } from "../../server/run/fight.ts";
import { ROUND_GOLD, START_GOLD, WIN_GOLD, BENCH_SIZE, boardLimit, costOf, freeCell, opponentLogin, opponentUnits, shopFor, snapshot, winnerOf, type RunFighter, type Unit } from "../../server/run/rules.ts";
import { checksOf, teamSets } from "../../server/run/sets.ts";
import type { Card, Snapshot } from "../../server/run/types.ts";
import { poolsFromArguments } from "./pools.ts";

// What a player's boards look like through the run: how many rows the checks list
// shows, how often a board has a live check, and how often the player wins at rounds
// 1, 3 and 5, playing a simple greedy run against the real opponents' pools:
//   node scripts/balance/boards.ts pool.json p-<opponent>.json ...

const BOARDS = 3000;
const RUNS = Number(process.env.RUNS ?? 1500);
const ROUNDS = [1, 3, 5];
const LAST_ROUND = 5;

const pools = poolsFromArguments();
if (!pools) throw new Error("Give the player's pool file, then the opponents': node scripts/balance/boards.ts pool.json p-*.json");
const { player, opponents } = pools;

const units = (cards: Card[]) => ({ units: cards.map((card) => ({ card, col: 0, row: 0 })) });

/** The checks list's rows: src/components/run/checks.tsx shows checksOf. */
const checkRows = (cards: Card[]) => checksOf(units(cards));

const liveChecks = (cards: Card[]) => teamSets(units(cards)).filter((entry) => entry.tier).length;
const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

function rowsReport() {
  const random = seededRandom("boards");
  const cards = player.team.map((fighter) => fighter.card);
  for (const size of [2, 4, 5, 6]) {
    let rows = 0;
    let live = 0;
    for (let i = 0; i < BOARDS; i++) {
      const free = [...cards];
      const board = Array.from({ length: size }, () => free.splice(Math.floor(random() * free.length), 1)[0]);
      const shown = checkRows(board);
      rows += shown.length;
      live += shown.filter((entry) => entry.tier).length;
    }
    console.log(`${size}-card boards of ${player.login}'s cards: ${(rows / BOARDS).toFixed(1)} check rows, ${(live / BOARDS).toFixed(2)} live`);
  }
}

type Strategy = "priciest" | "set-chaser";
const strength = (fighter: RunFighter) => fighter.card.hp + fighter.card.attack + fighter.card.guard + fighter.card.speed;
const byPrice = (x: RunFighter, y: RunFighter) => costOf(y) - costOf(x) || strength(y) - strength(x);

/** The board a strategy fields from the cards it owns: the priciest, or the most live checks first. */
function chooseBoard(owned: RunFighter[], limit: number, strategy: Strategy): RunFighter[] {
  if (strategy === "priciest") return [...owned].sort(byPrice).slice(0, limit);
  const board: RunFighter[] = [];
  const rest = [...owned];
  while (board.length < limit && rest.length > 0) {
    const lit = (fighter: RunFighter) => liveChecks([...board, fighter].map((member) => member.card));
    rest.sort((x, y) => lit(y) - lit(x) || byPrice(x, y));
    board.push(rest.shift()!);
  }
  return board;
}

function placedUnits(fighters: RunFighter[]): Unit[] {
  const placed: Unit[] = [];
  for (const fighter of fighters) {
    const cell = freeCell(placed, fighter);
    if (cell) placed.push({ fighter, ...cell });
  }
  return placed;
}

type Played = { round: number; mine: Snapshot; won: boolean };

/** A run with no rerolls and no bought slots: each round buy what the strategy likes best until the gold runs out, then fight. */
function run(seed: string, strategy: Strategy): Played[] {
  const owned: RunFighter[] = [player.team[0]];
  let gold = START_GOLD;
  const played: Played[] = [];
  for (let round = 1; round <= LAST_ROUND; round++) {
    const limit = boardLimit(round, 0);
    const shop = shopFor(player, owned, round, 0, seed);
    for (;;) {
      const affordable = shop.filter((fighter) => !owned.includes(fighter) && costOf(fighter) <= gold);
      if (affordable.length === 0 || owned.length >= limit + BENCH_SIZE) break;
      const board = chooseBoard(owned, limit, strategy).map((fighter) => fighter.card);
      const lit = (fighter: RunFighter) => (strategy === "set-chaser" ? liveChecks([...board, fighter.card]) : 0);
      affordable.sort((x, y) => lit(y) - lit(x) || byPrice(x, y));
      owned.push(affordable[0]);
      gold -= costOf(affordable[0]);
    }
    const login = opponentLogin(player.login, round, seed);
    const opponent = opponents.get(login);
    if (!opponent) throw new Error(`No pool file for ${login}.`);
    const mine = snapshot(player.login, round, placedUnits(chooseBoard(owned, limit, strategy)));
    const theirs = snapshot(login, round, opponentUnits(opponent, round, seed));
    const won = winnerOf(fight(mine, theirs, `${player.login}|${login}|${round}|${seed}`)) === 0;
    played.push({ round, mine, won });
    gold += ROUND_GOLD + (won ? WIN_GOLD : 0);
  }
  return played;
}

function runsReport() {
  console.log(`\n${RUNS} greedy runs per strategy, every round played whatever the record, no boosts:`);
  for (const strategy of ["priciest", "set-chaser"] as const) {
    const played = Array.from({ length: RUNS }, (_, i) => run(`seed${i}`, strategy)).flat();
    for (const round of ROUNDS) {
      const at = played.filter((entry) => entry.round === round);
      const live = at.filter((entry) => liveChecks(entry.mine.units.map((unit) => unit.card)) > 0).length / at.length;
      const won = at.filter((entry) => entry.won).length / at.length;
      console.log(`${strategy.padEnd(10)} round ${round} (${at[0].mine.units.length} cards): a live check ${percent(live)}, wins ${percent(won)}`);
    }
  }
}

rowsReport();
runsReport();
