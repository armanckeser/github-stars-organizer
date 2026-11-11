import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Dices, Play, RotateCcw, SkipForward, Star, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArenaScene, ArenaStage, InspectOverlay, Nameplate, TextBox, repoName, type SideView, type Stance } from "@/components/battle/arena";
import { RepoCard } from "@/components/battle/repo-card";
import { demoUser } from "@/lib/demo";
import { validLogin } from "@/lib/published-list";
import { LOSSES_TO_END, TEAM_MAX, WINS_TO_FINISH, beatsOf, fetchPlayer, opponentLogin, opponentTeam, shopFor, snapshot, today, winnerOf, type Beat, type Player } from "@/lib/run";
import type { Fighter } from "../../server/battle";
import { plainFight } from "../../server/run/plain-fight";
import type { Side } from "../../server/run/types";

// The Play screen: a run. Each round the player takes a card from a shop of three
// drawn from their stars, puts the team in order, and watches the team fight another
// account's team. Five wins or three losses ends the run.

export const Route = createFileRoute("/run")({
  component: RunPage,
  validateSearch: (search: Record<string, unknown>): { me?: string } => ({ me: typeof search.me === "string" ? search.me : undefined }),
});

const STEP_MS = 1100;
const REPO_URL = "https://github.com/armanckeser/github-stars-organizer";

type Round = { number: number; opponent: Player; theirs: Fighter[] };
type Fight = { mine: Fighter[]; theirs: Fighter[]; beats: Beat[]; winner: Side | null };

// Where the fight stands after the first `step` hits. Side 0 is the player.
function sceneAt(fight: Fight, step: number) {
  const teams = [fight.mine, fight.theirs];
  const hp = teams.map((team) => team.map((fighter) => fighter.hp));
  for (const beat of fight.beats.slice(0, step)) hp[1 - beat.side][beat.target] = Math.max(0, hp[1 - beat.side][beat.target] - beat.damage);
  const last = step > 0 ? fight.beats[step - 1] : undefined;
  const before = step > 1 ? fight.beats[step - 2] : undefined;
  const view = (side: Side): { index: number; stance: Stance } => {
    const alive = hp[side].findIndex((value) => value > 0);
    const index = alive === -1 ? hp[side].length - 1 : alive;
    if (!last) return { index, stance: "enter" };
    if (last.side === side) return { index: last.slot, stance: "lunge" };
    if (last.out) return { index: last.target, stance: "ko" };
    if (before && before.side !== side && before.out && before.target !== index) return { index, stance: "enter" };
    return { index, stance: "hit" };
  };
  return { hp, last, views: [view(0), view(1)] };
}

function Pips({ filled, total, label, tone }: { filled: number; total: number; label: string; tone: string }) {
  return (
    <span className="flex items-center gap-1" aria-label={`${filled} of ${total} ${label}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`size-2.5 rounded-full ${i < filled ? tone : "bg-foreground/15"}`} />
      ))}
    </span>
  );
}

function RunPage() {
  const search = Route.useSearch();
  const [login, setLogin] = useState(search.me ?? demoUser.current ?? "");
  const [player, setPlayer] = useState<Player | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [team, setTeam] = useState<Fighter[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [rerolls, setRerolls] = useState(0);
  const [picked, setPicked] = useState(false);
  const [held, setHeld] = useState<Fighter | null>(null);
  const [fight, setFight] = useState<Fight | null>(null);
  const [step, setStep] = useState(0);
  const [fast, setFast] = useState(false);
  const [inspecting, setInspecting] = useState<Fighter | null>(null);

  const over = wins >= WINS_TO_FINISH || losses >= LOSSES_TO_END;

  async function openRound(me: Player, number: number) {
    setLoading(true);
    setError("");
    try {
      const opponent = await fetchPlayer(opponentLogin(me.login, number));
      setRound({ number, opponent, theirs: opponentTeam(opponent, number) });
      setRerolls(0);
      setPicked(false);
      setHeld(null);
      setFight(null);
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
      setPlayer(me);
      setTeam(me.team.slice(0, 1));
      setWins(0);
      setLosses(0);
      await openRound(me, 1);
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : "The cards couldn't be read. Check the connection and try again.");
      setLoading(false);
    }
  }

  const shop = useMemo(() => (player && round && !picked ? shopFor(player, team, round.number, rerolls) : []), [player, round, picked, team, rerolls]);
  const full = team.length >= TEAM_MAX;

  function take(fighter: Fighter) {
    if (full) return setHeld(held?.fullName === fighter.fullName ? null : fighter);
    setTeam([...team, fighter]);
    setPicked(true);
  }
  function swapIn(slot: number) {
    if (!held) return;
    setTeam(team.map((fighter, i) => (i === slot ? held : fighter)));
    setHeld(null);
    setPicked(true);
  }
  function move(slot: number, by: -1 | 1) {
    const next = [...team];
    [next[slot], next[slot + by]] = [next[slot + by], next[slot]];
    setTeam(next);
  }

  function startFight() {
    if (!player || !round) return;
    const events = plainFight(snapshot(player.login, round.number, team), snapshot(round.opponent.login, round.number, round.theirs), `${player.login}|${round.opponent.login}|${round.number}|${today()}`);
    setFight({ mine: team, theirs: round.theirs, beats: beatsOf(events), winner: winnerOf(events) });
    setStep(0);
  }

  const total = fight?.beats.length ?? 0;
  const done = fight !== null && step >= total;
  useEffect(() => {
    if (!fight || step >= total || inspecting) return;
    const timer = setTimeout(() => setStep((s) => s + 1), fast ? STEP_MS / 2 : STEP_MS);
    return () => clearTimeout(timer);
  }, [fight, step, total, fast, inspecting]);

  function next() {
    if (!player || !round || !fight) return;
    // A draw counts for neither side.
    const won = wins + (fight.winner === 0 ? 1 : 0);
    const lost = losses + (fight.winner === 1 ? 1 : 0);
    setWins(won);
    setLosses(lost);
    if (won >= WINS_TO_FINISH || lost >= LOSSES_TO_END) return setFight(null);
    void openRound(player, round.number + 1);
  }

  const scene = useMemo(() => (fight ? sceneAt(fight, step) : null), [fight, step]);
  const sides = fight && scene && player && round ? ([0, 1] as Side[]).map((side) => {
    const fighters = side === 0 ? fight.mine : fight.theirs;
    const owner = side === 0 ? player : round.opponent;
    const fighter = fighters[scene.views[side].index];
    const hit = scene.last && scene.last.side !== side ? { damage: scene.last.damage, critical: scene.last.critical } : undefined;
    const view: SideView = { fighter, look: owner.character.look, stance: scene.views[side].stance, hit, won: done && fight.winner === side };
    return { view, fighter, owner, hp: scene.hp[side][scene.views[side].index], left: scene.hp[side].filter((value) => value > 0).length, total: fighters.length };
  }) : null;

  let line = "";
  if (fight && scene && player && round) {
    if (done) line = fight.winner === 0 ? `You win round ${round.number}.` : fight.winner === 1 ? `${round.opponent.character.name} wins round ${round.number}.` : "A draw.";
    else if (!scene.last) line = `${repoName(fight.mine[0])} against ${repoName(fight.theirs[0])}.`;
    else {
      const from = scene.last.side === 0 ? fight.mine : fight.theirs;
      const to = scene.last.side === 0 ? fight.theirs : fight.mine;
      line = [`${repoName(from[scene.last.slot])} hits ${repoName(to[scene.last.target])} for ${scene.last.damage}.`, scene.last.critical ? "A critical hit." : "", scene.last.out ? `${repoName(to[scene.last.target])} is out.` : ""].filter(Boolean).join(" ");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Play</h1>
          <p className="text-sm text-muted-foreground">Build a team from your stars. {WINS_TO_FINISH} wins finishes a run, {LOSSES_TO_END} losses ends one.</p>
        </div>
        {player && (
          <div className="flex items-center gap-4">
            <Pips filled={wins} total={WINS_TO_FINISH} label="Wins" tone="bg-primary" />
            <Pips filled={losses} total={LOSSES_TO_END} label="Losses" tone="bg-[#e5484d]" />
          </div>
        )}
      </div>

      {!player && (
        <form onSubmit={start} className="flex flex-wrap items-center gap-2">
          <Input value={login} onChange={(e) => setLogin(e.target.value.replace(/^@/, ""))} placeholder="Your GitHub username" aria-label="Your GitHub username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 basis-48" />
          <Button type="submit" disabled={!validLogin(login) || loading}><Play /> {loading ? "Reading your stars..." : "Start a run"}</Button>
        </form>
      )}

      {error && <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm" role="alert">{error}</p>}

      {player && over && !fight && (
        <div className="space-y-4 rounded-lg border p-5 text-center">
          <p className="font-display text-2xl font-bold tracking-tight">{wins >= WINS_TO_FINISH ? "Run finished" : "Run over"}</p>
          <p className="text-sm text-muted-foreground">{wins} {wins === 1 ? "win" : "wins"}, {losses} {losses === 1 ? "loss" : "losses"}.</p>
          <ul className="mx-auto grid max-w-2xl grid-cols-3 gap-3 sm:grid-cols-5">
            {team.map((fighter) => <li key={fighter.fullName}><RepoCard fighter={fighter} /></li>)}
          </ul>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => void start()} disabled={loading}><RotateCcw /> New run</Button>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"><Star className="size-4" /> Star Stard on GitHub</a>
          </div>
        </div>
      )}

      {player && round && !over && !fight && (
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Round {round.number} · against {round.opponent.character.name.toLowerCase() === round.opponent.login.toLowerCase() ? `@${round.opponent.login}` : `${round.opponent.character.name} (@${round.opponent.login})`}</h2>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
              {round.theirs.map((fighter, i) => (
                <li key={fighter.fullName} className="battle-deal" style={{ animationDelay: `${i * 70}ms` }}>
                  <button type="button" onClick={() => setInspecting(fighter)} className="block w-full cursor-zoom-in rounded-[5%] outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Look at ${fighter.fullName}`}><RepoCard fighter={fighter} /></button>
                </li>
              ))}
            </ul>
          </section>

          {!picked && shop.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{held ? "Choose a card on your team to replace" : full ? "Shop · take one to replace a card" : "Shop · take one"}</h2>
                <Button variant="outline" size="sm" disabled={rerolls > 0} onClick={() => { setRerolls(1); setHeld(null); }}><Dices /> Reroll</Button>
              </div>
              <ul className="mx-auto grid max-w-xl grid-cols-3 gap-3">
                {shop.map((fighter, i) => (
                  <li key={fighter.fullName} className="battle-deal space-y-1.5" style={{ animationDelay: `${i * 90}ms` }}>
                    <button type="button" onClick={() => setInspecting(fighter)} className={`block w-full cursor-zoom-in rounded-[5%] outline-none transition-transform duration-200 ease-out hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-ring ${held?.fullName === fighter.fullName ? "-translate-y-1 ring-2 ring-primary" : ""}`} aria-label={`Look at ${fighter.fullName}`}><RepoCard fighter={fighter} /></button>
                    <Button size="sm" className="w-full" variant={held?.fullName === fighter.fullName ? "default" : "outline"} onClick={() => take(fighter)}>{held?.fullName === fighter.fullName ? "Cancel" : "Take"}</Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your team · the first card fights first</h2>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
              {team.map((fighter, i) => (
                <li key={fighter.fullName} className="space-y-1.5">
                  <button type="button" onClick={() => (held ? swapIn(i) : setInspecting(fighter))} className={`block w-full rounded-[5%] outline-none focus-visible:ring-2 focus-visible:ring-ring ${held ? "cursor-pointer ring-2 ring-primary/60" : "cursor-zoom-in"}`} aria-label={held ? `Replace ${fighter.fullName}` : `Look at ${fighter.fullName}`}><RepoCard fighter={fighter} /></button>
                  <div className="flex justify-center gap-1">
                    <Button variant="outline" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${repoName(fighter)} forward`}><ArrowLeft /></Button>
                    <Button variant="outline" size="icon-sm" disabled={i === team.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${repoName(fighter)} back`}><ArrowRight /></Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="flex justify-center">
            <Button size="lg" onClick={startFight} disabled={loading}><Swords /> Fight</Button>
          </div>
        </div>
      )}

      {fight && sides && (
        <ArenaScene>
          <ArenaStage near={sides[0].view} far={sides[1].view} beat={step} speed={fast ? 2 : 1} onInspect={(where) => setInspecting(sides[where === "near" ? 0 : 1].fighter)} />
          {sides.map((side, i) => (
            <Nameplate key={i} near={i === 0} owner={side.owner.character.name} avatarUrl={side.owner.avatarUrl} fighter={side.fighter} hp={side.hp} left={side.left} total={side.total} onInspect={() => setInspecting(side.fighter)} />
          ))}
          <TextBox
            strong={done}
            actions={done ? (
              <Button size="sm" onClick={next} disabled={loading}>{loading ? "Reading the next team..." : "Continue"}</Button>
            ) : (
              <>
                <Button variant="outline" size="sm" aria-pressed={fast} onClick={() => setFast((f) => !f)}>{fast ? "2×" : "1×"}</Button>
                <Button variant="outline" size="sm" onClick={() => setStep(total)}><SkipForward /> Skip</Button>
              </>
            )}
          >
            {line}
          </TextBox>
        </ArenaScene>
      )}

      <InspectOverlay fighter={inspecting} onClose={() => setInspecting(null)} />
    </div>
  );
}
