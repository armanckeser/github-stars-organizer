import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, CircleHelp, Coins, Crosshair, Dices, Layers, Maximize, Minimize, Play, RotateCcw, SkipForward, Star, Swords, Sword, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";
import { InspectOverlay, repoName } from "@/components/battle/arena";
import { Figure } from "@/components/battle/figure";
import { TYPE, useCreature } from "@/components/battle/repo-card";
import type { BoardFight, BoardUnit, Spot } from "@/components/battle/three/board";
import { FpsMeter } from "@/components/run/fps-meter";
import { TeamSlots } from "@/components/run/team-slots";
import { BoostPick } from "@/components/run/boost-pick";
import { RunCard } from "@/components/run/run-card";
import { Checks } from "@/components/run/checks";
import { Shop } from "@/components/run/shop";
import { demoUser } from "@/lib/demo";
import { APP_URL, validLogin } from "@/lib/published-list";
import { LOSSES_TO_END, REROLL_COST, ROUND_GOLD, START_GOLD, WINS_TO_FINISH, WIN_GOLD, costOf, fetchPlayer, inHalf, opponentLogin, opponentUnits, rangeOf, shopFor, snapshot, today, winnerOf, type Player, type RunFighter, type Unit } from "@/lib/run";
import { CLASSES } from "../../server/character";
import { BOOST_ROUNDS, boostOffer } from "../../server/run/boosts";
import { benchToBoard, boardToBench, cardsOf, emptyBench, swapBench, toBench, without, type Roster } from "../../server/run/roster";
import { SLOT_COST, boardLimit } from "../../server/run/rules";
import { fight as playFight } from "../../server/run/fight";
import { cellOf, type Side } from "../../server/run/types";

// The Play screen: a run, played on one board. The player buys cards from the shop
// along the bottom, drags them around their half, and presses Fight; every creature
// then fights at once. Five wins or three losses ends the run.

export const Route = createFileRoute("/run")({
  component: RunPage,
  validateSearch: (search: Record<string, unknown>): { me?: string } => ({ me: typeof search.me === "string" ? search.me : undefined }),
});

const Board3D = lazy(() => import("@/components/battle/board3d"));
const REPO_URL = "https://github.com/armanckeser/github-stars-organizer";
const idOf = (side: Side, fighter: RunFighter) => `${side}:${fighter.fullName}`;
/** The shop's tab, which stays on screen when the shop folds down. */
const SHOP_TAB = 40;
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
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
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
  const [boosts, setBoosts] = useState<string[]>([]);
  // Three boosts to pick one from, after rounds 2 and 4; null the rest of the time.
  const [offer, setOffer] = useState<{ round: number; ids: string[] } | null>(null);

  const [drawer, drawerRef] = useHeight();
  // The shop rises at the start of each round and folds down to its tab when the player wants the board.
  const [shopOpen, setShopOpen] = useState(true);
  const [full, arenaRef, toggleFull] = useFullscreen();
  // For screenshots of the boost pick: `stardOffer(2)` in the console, development builds only.
  useEffect(() => {
    if (!import.meta.env.DEV || !player) return;
    (window as unknown as { stardOffer?: (round: number) => void }).stardOffer = (number) => setOffer({ round: number, ids: boostOffer(`${player.login}|${today()}|${number}`, boosts) });
  }, [player, boosts]);
  const finished = wins >= WINS_TO_FINISH || losses >= LOSSES_TO_END;
  const cap = round ? boardLimit(round.number, bought) : 0;
  const roster: Roster = { board: units, bench };
  const held = cardsOf(roster).length;
  const fighting = played !== null && !played.over;

  async function openRound(me: Player, owned: RunFighter[], number: number) {
    setLoading(true);
    setError("");
    try {
      const opponent = await fetchPlayer(opponentLogin(me.login, number));
      setRound({ number, opponent, theirs: opponentUnits(opponent, number) });
      setRerolls(0);
      setShop(shopFor(me, owned, number, 0));
      setPlayed(null);
      setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : "The next team couldn't be read. Check the connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function start(event?: React.FormEvent) {
    event?.preventDefault();
    if (!validLogin(login)) return;
    setLoading(true);
    setError("");
    try {
      const me = await fetchPlayer(login.trim());
      const team: Unit[] = me.team.slice(0, 1).map((fighter) => ({ fighter, col: 1, row: 0 }));
      setPlayer(me);
      setUnits(team);
      setBench(emptyBench());
      setBought(0);
      setWins(0);
      setLosses(0);
      setGold(START_GOLD);
      setBoosts([]);
      setOffer(null);
      await openRound(me, team.map((unit) => unit.fighter), 1);
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
    if (held <= 1 || !settle(without(roster, fighter.fullName))) return;
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
    setShop(shopFor(player, cardsOf(roster), round.number, rerolls + 1));
  }

  // A creature dropped on a taken cell trades places with the one standing there.
  function place(id: string, col: number, row: number) {
    const moved = units.find((unit) => idOf(0, unit.fighter) === id);
    if (!moved || !inHalf(col, row)) return;
    setUnits(units.map((unit) => (unit === moved ? { ...unit, col, row } : unit.col === col && unit.row === row ? { ...unit, col: moved.col, row: moved.row } : unit)));
  }

  function fight() {
    if (!player || !round || units.length === 0) return;
    const seed = `${player.login}|${round.opponent.login}|${round.number}|${today()}`;
    const events = playFight(snapshot(player.login, round.number, units, boosts), snapshot(round.opponent.login, round.number, round.theirs), seed);
    setSelected(null);
    setPlayed({ fight: { key: `${seed}|${wins}|${losses}`, ids: [units.map((unit) => idOf(0, unit.fighter)), round.theirs.map((unit) => idOf(1, unit.fighter))], events }, winner: winnerOf(events), over: false });
  }

  function next() {
    if (!player || !round || !played) return;
    // A draw counts for neither side.
    const won = wins + (played.winner === 0 ? 1 : 0);
    const lost = losses + (played.winner === 1 ? 1 : 0);
    setWins(won);
    setLosses(lost);
    if (won >= WINS_TO_FINISH || lost >= LOSSES_TO_END) return setPlayed(null);
    setGold(gold + ROUND_GOLD + (played.winner === 0 ? WIN_GOLD : 0));
    // The same seed as the Worker's offer (worker/src/run.ts), so both offer the same three.
    if ((BOOST_ROUNDS as readonly number[]).includes(round.number)) setOffer({ round: round.number, ids: boostOffer(`${player.login}|${today()}|${round.number}`, boosts) });
    void openRound(player, cardsOf(roster), round.number + 1);
  }

  useEffect(() => setShopOpen(true), [round?.number]);

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
  const viewingTeam = viewing && viewing.slot === undefined && !viewing.unit ? (round?.theirs ?? []) : units;

  return (
    <div ref={arenaRef} data-full={full ? "" : undefined} className="arena relative mx-auto h-[calc(100dvh-7rem)] min-h-[540px] w-full max-w-6xl overflow-hidden rounded-xl bg-[#080b0f] text-white">
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
          inset={building ? SHOP_TAB + (shopOpen ? drawer : 0) : 0}
          onSelect={look}
          onFightEnd={(key) => setPlayed((current) => (current?.fight.key === key ? { ...current, over: true } : current))}
          onMove={move}
          sellPrice={(id) => {
            const fighter = cardsOf(roster).find((card) => idOf(0, card) === id);
            return fighter && held > 1 ? costOf(fighter) : null;
          }}
          onDrag={() => {}}
        />
      </Suspense>

      {player && round && (
        <div className="hud-top pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2 sm:p-3">
          <button type="button" onClick={() => setProfile(player)} aria-label={`About ${player.login}`} className={`hud-chip pointer-events-auto flex items-center gap-2 px-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
            {player.avatarUrl && <img src={player.avatarUrl} alt="" className="size-6 rounded-full" />}
            <span className="block space-y-1">
              <Pips filled={wins} total={WINS_TO_FINISH} tone="bg-primary" label="wins" />
              <Pips filled={losses} total={LOSSES_TO_END} tone="bg-[#e5484d]" label="losses" />
            </span>
          </button>
          <p className={`hud-chip whitespace-nowrap px-3 py-1.5 font-display text-base font-[800] tracking-tight [font-stretch:110%] sm:text-xl`}>Round {round.number}</p>
          <div className="pointer-events-auto flex items-center gap-1.5">
            <button type="button" onClick={() => setProfile(round.opponent)} aria-label={`About ${round.opponent.login}`} className={`hud-chip flex items-center gap-2 px-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
              <span className="max-w-24 truncate text-xs font-medium sm:max-w-40 sm:text-sm">@{round.opponent.login}</span>
              {round.opponent.avatarUrl && <img src={round.opponent.avatarUrl} alt="" className="size-6 rounded-full" />}
            </button>
            {toggleFull && <button type="button" onClick={toggleFull} aria-label={full ? "Leave full screen" : "Full screen"} className="hud-chip p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">{full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}</button>}
            <button type="button" onClick={() => setHelp(!help)} aria-label="How to play" aria-expanded={help} className={`hud-chip p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring`}><CircleHelp className="size-4" /></button>
          </div>
        </div>
      )}

      {player && round && (
        <div className="checks-rail pointer-events-none absolute inset-x-0 top-14 z-10 flex items-start justify-between gap-2 px-1 sm:top-20 sm:px-2">
          <Checks title="Checks" cards={units.map((unit) => unit.fighter.card)} boosts={boosts} />
          <Checks title="Theirs" cards={round.theirs.map((unit) => unit.fighter.card)} boosts={[]} align="right" />
        </div>
      )}

      {offer && building && <BoostPick offer={offer.ids} round={offer.round} onPick={(id) => { setBoosts([...boosts, id]); setOffer(null); }} />}

      {!player && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={start} className={`${PANEL} w-full max-w-sm space-y-3 p-5`}>
            <h1 className="font-display text-2xl font-bold tracking-tight">Play</h1>
            <p className="text-sm text-white/70">Build a team from your stars. {WINS_TO_FINISH} wins finishes a run, {LOSSES_TO_END} losses ends one.</p>
            <Input value={login} onChange={(e) => setLogin(e.target.value.replace(/^@/, ""))} placeholder="Your GitHub username" aria-label="Your GitHub username" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            <Button type="submit" className="w-full" disabled={!validLogin(login) || loading}><Play /> {loading ? "Reading your stars..." : "Start a run"}</Button>
            {error && <p className="text-sm text-[#ff8f93]" role="alert">{error}</p>}
          </form>
        </div>
      )}

      {player && error && <p className={`${PANEL} absolute inset-x-3 top-16 z-20 px-3 py-2 text-sm`} role="alert">{error}</p>}

      {building && (
        <div className="shop-dock absolute inset-x-0 bottom-0 z-10" data-open={shopOpen ? "" : undefined} style={{ "--drawer": `${drawer}px` } as React.CSSProperties}>
          {/* The tab: the gold, and the shop folding up or down under it, as TFT keeps the gold over the shop's middle. */}
          <button type="button" className="shop-tab" onClick={() => setShopOpen(!shopOpen)} aria-expanded={shopOpen} aria-controls="shop-drawer" aria-label={`${gold} gold. ${shopOpen ? "Fold the shop" : "Open the shop"}`}>
            <span className="hud-coin" />
            <span className="font-display text-xl font-[800] tabular-nums text-[#ffe08a] [font-stretch:110%]">{gold}</span>
            {shopOpen ? <ChevronDown className="size-4 text-white/55" /> : <ChevronUp className="size-4 text-white/55" />}
          </button>
          {/* With the shop folded, Fight stays in its corner. */}
          <button type="button" className="hud-button hud-fight shop-dock-fight flex h-10 items-center gap-2 px-4 text-sm" onClick={fight} disabled={loading || units.length === 0} tabIndex={shopOpen ? -1 : 0} aria-hidden={shopOpen}><Swords className="size-4" /> Fight</button>
          <div ref={drawerRef} id="shop-drawer" className="shop-bar px-2 pb-2 pt-2.5 sm:px-4 sm:pb-3 sm:pt-3" inert={!shopOpen}>
            <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
              <div className="sm:order-2 sm:flex-1"><Shop shop={shop} held={cardsOf(roster)} gold={gold} draftsFull={!bench.includes(null)} onOpen={(slot) => shop[slot] && setViewing({ fighter: shop[slot]!, slot })} /></div>
              <div className="flex items-center justify-between gap-2 sm:order-1 sm:w-24 sm:flex-col sm:items-stretch sm:justify-center">
                <button type="button" className="hud-button flex h-9 items-center justify-center gap-1.5 px-3 text-sm sm:h-auto sm:flex-col sm:gap-1 sm:py-2.5" disabled={gold < REROLL_COST} onClick={reroll} aria-label={`Reroll for ${REROLL_COST} gold`}><Dices className="size-4 sm:size-5" /><span className="flex items-center gap-1"><span className="shop-coin" />{REROLL_COST}</span></button>
                <TeamSlots className="sm:hidden" count={units.length} limit={cap} gold={gold} onBuy={buySlot} />
                <button type="button" className="hud-button hud-fight flex h-9 items-center gap-1.5 px-4 text-sm sm:hidden" onClick={fight} disabled={loading || units.length === 0}><Swords className="size-4" /> Fight</button>
              </div>
              <div className="dock-side hidden sm:order-3 sm:flex sm:w-28 sm:flex-col sm:items-stretch sm:justify-center sm:gap-2">
                <TeamSlots count={units.length} limit={cap} gold={gold} onBuy={buySlot} />
                <button type="button" className="dock-fight hud-button hud-fight flex h-12 items-center justify-center gap-2 text-base" onClick={fight} disabled={loading || units.length === 0}><Swords className="size-5" /> Fight</button>
              </div>
            </div>
          </div>
        </div>
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
          <div className={`${PANEL} w-full max-w-sm space-y-3 p-5 text-center`}>
            <p className="font-display text-2xl font-bold tracking-tight">{wins >= WINS_TO_FINISH ? "Run finished" : "Run over"}</p>
            <p className="text-sm text-white/70">{wins} {wins === 1 ? "win" : "wins"}, {losses} {losses === 1 ? "loss" : "losses"}.</p>
            <Button className="w-full" onClick={() => void start()} disabled={loading}><RotateCcw /> New run</Button>
            <div className="flex items-center justify-between gap-2">
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-white/70 underline-offset-4 hover:text-white hover:underline"><Star className="size-4" /> Star Stard on GitHub</a>
              <CopyButton text={`${APP_URL}run`} label="Share" />
            </div>
          </div>
        </div>
      )}

      {help && (
        <div className={`${PANEL} absolute right-2 top-14 z-30 w-72 space-y-2 p-3 text-sm sm:right-3`}>
          <div className="flex items-center justify-between">
            <p className="font-display font-bold tracking-tight">How to play</p>
            <button type="button" onClick={() => setHelp(false)} aria-label="Close" className="rounded p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" /></button>
          </div>
          <ul className="space-y-1.5 text-white/80">
            <li className="flex gap-2"><Coins className="mt-0.5 size-4 shrink-0 text-[#ffd84d]" /> Tap a shop card to see the card, then buy. Cards come from your stars. {ROUND_GOLD} gold each round, {WIN_GOLD} more for a win.</li>
            <li className="flex gap-2"><Sword className="mt-0.5 size-4 shrink-0" /> Sword cards fight up close. Put them in the front row.</li>
            <li className="flex gap-2"><Crosshair className="mt-0.5 size-4 shrink-0" /> Target cards hit from three cells away. Keep them behind.</li>
            <li className="flex gap-2"><Swords className="mt-0.5 size-4 shrink-0" /> Bought cards wait on the bench. Drag between bench and board, or onto the shop to sell for the full price. Only the board counts toward the team.</li>
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
            {(viewing.unit || viewing.bench !== undefined) && building && held > 1 && <Button variant="outline" className="w-full" onClick={() => { sell(viewing.fighter); close(); }}><Coins /> Sell for {costOf(viewing.fighter)}</Button>}
          </>
        )}
      </InspectOverlay>
    </div>
  );
}
