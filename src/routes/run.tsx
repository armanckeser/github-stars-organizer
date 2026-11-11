import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { Coins, Crosshair, Dices, Play, RotateCcw, SkipForward, Star, Swords, Sword } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InspectOverlay, repoName } from "@/components/battle/arena";
import { TYPE, useCreature } from "@/components/battle/repo-card";
import type { BoardFight, BoardUnit } from "@/components/battle/three/board";
import { demoUser } from "@/lib/demo";
import { validLogin } from "@/lib/published-list";
import { LOSSES_TO_END, REROLL_COST, ROUND_GOLD, START_GOLD, WINS_TO_FINISH, WIN_GOLD, costOf, fetchPlayer, freeCell, inHalf, opponentLogin, opponentUnits, rangeOf, shopFor, snapshot, teamSizeAt, today, winnerOf, type Player, type Unit } from "@/lib/run";
import type { Fighter } from "../../server/battle";
import { plainFight } from "../../server/run/plain-fight";
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
const idOf = (side: Side, fighter: Fighter) => `${side}:${fighter.fullName}`;
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

function ShopCard({ fighter, affordable, onBuy }: { fighter: Fighter; affordable: boolean; onBuy: () => void }) {
  const art = useCreature(fighter);
  const type = TYPE[fighter.type];
  const reach = rangeOf(fighter) > 1;
  return (
    <button type="button" onClick={onBuy} disabled={!affordable} aria-label={`Buy ${fighter.fullName} for ${costOf(fighter)} gold`} className="battle-deal relative flex aspect-[5/6] w-full flex-col overflow-hidden rounded-md border-2 text-left outline-none transition-transform duration-150 ease-out enabled:hover:-translate-y-1 enabled:active:translate-y-0 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45" style={{ borderColor: type.color, background: `linear-gradient(180deg, ${type.color}55, #0c1014 70%)` }}>
      <span className="relative min-h-0 flex-1">
        {art ? <img src={art} alt="" className="absolute inset-0 size-full object-contain" draggable={false} /> : art === false && fighter.avatarUrl ? <img src={fighter.avatarUrl} alt="" className="absolute inset-0 size-full object-cover" /> : null}
        <span className="absolute right-1 top-1 flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[#ffd84d]"><Coins className="size-3" />{costOf(fighter)}</span>
        <span className="absolute left-1 top-1 rounded-full bg-black/70 p-1" title={reach ? "Hits from behind" : "Fights up close"}>{reach ? <Crosshair className="size-3" /> : <Sword className="size-3" />}</span>
      </span>
      <span className="block truncate bg-black/55 px-1.5 py-1 font-display text-[11px] font-bold leading-tight tracking-tight sm:text-xs">{repoName(fighter)}</span>
    </button>
  );
}

function RunPage() {
  const search = Route.useSearch();
  const [login, setLogin] = useState(search.me ?? demoUser.current ?? "");
  const [player, setPlayer] = useState<Player | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [units, setUnits] = useState<Unit[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [gold, setGold] = useState(START_GOLD);
  const [rerolls, setRerolls] = useState(0);
  const [shop, setShop] = useState<(Fighter | null)[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [played, setPlayed] = useState<Played | null>(null);
  const [fast, setFast] = useState(false);
  const [skips, setSkips] = useState(0);
  const [inspecting, setInspecting] = useState<Fighter | null>(null);

  const finished = wins >= WINS_TO_FINISH || losses >= LOSSES_TO_END;
  const cap = round ? teamSizeAt(round.number) : 0;
  const fighting = played !== null && !played.over;

  async function openRound(me: Player, team: Unit[], number: number) {
    setLoading(true);
    setError("");
    try {
      const opponent = await fetchPlayer(opponentLogin(me.login, number));
      setRound({ number, opponent, theirs: opponentUnits(opponent, number) });
      setRerolls(0);
      setShop(shopFor(me, team.map((unit) => unit.fighter), number, 0));
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
      setWins(0);
      setLosses(0);
      setGold(START_GOLD);
      await openRound(me, team, 1);
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : "The cards couldn't be read. Check the connection and try again.");
      setLoading(false);
    }
  }

  function buy(slot: number) {
    const fighter = shop[slot];
    if (!fighter || gold < costOf(fighter) || units.length >= cap) return;
    const cell = freeCell(units, fighter);
    if (!cell) return;
    setUnits([...units, { fighter, ...cell }]);
    setGold(gold - costOf(fighter));
    setShop(shop.map((item, i) => (i === slot ? null : item)));
  }

  function sell(unit: Unit) {
    setUnits(units.filter((other) => other !== unit));
    setGold(gold + costOf(unit.fighter));
    setSelected(null);
  }

  function reroll() {
    if (!player || !round || gold < REROLL_COST) return;
    setGold(gold - REROLL_COST);
    setRerolls(rerolls + 1);
    setShop(shopFor(player, units.map((unit) => unit.fighter), round.number, rerolls + 1));
  }

  // A creature dropped on a taken cell trades places with the one standing there.
  function place(id: string, col: number, row: number) {
    const moved = units.find((unit) => idOf(0, unit.fighter) === id);
    if (!moved || !inHalf(col, row)) return;
    setUnits(units.map((unit) => (unit === moved ? { ...unit, col, row } : unit.col === col && unit.row === row ? { ...unit, col: moved.col, row: moved.row } : unit)));
  }

  function fight() {
    if (!player || !round) return;
    const seed = `${player.login}|${round.opponent.login}|${round.number}|${today()}`;
    const events = plainFight(snapshot(player.login, round.number, units), snapshot(round.opponent.login, round.number, round.theirs), seed);
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
    void openRound(player, units, round.number + 1);
  }

  const boardUnits = useMemo<BoardUnit[]>(() => {
    const side = (which: Side, team: Unit[]) => team.map((unit) => ({ id: idOf(which, unit.fighter), side: which, fighter: unit.fighter, ...cellOf(which, unit), ranged: rangeOf(unit.fighter) > 1 }));
    return [...side(0, units), ...side(1, round?.theirs ?? [])];
  }, [units, round]);

  const chosen = selected ? [...units.map((unit) => ({ unit, mine: true })), ...(round?.theirs ?? []).map((unit) => ({ unit, mine: false }))].find(({ unit, mine }) => idOf(mine ? 0 : 1, unit.fighter) === selected) : undefined;
  const building = player !== null && round !== null && !finished && played === null;

  return (
    <div className="relative mx-auto h-[calc(100dvh-7rem)] min-h-[540px] w-full max-w-6xl overflow-hidden rounded-xl border bg-[#080b0f] text-white">
      <Suspense fallback={null}>
        <Board3D
          units={boardUnits}
          near={player?.character.look ?? null}
          far={round?.opponent.character.look ?? null}
          selected={selected}
          fight={played?.fight ?? null}
          speed={fast ? 2 : 1}
          skips={skips}
          onPlace={place}
          onSelect={setSelected}
          onFightEnd={(key) => setPlayed((current) => (current?.fight.key === key ? { ...current, over: true } : current))}
        />
      </Suspense>

      {player && round && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2 sm:p-3">
          <div className={`${PANEL} flex items-center gap-2 px-2.5 py-1.5`}>
            {player.avatarUrl && <img src={player.avatarUrl} alt="" className="size-6 rounded-full" />}
            <div className="space-y-1">
              <Pips filled={wins} total={WINS_TO_FINISH} tone="bg-primary" label="wins" />
              <Pips filled={losses} total={LOSSES_TO_END} tone="bg-[#e5484d]" label="losses" />
            </div>
          </div>
          <p className={`${PANEL} whitespace-nowrap px-3 py-1.5 font-display text-sm font-bold tracking-tight sm:text-base`}>Round {round.number}</p>
          <div className={`${PANEL} flex items-center gap-2 px-2.5 py-1.5`}>
            <span className="max-w-28 truncate text-xs font-medium sm:max-w-40 sm:text-sm">@{round.opponent.login}</span>
            {round.opponent.avatarUrl && <img src={round.opponent.avatarUrl} alt="" className="size-6 rounded-full" />}
          </div>
        </div>
      )}

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

      {chosen && !fighting && !played && (
        <div className={`${PANEL} absolute bottom-[9.75rem] left-2 z-10 w-48 space-y-1.5 p-2.5 sm:bottom-auto sm:left-3 sm:top-16 sm:w-52`}>
          <button type="button" onClick={() => setInspecting(chosen.unit.fighter)} className="block max-w-full truncate font-display text-sm font-bold tracking-tight underline-offset-4 hover:underline">{repoName(chosen.unit.fighter)}</button>
          <p className="text-[11px] text-white/70">{TYPE[chosen.unit.fighter.type].label} · {rangeOf(chosen.unit.fighter) > 1 ? "hits from behind" : "fights up close"}</p>
          <dl className="grid grid-cols-4 gap-1 text-center text-[11px] tabular-nums">
            {([["HP", chosen.unit.fighter.hp], ["ATK", chosen.unit.fighter.attack], ["GRD", chosen.unit.fighter.defense], ["SPD", chosen.unit.fighter.speed]] as const).map(([label, value]) => (
              <div key={label} className="rounded bg-white/10 py-1"><dt className="text-white/55">{label}</dt><dd className="font-semibold">{value}</dd></div>
            ))}
          </dl>
          {chosen.mine && building && units.length > 1 && <Button variant="outline" size="sm" className="w-full" onClick={() => sell(chosen.unit)}><Coins /> Sell for {costOf(chosen.unit.fighter)}</Button>}
        </div>
      )}

      {building && (
        <div className="absolute inset-x-0 bottom-0 z-10 border-t border-white/15 bg-[#0c1014]/90 p-2 backdrop-blur-sm sm:p-3">
          <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-stretch">
            <div className="grid flex-1 grid-cols-5 gap-1.5 sm:order-2 sm:gap-2">
              {shop.map((fighter, i) => fighter
                ? <ShopCard key={fighter.fullName} fighter={fighter} affordable={gold >= costOf(fighter) && units.length < cap} onBuy={() => buy(i)} />
                : <div key={i} className="aspect-[5/6] rounded-md border border-dashed border-white/10" />)}
            </div>
            <div className="flex items-center justify-between gap-2 sm:order-1 sm:w-28 sm:flex-col sm:items-stretch sm:justify-center">
              <p className="flex items-center gap-1.5 font-display text-lg font-bold tabular-nums text-[#ffd84d]" aria-label={`${gold} gold`}><Coins className="size-5" />{gold}</p>
              <Button variant="outline" size="sm" disabled={gold < REROLL_COST} onClick={reroll}><Dices /> Reroll · {REROLL_COST}</Button>
              <p className="text-center text-xs tabular-nums text-white/70 sm:hidden" aria-hidden="true">Team {units.length}/{cap}</p>
              <Button className="sm:hidden" onClick={fight} disabled={loading}><Swords /> Fight</Button>
            </div>
            <div className="hidden sm:order-3 sm:flex sm:w-28 sm:flex-col sm:items-stretch sm:justify-center sm:gap-2">
              <p className="text-center text-xs tabular-nums text-white/70" aria-label={`${units.length} of ${cap} cards on the board`}>Team {units.length}/{cap}</p>
              <Button onClick={fight} disabled={loading}><Swords /> Fight</Button>
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
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-white/70 underline-offset-4 hover:text-white hover:underline"><Star className="size-4" /> Star Stard on GitHub</a>
          </div>
        </div>
      )}

      <InspectOverlay fighter={inspecting} onClose={() => setInspecting(null)} />
    </div>
  );
}
