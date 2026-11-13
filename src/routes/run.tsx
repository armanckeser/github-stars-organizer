import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, CircleHelp, Coins, Crosshair, RotateCw, Layers, Maximize, Minimize, SkipForward, Star, Swords, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InspectOverlay } from "@/components/battle/arena";
import { Figure } from "@/components/battle/figure";
import { RunStart } from "@/components/battle/run-start";
import type { BoardFight, BoardUnit, Spot } from "@/components/battle/three/board";
import { FpsMeter } from "@/components/run/fps-meter";
import { TeamSlots } from "@/components/run/team-slots";
import { BarButton } from "@/components/run/bar-button";
import { BoostPick } from "@/components/run/boost-pick";
import { RunCard } from "@/components/run/run-card";
import { Checks } from "@/components/run/checks";
import { useMediaQuery } from "@/hooks/use-media-query";
import { RunEnd } from "@/components/run/run-end";
import { Shop } from "@/components/run/shop";
import { demoUser } from "@/lib/demo";
import { validLogin } from "@/lib/published-list";
import { LOSSES_TO_END, NEW_TALLY, REROLL_COST, ROUND_GOLD, START_GOLD, WINS_TO_FINISH, WIN_GOLD, costOf, countRound, fetchOpponent, fetchPlayer, inHalf, newRunSeed, opponentUnits, rangeOf, shopFor, snapshot, winnerOf, type Player, type RunFighter, type Unit } from "@/lib/run";
import { openTeam, savedRound, savedSnapshotAt, type SavedTeam } from "@/lib/saved-team";
import { CLASSES } from "../../server/character";
import { BOOST_ROUNDS, boostOffer } from "../../server/run/boosts";
import { benchToBoard, boardToBench, cardsOf, emptyBench, swapBench, toBench, without, type Roster } from "../../server/run/roster";
import { SLOT_COST, boardLimit } from "../../server/run/rules";
import { fight as playFight } from "../../server/run/fight";
import { cellOf, type Side, type Snapshot } from "../../server/run/types";

// The Play screen: a run, played on one board. The player buys cards from the shop
// along the bottom, drags them around their half, and presses Fight; every creature
// then fights at once. Five wins or three losses ends the run.

export const Route = createFileRoute("/run")({
  component: RunPage,
  validateSearch: (search: Record<string, unknown>): { me?: string; against?: string } => ({
    me: typeof search.me === "string" ? search.me : undefined,
    // A finished run's team from its share link (/team): every round is played against that team.
    against: typeof search.against === "string" ? search.against : undefined,
  }),
});

const Board3D = lazy(() => import("@/components/battle/board3d"));
const idOf = (side: Side, fighter: RunFighter) => `${side}:${fighter.fullName}`;
/** The shop's tab, which stays on screen when the shop folds down. */
const SHOP_TAB = 34;
const PANEL = "rounded-lg border border-white/15 bg-[#0c1014]/90 shadow-lg backdrop-blur-sm";

type Round = { number: number; opponent: Player; theirs: Unit[] };
type Played = { fight: BoardFight; winner: Side | null; over: boolean };

function Pips({ filled, total, tone, label }: { filled: number; total: number; tone: string; label: string }) {
  return (
    <span className="flex items-center gap-1" aria-label={`${filled} of ${total} ${label}`}>
      {Array.from({ length: total }, (_, i) => <span key={i} className={`size-2.5 rounded-full ${i < filled ? tone : "bg-white/15"}`} />)}
    </span>
  );
}

/** The height of an element as it resizes, through a callback ref; 0 once it is gone. */
function useHeight(): [number, (element: HTMLElement | null) => void] {
  const [height, setHeight] = useState(0);
  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) return setHeight(0);
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    setHeight(element.offsetHeight);
  }, []);
  return [height, ref];
}

/** The arena on the whole screen, where the browser allows it, turned wide on a phone that can lock its turn (Android; an iPhone can do neither). */
function useFullscreen(): [boolean, ((element: HTMLElement | null) => void), (() => void) | null] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const changed = () => setFull(document.fullscreenElement !== null && document.fullscreenElement === element);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, [element]);
  const able = typeof document !== "undefined" && document.fullscreenEnabled && element !== null;
  const toggle = async () => {
    if (!element) return;
    if (document.fullscreenElement) return document.exitFullscreen();
    await element.requestFullscreen({ navigationUI: "hide" });
    // A desktop browser has no turn to lock and refuses; the arena is full screen either way.
    await (screen.orientation as ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void> }).lock?.("landscape").catch(() => undefined);
  };
  return [full, setElement, able ? () => void toggle() : null];
}

function RunPage() {
  const search = Route.useSearch();
  const [login, setLogin] = useState(search.me ?? demoUser.current ?? "");
  const [player, setPlayer] = useState<Player | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [units, setUnits] = useState<Unit[]>([]);
  const [bench, setBench] = useState<(RunFighter | null)[]>(emptyBench);
  // Board slots bought on top of the round's limit, for the rest of the run.
  const [bought, setBought] = useState(0);
  const [round, setRound] = useState<Round | null>(null);
  const [tally, setTally] = useState(NEW_TALLY);
  const { wins, losses } = tally;
  const [gold, setGold] = useState(START_GOLD);
  const [rerolls, setRerolls] = useState(0);
  const [shop, setShop] = useState<(RunFighter | null)[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [played, setPlayed] = useState<Played | null>(null);
  const [fast, setFast] = useState(false);
  const [skips, setSkips] = useState(0);
  // The card being looked at: one in the shop, one of the player's on the board, or one of the other team's.
  const [viewing, setViewing] = useState<{ fighter: RunFighter; slot?: number; unit?: Unit; bench?: number } | null>(null);
  const [profile, setProfile] = useState<Player | null>(null);
  const [help, setHelp] = useState(false);
  // A phone folds its own checks too: a full list covers the board (docs/GAME-UI.md §7).
  const phone = useMediaQuery("(max-width: 639px), (max-height: 540px)");
  const [boosts, setBoosts] = useState<string[]>([]);
  // Three boosts to pick one from, after rounds 2 and 4; null the rest of the time.
  const [offer, setOffer] = useState<{ round: number; ids: string[] } | null>(null);
  // The team as fought at each round, for the end screen's share link.
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [against, setAgainst] = useState<SavedTeam | null>(null);
  // Drawn at each start, so every run deals its own shops, rerolls, opponents and boosts.
  const [seed, setSeed] = useState("");

  // A link with ?me= starts the run on load, so opening the link is all it takes.
  const linked = search.me && validLogin(search.me) ? search.me.trim() : null;
  useEffect(() => {
    if (linked) void start(linked);
    // Once, for the address the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [drawer, drawerRef] = useHeight();
  // The shop rises at the start of each round and folds down to its tab when the player wants the board.
  const [shopOpen, setShopOpen] = useState(true);
  const [full, arenaRef, toggleFull] = useFullscreen();
  // For screenshots of the boost pick: `stardOffer(2)` in the console, development builds only.
  useEffect(() => {
    if (!import.meta.env.DEV || !player) return;
    (window as unknown as { stardOffer?: (round: number) => void }).stardOffer = (number) => setOffer({ round: number, ids: boostOffer(`${player.login}|${seed}|${number}`, boosts) });
  }, [player, seed, boosts]);
  const finished = wins >= WINS_TO_FINISH || losses >= LOSSES_TO_END;
  const cap = round ? boardLimit(round.number, bought) : 0;
  const roster: Roster = { board: units, bench };
  const fighting = played !== null && !played.over;

  async function openRound(me: Player, owned: RunFighter[], number: number, run = seed, saved = against) {
    setLoading(true);
    setError("");
    try {
      if (saved) setRound({ number, ...savedRound(saved, number) });
      else {
        const opponent = await fetchOpponent(me.login, number, run);
        setRound({ number, opponent, theirs: opponentUnits(opponent, number, run) });
      }
      setRerolls(0);
      setShop(shopFor(me, owned, number, 0, run));
      setPlayed(null);
      setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : "The next team couldn't be read. Check the connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function start(who = login.trim()) {
    if (!validLogin(who)) return;
    setLoading(true);
    setError("");
    const run = newRunSeed();
    try {
      // Round 1's opponent is known from the name and the seed alone, so both teams are read at once.
      if (!search.against) fetchOpponent(who, 1, run).catch(() => {});
      const [me, saved] = await Promise.all([fetchPlayer(who), search.against ? openTeam(search.against) : null]);
      const team: Unit[] = me.team.slice(0, 1).map((fighter) => ({ fighter, col: 1, row: 0 }));
      setAgainst(saved);
      setSeed(run);
      setHistory([]);
      setPlayer(me);
      setUnits(team);
      setBench(emptyBench());
      setBought(0);
      setTally(NEW_TALLY);
      setGold(START_GOLD);
      setBoosts([]);
      setOffer(null);
      await openRound(me, team.map((unit) => unit.fighter), 1, run, saved);
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : "The cards couldn't be read. Check the connection and try again.");
      setLoading(false);
    }
  }

  /** Takes a change to the board and bench. False when the rules refused it. */
  function settle(next: Roster | null): boolean {
    if (!next) return false;
    setUnits(next.board);
    setBench(next.bench);
    return true;
  }

  function buy(slot: number) {
    const fighter = shop[slot];
    if (!fighter || gold < costOf(fighter) || !settle(toBench(roster, fighter))) return;
    setGold(gold - costOf(fighter));
    setShop(shop.map((item, i) => (i === slot ? null : item)));
  }

  function sell(fighter: RunFighter) {
    if (!settle(without(roster, fighter.fullName))) return;
    setGold(gold + costOf(fighter));
    // The card goes back on an empty shelf, so a purchase can be taken back.
    const empty = shop.indexOf(null);
    if (empty !== -1) setShop(shop.map((item, i) => (i === empty ? fighter : item)));
    setSelected(null);
  }

  function buySlot() {
    if (gold < SLOT_COST || cap >= boardLimit(round?.number ?? 0, bought + 1)) return;
    setGold(gold - SLOT_COST);
    setBought(bought + 1);
  }

  /** One of the player's creatures put down on a cell, a Drafts slot or the Archive, by the roster's rules. */
  function move(id: string, spot: Spot) {
    const onBoard = units.find((unit) => idOf(0, unit.fighter) === id);
    const slot = bench.findIndex((fighter) => fighter !== null && idOf(0, fighter) === id);
    const fighter = onBoard?.fighter ?? bench[slot];
    if (!fighter) return;
    if (spot.kind === "archive") return sell(fighter);
    if (onBoard) return spot.kind === "cell" ? place(id, spot.col, spot.row) : settle(boardToBench(roster, fighter.fullName, spot.slot));
    if (spot.kind === "bench") settle(swapBench(roster, slot, spot.slot));
    else settle(benchToBoard(roster, slot, spot.col, spot.row, cap));
  }

  function reroll() {
    if (!player || !round || gold < REROLL_COST) return;
    setGold(gold - REROLL_COST);
    setRerolls(rerolls + 1);
    setShop(shopFor(player, cardsOf(roster), round.number, rerolls + 1, seed));
  }

  // A creature dropped on a taken cell trades places with the one standing there.
  function place(id: string, col: number, row: number) {
    const moved = units.find((unit) => idOf(0, unit.fighter) === id);
    if (!moved || !inHalf(col, row)) return;
    setUnits(units.map((unit) => (unit === moved ? { ...unit, col, row } : unit.col === col && unit.row === row ? { ...unit, col: moved.col, row: moved.row } : unit)));
  }

  function fight() {
    if (!player || !round || units.length === 0) return;
    const fightSeed = `${player.login}|${round.opponent.login}|${round.number}|${seed}`;
    const mine = snapshot(player.login, round.number, units, boosts);
    // A saved team fights with the boosts it had at that round, as the Worker replays it (worker/src/team.ts).
    const theirs = against ? savedSnapshotAt(against, round.number) : snapshot(round.opponent.login, round.number, round.theirs);
    const events = playFight(mine, theirs, fightSeed);
    setHistory([...history, mine]);
    setSelected(null);
    setPlayed({ fight: { key: `${fightSeed}|${wins}|${losses}`, ids: [units.map((unit) => idOf(0, unit.fighter)), round.theirs.map((unit) => idOf(1, unit.fighter))], events }, winner: winnerOf(events), over: false });
  }

  function next() {
    // While the next round opens, a second press would open it twice.
    if (!player || !round || !played || loading) return;
    // Counted once per round, so pressing Continue again after the next round failed to open only retries the opening.
    const counted = countRound(tally, round.number, played.winner);
    setTally(counted.tally);
    if (counted.tally.wins >= WINS_TO_FINISH || counted.tally.losses >= LOSSES_TO_END) return setPlayed(null);
    setGold(gold + counted.earned);
    // The same seed as the Worker's offer (worker/src/run.ts), so both offer the same three.
    if ((BOOST_ROUNDS as readonly number[]).includes(round.number)) setOffer({ round: round.number, ids: boostOffer(`${player.login}|${seed}|${round.number}`, boosts) });
    void openRound(player, cardsOf(roster), round.number + 1);
  }

  useEffect(() => setShopOpen(true), [round?.number]);
  // The boost pick folds the shop away, so nothing of it shows through the medallions; looking at the board brings it back.
  const [peeking, setPeeking] = useState(false);

  const boardUnits = useMemo<BoardUnit[]>(() => {
    const side = (which: Side, team: Unit[]) => team.map((unit) => ({ id: idOf(which, unit.fighter), side: which, fighter: unit.fighter, ...cellOf(which, unit), ranged: rangeOf(unit.fighter) > 1 }));
    const drafts = bench.flatMap((fighter, slot) => (fighter ? [{ id: idOf(0, fighter), side: 0 as Side, fighter, x: 0, y: 0, ranged: rangeOf(fighter) > 1, bench: slot }] : []));
    return [...side(0, units), ...drafts, ...side(1, round?.theirs ?? [])];
  }, [units, bench, round]);

  function look(id: string | null) {
    setSelected(id);
    if (!id || fighting) return;
    const mine = units.find((unit) => idOf(0, unit.fighter) === id);
    const theirs = round?.theirs.find((unit) => idOf(1, unit.fighter) === id);
    const slot = bench.findIndex((fighter) => fighter !== null && idOf(0, fighter) === id);
    if (mine) setViewing({ fighter: mine.fighter, unit: mine });
    else if (slot !== -1) setViewing({ fighter: bench[slot]!, bench: slot });
    else if (theirs) setViewing({ fighter: theirs.fighter });
  }
  const close = () => {
    setViewing(null);
    setSelected(null);
  };
  const building = player !== null && round !== null && !finished && played === null;
  const picking = Boolean(offer) && building && !peeking;
  const shopShown = shopOpen && !picking;
  const viewingTeam = viewing && viewing.slot === undefined && !viewing.unit ? (round?.theirs ?? []) : units;

  return (
    <div ref={arenaRef} data-full={full ? "" : undefined} className="arena relative h-dvh w-full overflow-hidden bg-[#080b0f] text-white">
      <Suspense fallback={null}>
        <Board3D
          units={boardUnits}
          near={player?.character.look ?? null}
          far={round?.opponent.character.look ?? null}
          selected={selected}
          fight={played?.fight ?? null}
          speed={fast ? 2 : 1}
          skips={skips}
          room={Math.max(0, cap - units.length)}
          inset={building ? SHOP_TAB + (shopShown ? drawer : 0) : 0}
          onSelect={look}
          onFightEnd={(key) => setPlayed((current) => (current?.fight.key === key ? { ...current, over: true } : current))}
          onMove={move}
          sellPrice={(id) => {
            const fighter = cardsOf(roster).find((card) => idOf(0, card) === id);
            return fighter ? costOf(fighter) : null;
          }}
          onDrag={() => {}}
        />
      </Suspense>

      <Link to="/" aria-label="Leave Play" className="hud-chip play-exit absolute left-2 top-2 z-30 grid size-9 place-items-center outline-none focus-visible:ring-2 focus-visible:ring-ring sm:left-3 sm:top-3">
        <ArrowLeft className="size-4" />
      </Link>
      {player && round && (
        <div className="hud-top pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2 pl-13 sm:p-3 sm:pl-15">
          <button type="button" onClick={() => setProfile(player)} aria-label={`About ${player.login}`} className={`hud-chip pointer-events-auto flex items-center gap-2 px-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
            {player.avatarUrl && <img src={player.avatarUrl} alt="" className="size-6 rounded-full" />}
            <span className="block space-y-1">
              <Pips filled={wins} total={WINS_TO_FINISH} tone="bg-primary" label="wins" />
              <Pips filled={losses} total={LOSSES_TO_END} tone="bg-[#e5484d]" label="losses" />
            </span>
          </button>
          <p className={`hud-chip whitespace-nowrap px-3 py-1.5 font-display text-base font-bold tracking-tight sm:text-xl`}>Round {round.number}</p>
          <div className="pointer-events-auto flex items-center gap-1.5">
            <button type="button" onClick={() => setProfile(round.opponent)} aria-label={`About ${round.opponent.login}`} className={`hud-chip flex items-center gap-2 px-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
              <span className="hidden max-w-40 truncate text-sm font-medium sm:block">@{round.opponent.login}</span>
              {round.opponent.avatarUrl && <img src={round.opponent.avatarUrl} alt="" className="size-6 rounded-full" />}
            </button>
            {toggleFull && <button type="button" onClick={toggleFull} aria-label={full ? "Leave full screen" : "Full screen"} className="hud-chip p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">{full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}</button>}
            <button type="button" onClick={() => setHelp(!help)} aria-label="How to play" aria-expanded={help} className={`hud-chip p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring`}><CircleHelp className="size-4" /></button>
          </div>
        </div>
      )}

      {player && round && (
        <div className="checks-rail pointer-events-none absolute inset-x-0 top-14 z-10 flex items-start justify-between gap-2 px-1 sm:top-20 sm:px-2">
          <Checks title="Checks" cards={units.map((unit) => unit.fighter.card)} boosts={boosts} folds={phone} />
          <Checks title={round.opponent.login} cards={round.theirs.map((unit) => unit.fighter.card)} boosts={[]} align="right" folds />
        </div>
      )}

      {offer && building && <BoostPick offer={offer.ids} round={offer.round} onPeek={setPeeking} onPick={(id) => { setBoosts([...boosts, id]); setOffer(null); setPeeking(false); }} />}

      {!player && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4">
          <RunStart login={login} onLogin={setLogin} onStart={(who) => void start(who)} loading={loading} error={error} starting={linked} intro={`Build a team from your stars. ${WINS_TO_FINISH} wins finishes a run, ${LOSSES_TO_END} losses ends one.`} className={`${PANEL} w-full max-w-sm p-5`} />
        </div>
      )}

      {player && error && <p className={`${PANEL} absolute inset-x-3 top-16 z-20 px-3 py-2 text-sm`} role="alert">{error}</p>}

      {building && (
        <>
          <div className="shop-dock absolute inset-x-0 bottom-0 z-10" data-open={shopShown ? "" : undefined} style={{ "--drawer": `${drawer}px` } as React.CSSProperties}>
            {/* The gold plaque on the bar's top edge, as TFT keeps the gold over the shop's middle; the shop folds down under it. */}
            <button type="button" className="shop-plaque" onClick={() => setShopOpen(!shopShown)} aria-expanded={shopShown} aria-controls="shop-drawer" aria-label={shopShown ? "Fold the shop" : "Open the shop"}>
              <span className="hud-coin" />
              <span className="shop-plaque-gold" aria-label={`${gold} gold`}>{gold}</span>
              {shopShown ? <ChevronDown className="size-3.5 text-white/45" /> : <ChevronUp className="size-3.5 text-white/45" />}
            </button>
            <div ref={drawerRef} id="shop-drawer" className="shop-bar" inert={!shopShown}>
              <div className="shop-layout">
                <div className="shop-controls">
                  <BarButton label="Reroll" cost={REROLL_COST} icon={<RotateCw className="size-4" strokeWidth={2.6} />} disabled={gold < REROLL_COST} onClick={reroll} aria-label={`Reroll for ${REROLL_COST} gold`} />
                  <TeamSlots count={units.length} limit={cap} gold={gold} onBuy={buySlot} />
                </div>
                <div className="shop-cards"><Shop shop={shop} held={cardsOf(roster)} gold={gold} draftsFull={!bench.includes(null)} onOpen={(slot) => shop[slot] && setViewing({ fighter: shop[slot]!, slot })} /></div>
              </div>
            </div>
          </div>
          {/* Fight: the only filled button, in the bar's corner, and in the screen's corner when the bar folds. */}
          <button type="button" className="shop-fight hud-fight" data-open={shopShown ? "" : undefined} style={{ "--drawer": `${drawer}px` } as React.CSSProperties} onClick={fight} disabled={loading || units.length === 0}><Swords className="size-5" /> Fight</button>
        </>
      )}

      {fighting && (
        <div className="absolute bottom-3 right-3 z-10 flex gap-1.5">
          <Button variant="outline" size="sm" aria-pressed={fast} onClick={() => setFast((f) => !f)}>{fast ? "2×" : "1×"}</Button>
          <Button variant="outline" size="sm" onClick={() => setSkips((count) => count + 1)}><SkipForward /> Skip</Button>
        </div>
      )}

      {played?.over && round && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 border-t border-white/15 bg-[#0c1014]/90 px-4 py-4 backdrop-blur-sm">
          <p className="font-display text-lg font-bold tracking-tight sm:text-2xl" aria-live="polite">{played.winner === 0 ? `Round ${round.number} won` : played.winner === 1 ? `Round ${round.number} lost` : "A draw"}</p>
          <Button onClick={next} disabled={loading}>{loading ? "Reading the next team..." : "Continue"}</Button>
        </div>
      )}

      {player && finished && !played && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4">
          <RunEnd login={player.login} seed={seed} rounds={history} team={units} wins={wins} losses={losses} against={against ? search.against : undefined} loading={loading} onNewRun={() => void start()} />
        </div>
      )}

      {help && (
        <div className={`${PANEL} absolute right-2 top-14 z-30 w-72 space-y-2 p-3 text-sm sm:right-3`}>
          <div className="flex items-center justify-between">
            <p className="font-display font-bold tracking-tight">How to play</p>
            <button type="button" onClick={() => setHelp(false)} aria-label="Close" className="rounded p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" /></button>
          </div>
          <ul className="space-y-1.5 text-white/80">
            <li className="flex gap-2"><Coins className="mt-0.5 size-4 shrink-0 text-[#ffd84d]" /> Tap a shop card to see the card, then buy. Cards come from your stars, topped up with popular repos when you have only a few. {ROUND_GOLD} gold each round, {WIN_GOLD} more for a win.</li>
            <li className="flex gap-2"><Swords className="mt-0.5 size-4 shrink-0" /> Tanks take hits, Assassins deal them, Bruisers do both. All three hit the enemy next to them: put them in the front row.</li>
            <li className="flex gap-2"><Crosshair className="mt-0.5 size-4 shrink-0" /> Ranged cards hit from three cells away. Keep them behind.</li>
            <li className="flex gap-2"><Swords className="mt-0.5 size-4 shrink-0" /> Bought cards wait on the Drafts shelf. Drag between the shelf and the board, or into the Archive to sell for the full price. Only the board counts toward the team.</li>
            <li className="flex gap-2"><Layers className="mt-0.5 size-4 shrink-0 text-[#35c450]" /> Two or three cards that share a language or topic give each other a bonus.</li>
            <li className="flex gap-2"><Star className="mt-0.5 size-4 shrink-0" /> Press Fight and watch. {WINS_TO_FINISH} wins finishes the run, {LOSSES_TO_END} losses ends the run.</li>
          </ul>
        </div>
      )}

      {profile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6" role="dialog" aria-modal="true" aria-label={profile.login} onClick={() => setProfile(null)}>
          <div className={`${PANEL} battle-deal w-full max-w-xs space-y-3 p-4 text-center`} onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto w-fit rounded-md" style={{ background: CLASSES[profile.character.klass].color }}><Figure look={profile.character.look} className="h-40 w-auto" /></div>
            <div>
              <p className="font-display text-xl font-bold tracking-tight">{profile.character.name}</p>
              <p className="text-sm">{CLASSES[profile.character.klass].label} · Lv {profile.character.level}</p>
              {profile.character.klass !== "rookie" && <p className="text-xs text-white/70">{CLASSES[profile.character.klass].perk}</p>}
              {profile.character.motto && <p className="mt-1 text-xs text-white/70">“{profile.character.motto}”</p>}
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <a href={`https://github.com/${profile.login}`} target="_blank" rel="noopener noreferrer" className="truncate underline-offset-4 hover:underline">@{profile.login}</a>
              <Button variant="outline" size="sm" onClick={() => setProfile(null)}><X /> Close</Button>
            </div>
          </div>
        </div>
      )}

      <FpsMeter />

      <InspectOverlay fighter={viewing?.fighter ?? null} onClose={close} card={viewing && <RunCard fighter={viewing.fighter} team={viewingTeam.map((unit) => unit.fighter)} />}>
        {viewing && (
          <>
            {viewing.slot !== undefined && building && (
              <Button className="w-full" disabled={gold < costOf(viewing.fighter) || !bench.includes(null)} onClick={() => { buy(viewing.slot!); close(); }}>
                <Coins /> {!bench.includes(null) ? "Bench is full" : gold < costOf(viewing.fighter) ? `Costs ${costOf(viewing.fighter)}, you have ${gold}` : `Buy for ${costOf(viewing.fighter)}`}
              </Button>
            )}
            {(viewing.unit || viewing.bench !== undefined) && building && <Button variant="outline" className="w-full" onClick={() => { sell(viewing.fighter); close(); }}><Coins /> Sell for {costOf(viewing.fighter)}</Button>}
          </>
        )}
      </InspectOverlay>
    </div>
  );
}
