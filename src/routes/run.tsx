import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, CircleHelp, Coins, Crosshair, RotateCw, Layers, Maximize, Minimize, SkipForward, Star, Swords, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InspectOverlay } from "@/components/battle/arena";
import { Figure } from "@/components/battle/figure";
import { RunStart } from "@/components/battle/run-start";
import type { BoardUnit } from "@/components/battle/three/board";
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
import { countEvent } from "@/lib/events";
import { validLogin } from "@/lib/published-list";
import { LOSSES_TO_END, NEW_TALLY, REROLL_COST, ROUND_GOLD, WINS_TO_FINISH, WIN_GOLD, costOf, fetchOpponent, fetchPlayer, newRunSeed, opponentUnits, rangeOf, type Player, type RunFighter, type Unit } from "@/lib/run";
import { NO_RUN, idOf, runReducer, sceneOf, type Fought, type Run, type RunAction } from "@/lib/run-state";
import { openTeam, savedRound, type SavedTeam } from "@/lib/saved-team";
import { CLASSES } from "../../server/character";
import { cardsOf, emptyBench, type Roster } from "../../server/run/roster";
import { boardLimit } from "../../server/run/rules";
import { cellOf, type Side } from "../../server/run/types";

// The Play screen: a run, played on one board. The player buys cards from the shop
// along the bottom, drags them around their half, and presses Fight; every creature
// then fights at once. Five wins or three losses ends the run.

export const Route = createFileRoute("/run")({
  component: RunPage,
  validateSearch: (search: Record<string, unknown>): { me?: string; against?: string; name?: string } => ({
    me: typeof search.me === "string" ? search.me : undefined,
    // A finished run's team from its share link (/team): every round is played against that team.
    against: typeof search.against === "string" ? search.against : undefined,
    // The friend a challenge named (/team?to=). It only fills in the form: whoever opened the link may be someone else.
    name: typeof search.name === "string" && validLogin(search.name) ? search.name.trim() : undefined,
  }),
});

const Board3D = lazy(() => import("@/components/battle/board3d"));
/** The shop's tab, which stays on screen when the shop folds down. */
const SHOP_TAB = 34;
const PANEL = "rounded-lg border border-white/15 bg-[#0c1014]/90 shadow-lg backdrop-blur-sm";

// The board before a run has one: one array each, so the board's memo holds between renders.
const NO_UNITS: Unit[] = [];
const NO_BENCH: (RunFighter | null)[] = emptyBench();
const NO_BOOSTS: string[] = [];

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

/** The message a failed read shows: the Worker's own words, or `otherwise` when the network failed. */
const messageOf = (cause: unknown, otherwise: string) => (cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : otherwise);

/** A round's opponent: the saved team's owner on a challenge run, else an account read from the Worker. */
async function readRound(player: Player, number: number, seed: string, against: SavedTeam | null): Promise<{ opponent: Player; theirs: Unit[] }> {
  if (against) return savedRound(against, number);
  const opponent = await fetchOpponent(player.login, number, seed);
  // The next opponent follows from the name, the seed and the round, not from how this
  // round goes, so it is read while this one is played and Continue finds it waiting.
  // A failed read is dropped from the cache (src/lib/run.ts), and Continue reads it again.
  fetchOpponent(player.login, number + 1, seed).catch(() => {});
  return { opponent, theirs: opponentUnits(opponent, number, seed) };
}

/** The player's cards, the saved team on a challenge run, and round 1, as the action that ends the run's loading. */
async function readRun(login: string, seed: string, againstToken: string | undefined): Promise<RunAction> {
  try {
    // Round 1's opponent is known from the name and the seed alone, so both teams are read at once.
    if (!againstToken) fetchOpponent(login, 1, seed).catch(() => {});
    const [player, against] = await Promise.all([fetchPlayer(login), againstToken ? openTeam(againstToken) : null]);
    return { type: "run-read", seed, player, against, ...(await readRound(player, 1, seed, against)) };
  } catch (cause) {
    return { type: "read-failed", seed, message: messageOf(cause, "The cards couldn't be read. Check the connection and try again.") };
  }
}

async function readNextRound(run: Run, number: number, seed: string): Promise<RunAction> {
  try {
    return { type: "round-read", seed, number, ...(await readRound(run.player, number, seed, run.against)) };
  } catch (cause) {
    return { type: "read-failed", seed, message: messageOf(cause, "The next team couldn't be read. Check the connection and try again.") };
  }
}

function RunPage() {
  const search = Route.useSearch();
  const [login, setLogin] = useState(search.me ?? search.name ?? demoUser.current ?? "");
  const [state, dispatch] = useReducer(runReducer, NO_RUN);
  const { phase, seed, selected, viewing } = state;
  const { player, run, round, fight } = sceneOf(phase);
  const units = run?.units ?? NO_UNITS;
  const bench = run?.bench ?? NO_BENCH;
  const boosts = run?.boosts ?? NO_BOOSTS;
  const { wins, losses } = run?.tally ?? NEW_TALLY;
  const gold = run?.gold ?? 0;

  const [fast, setFast] = useState(false);
  const [skips, setSkips] = useState(0);
  const [profile, setProfile] = useState<Player | null>(null);
  const [help, setHelp] = useState(false);
  // A phone folds its own checks too: a full list covers the board (docs/GAME-UI.md §7).
  const phone = useMediaQuery("(max-width: 639px), (max-height: 540px)");

  const start = (who: string) => {
    if (validLogin(who)) dispatch({ type: "start", seed: newRunSeed(), login: who.trim() });
  };

  // A link with ?me= starts the run on load, so opening the link is all it takes. StrictMode
  // runs this twice in development: the second start's seed wins and the first one's read is dropped.
  const linked = search.me && validLogin(search.me) ? search.me.trim() : null;
  useEffect(() => {
    if (linked) start(linked);
    // Once, for the address the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Each loading phase reads what it waits for; the answer names its run's seed, so a newer run drops it.
  const loadingRun = phase.kind === "loading-run" ? phase : null;
  useEffect(() => {
    if (loadingRun) void readRun(loadingRun.login, seed, search.against).then(dispatch);
  }, [loadingRun, seed, search.against]);
  const loadingRound = phase.kind === "loading-round" ? phase : null;
  useEffect(() => {
    if (loadingRound) void readNextRound(loadingRound.run, loadingRound.number, seed).then(dispatch);
  }, [loadingRound, seed]);

  // The counters (server/events.ts): a round counts once it opens, a run once it ends.
  const openedRound = phase.kind === "shop" || phase.kind === "boost-pick" ? phase.round.number : null;
  useEffect(() => {
    if (openedRound === null) return;
    if (openedRound === 1) countEvent("run_started");
    if (openedRound === 1 && search.against) countEvent("challenge_started");
    countEvent("round_reached", openedRound);
  }, [seed, openedRound, search.against]);
  const endedRound = phase.kind === "end" ? phase.round.number : null;
  useEffect(() => {
    if (endedRound !== null) countEvent("run_finished", endedRound);
  }, [seed, endedRound]);

  const [drawer, drawerRef] = useHeight();
  // The shop rises at the start of each round and folds down to its tab when the player wants the board.
  const [shopOpen, setShopOpen] = useState(true);
  useEffect(() => setShopOpen(true), [round?.number]);
  const [full, arenaRef, toggleFull] = useFullscreen();
  // For screenshots of the boost pick: `stardOffer(2)` in the console, development builds only.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { stardOffer?: (round: number) => void }).stardOffer = (number) => dispatch({ type: "offer", round: number });
  }, []);

  const building = phase.kind === "shop" || phase.kind === "boost-pick" ? phase : null;
  // The boost pick covers the shop until the player folds it away to look at the board.
  const shopUsable = building !== null && (building.kind === "shop" || building.peeking);
  const shopShown = shopOpen && shopUsable;
  const cap = round && run ? boardLimit(round.number, run.bought) : 0;
  const roster: Roster = { board: units, bench };
  const viewingTeam = viewing?.kind === "theirs" ? (round?.theirs ?? []) : units;
  const close = () => dispatch({ type: "close" });

  const boardUnits = useMemo<BoardUnit[]>(() => {
    const side = (which: Side, team: Unit[]) => team.map((unit) => ({ id: idOf(which, unit.fighter), side: which, fighter: unit.fighter, ...cellOf(which, unit), ranged: rangeOf(unit.fighter) > 1 }));
    const drafts = bench.flatMap((fighter, slot) => (fighter ? [{ id: idOf(0, fighter), side: 0 as Side, fighter, x: 0, y: 0, ranged: rangeOf(fighter) > 1, bench: slot }] : []));
    return [...side(0, units), ...drafts, ...side(1, round?.theirs ?? [])];
  }, [units, bench, round]);

  return (
    <div ref={arenaRef} data-full={full ? "" : undefined} className="arena relative h-dvh w-full overflow-hidden bg-[#080b0f] text-white">
      <Suspense fallback={null}>
        <Board3D
          units={boardUnits}
          near={player ? { look: player.character.look, supporter: player.supporter === true } : null}
          far={round ? { look: round.opponent.character.look, supporter: round.opponent.supporter === true } : null}
          selected={selected}
          fight={fight}
          speed={fast ? 2 : 1}
          skips={skips}
          room={Math.max(0, cap - units.length)}
          inset={building ? SHOP_TAB + (shopShown ? drawer : 0) : 0}
          onSelect={(id) => dispatch({ type: "look", id })}
          onFightEnd={(key) => dispatch({ type: "fight-ended", key })}
          onMove={(id, spot) => dispatch({ type: "move", id, spot })}
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

      {phase.kind === "boost-pick" && <BoostPick offer={phase.offer.ids} round={phase.offer.round} peeking={phase.peeking} onPeek={(peeking) => dispatch({ type: "peek", peeking })} onPick={(id) => dispatch({ type: "pick", id })} />}

      {!player && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4">
          <RunStart login={login} onLogin={setLogin} onStart={start} loading={phase.kind === "loading-run"} error={phase.kind === "failed" ? phase.message : ""} starting={linked} intro={`Build a team from your stars. ${WINS_TO_FINISH} wins finishes a run, ${LOSSES_TO_END} losses ends one.`} className={`${PANEL} w-full max-w-sm p-5`} />
        </div>
      )}

      {player && phase.kind === "loading-run" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
          <p className={`${PANEL} px-4 py-3 text-sm`} role="status">Dealing a new run...</p>
        </div>
      )}

      {player && phase.kind === "failed" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className={`${PANEL} w-full max-w-sm space-y-3 p-4 text-sm`}>
            <p role="alert">{phase.message}</p>
            <Button className="w-full" onClick={() => (phase.retry.kind === "run" ? start(phase.retry.login) : dispatch({ type: "retry-round" }))}><RotateCw /> Try again</Button>
          </div>
        </div>
      )}

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
                  <BarButton label="Reroll" cost={REROLL_COST} icon={<RotateCw className="size-4" strokeWidth={2.6} />} disabled={gold < REROLL_COST} onClick={() => dispatch({ type: "reroll" })} aria-label={`Reroll for ${REROLL_COST} gold`} />
                  <TeamSlots count={units.length} limit={cap} gold={gold} onBuy={() => dispatch({ type: "buy-slot" })} />
                </div>
                <div className="shop-cards"><Shop shop={building.shelf.cards} held={cardsOf(roster)} gold={gold} draftsFull={!bench.includes(null)} onOpen={(slot) => dispatch({ type: "look-shop", slot })} /></div>
              </div>
            </div>
          </div>
          {/* Fight: the only filled button, in the bar's corner, and in the screen's corner when the bar folds. A boost is picked before the fight. */}
          <button type="button" className="shop-fight hud-fight" data-open={shopShown ? "" : undefined} style={{ "--drawer": `${drawer}px` } as React.CSSProperties} onClick={() => dispatch({ type: "fight" })} disabled={building.kind !== "shop" || units.length === 0}><Swords className="size-5" /> Fight</button>
        </>
      )}

      {phase.kind === "fighting" && (
        <div className="absolute bottom-3 right-3 z-10 flex gap-1.5">
          <Button variant="outline" size="sm" aria-pressed={fast} onClick={() => setFast((f) => !f)}>{fast ? "2×" : "1×"}</Button>
          <Button variant="outline" size="sm" onClick={() => setSkips((count) => count + 1)}><SkipForward /> Skip</Button>
        </div>
      )}

      {(phase.kind === "round-result" || phase.kind === "loading-round") && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 border-t border-white/15 bg-[#0c1014]/90 px-4 py-4 backdrop-blur-sm">
          <p className="font-display text-lg font-bold tracking-tight sm:text-2xl" aria-live="polite">{resultLine(phase.kind === "round-result" ? phase : phase.after)}</p>
          {phase.kind === "round-result" ? <Button onClick={() => dispatch({ type: "continue" })}>Continue</Button> : <Button disabled>Reading the next team...</Button>}
        </div>
      )}

      {phase.kind === "end" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4">
          <RunEnd login={phase.run.player.login} seed={seed} rounds={phase.run.history} results={phase.run.results} team={phase.run.units} wins={wins} losses={losses} against={phase.run.against ? search.against : undefined} onNewRun={() => start(phase.run.player.login)} />
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
            <div className="mx-auto w-fit rounded-md" style={{ background: CLASSES[profile.character.klass].color }}><Figure look={profile.character.look} supporter={profile.supporter === true} className="h-40 w-auto" /></div>
            <div>
              <p className="font-display text-xl font-bold tracking-tight">{profile.character.name}</p>
              <p className="text-sm">{CLASSES[profile.character.klass].label} · Lv {profile.character.level}</p>
              {profile.supporter && <p className="text-xs text-white/70">Starred Stard</p>}
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
        {viewing?.kind === "shop" && shopUsable && (
          <Button className="w-full" disabled={gold < costOf(viewing.fighter) || !bench.includes(null)} onClick={() => { dispatch({ type: "buy", slot: viewing.slot }); close(); }}>
            <Coins /> {!bench.includes(null) ? "Bench is full" : gold < costOf(viewing.fighter) ? `Costs ${costOf(viewing.fighter)}, you have ${gold}` : `Buy for ${costOf(viewing.fighter)}`}
          </Button>
        )}
        {(viewing?.kind === "board" || viewing?.kind === "drafts") && shopUsable && <Button variant="outline" className="w-full" onClick={() => dispatch({ type: "sell", id: idOf(0, viewing.fighter) })}><Coins /> Sell for {costOf(viewing.fighter)}</Button>}
      </InspectOverlay>
    </div>
  );
}

/** The result bar's line for a round just played; the next round's number when there is none (a retried read). */
function resultLine(fought: Fought | null): string {
  if (!fought) return "Next round";
  if (fought.winner === 0) return `Round ${fought.round.number} won`;
  if (fought.winner === 1) return `Round ${fought.round.number} lost`;
  return "A draw";
}
