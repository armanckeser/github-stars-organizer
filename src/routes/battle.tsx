import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RotateCcw, SkipForward, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";
import { Poster } from "@/components/battle/poster";
import { demoUser } from "@/lib/demo";
import { APP_URL, CARD_ORIGIN, validLogin } from "@/lib/published-list";
import type { BattleEvent, BattleResult, Fighter, Side } from "../../server/battle";

// The instant battle (issue #46): two usernames, a fight the demo's Worker decides
// (worker/src/battle.ts), played back here one hit at a time.

type Team = { login: string; source: "profile" | "pinned" | "repos"; team: Fighter[] };
type Battle = { a: Team; b: Team; seed: string; result: BattleResult };

export const Route = createFileRoute("/battle")({
  component: BattlePage,
  validateSearch: (search: Record<string, unknown>): { a?: string; b?: string } => ({
    a: typeof search.a === "string" ? search.a : undefined,
    b: typeof search.b === "string" ? search.b : undefined,
  }),
});

const STEP_MS = 700;
const SOURCE = { profile: "Top four from their profile", pinned: "Their pinned repos", repos: "Their most-starred repos" } as const;
const TYPE_NOTE = { 1: " The type has the edge.", 0: "", [-1]: " The type is at a disadvantage." } as const;

const repoName = (fighter: Fighter) => fighter.fullName.split("/")[1] ?? fighter.fullName;

// Where the fight stands after the first `step` hits: every card's HP and who is up.
function stateAt(battle: Battle, step: number) {
  const hp: Record<Side, number[]> = { a: battle.a.team.map((f) => f.hp), b: battle.b.team.map((f) => f.hp) };
  for (const event of battle.result.events.slice(0, step)) hp[event.side === "a" ? "b" : "a"][event.target] = event.targetHp;
  const active = (side: Side) => {
    const up = hp[side].findIndex((value) => value > 0);
    return up === -1 ? hp[side].length - 1 : up;
  };
  return { hp, active: { a: active("a"), b: active("b") } };
}

function describe(battle: Battle, event: BattleEvent): string {
  const other: Side = event.side === "a" ? "b" : "a";
  const attacker = repoName(battle[event.side].team[event.attacker]);
  const target = repoName(battle[other].team[event.target]);
  const hit = `${attacker} hits ${target} for ${event.damage}${event.critical ? ", a critical hit" : ""}.`;
  return `${hit}${TYPE_NOTE[event.matchup]}${event.knockedOut ? ` ${target} is out.` : ""}`;
}

function TeamColumn({ team, side, hp, active, last, step }: { team: Team; side: Side; hp: number[]; active: number; last: BattleEvent | undefined; step: number }) {
  const fighter = team.team[active];
  const attacking = last?.side === side;
  const hit = last !== undefined && !attacking;
  const lunge = side === "a" ? "motion-safe:animate-[battle-lunge-right_450ms_ease-out]" : "motion-safe:animate-[battle-lunge-left_450ms_ease-out]";
  return (
    <div className="min-w-0 space-y-3">
      <div>
        <h2 className="truncate font-display text-lg font-bold tracking-tight">{team.login}</h2>
        <p className="truncate text-xs text-muted-foreground">{SOURCE[team.source]}</p>
      </div>
      {/* Keyed on the step so the animation runs again for every hit. */}
      <div key={`${step}-${active}`} className={`mx-auto w-full max-w-44 ${attacking ? lunge : hit ? "motion-safe:animate-[battle-hit_450ms_ease-out]" : ""}`}>
        <Poster fighter={fighter} className={hp[active] === 0 ? "opacity-30 grayscale" : ""} />
      </div>
      <div className="mx-auto max-w-44 space-y-1">
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-label={`${repoName(fighter)} HP`} aria-valuemin={0} aria-valuemax={fighter.hp} aria-valuenow={hp[active]}>
          <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${(hp[active] / fighter.hp) * 100}%` }} />
        </div>
        <p className="flex justify-between text-xs tabular-nums text-muted-foreground">
          <span>Lv {fighter.level} · {fighter.type}{fighter.shiny ? " · shiny" : ""}{fighter.retired ? " · retired" : ""}</span>
          <span>{hp[active]}/{fighter.hp}</span>
        </p>
      </div>
      <ul className="mx-auto grid max-w-44 grid-cols-4 gap-1.5">
        {team.team.map((f, i) => (
          <li key={f.fullName} className={i === active ? "" : hp[i] === 0 ? "opacity-25 grayscale" : "opacity-70"}>
            <Poster fighter={f} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BattlePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/battle" });
  const [a, setA] = useState(search.a ?? demoUser.current ?? "");
  const [b, setB] = useState(search.b ?? "");
  const [battle, setBattle] = useState<Battle | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);

  // The address holds the matchup, so a battle link plays the same fight for whoever opens the link.
  useEffect(() => {
    if (!search.a || !search.b) return;
    let stale = false;
    setLoading(true);
    setError("");
    setBattle(null);
    fetch(`${CARD_ORIGIN}/api/battle?a=${encodeURIComponent(search.a)}&b=${encodeURIComponent(search.b)}`)
      .then(async (response) => {
        const body = (await response.json()) as Battle & { error?: string };
        if (stale) return;
        if (!response.ok) throw new Error(body.error ?? "The battle couldn't start.");
        setBattle(body);
        setStep(0);
      })
      .catch((cause: unknown) => !stale && setError(cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : "The battle couldn't start. Check the connection and try again."))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [search.a, search.b]);

  const total = battle?.result.events.length ?? 0;
  const done = battle !== null && step >= total;
  useEffect(() => {
    if (!battle || step >= total) return;
    const timer = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [battle, step, total]);

  const state = useMemo(() => (battle ? stateAt(battle, step) : null), [battle, step]);
  const last = battle && step > 0 ? battle.result.events[step - 1] : undefined;

  const ready = validLogin(a) && validLogin(b);
  function start(event: React.FormEvent) {
    event.preventDefault();
    if (ready) void navigate({ search: { a: a.trim(), b: b.trim() } });
  }

  let headline = "";
  let share = "";
  if (battle && done) {
    const { winner, standing } = battle.result;
    const won = winner === "b" ? battle.b : battle.a;
    const lost = winner === "b" ? battle.a : battle.b;
    const left = standing[winner ?? "a"];
    headline = `${won.login} beat ${lost.login} with ${left} ${left === 1 ? "card" : "cards"} left`;
    const query = `a=${encodeURIComponent(battle.a.login)}&b=${encodeURIComponent(battle.b.login)}`;
    share = `[![${headline}](${CARD_ORIGIN}/api/card/battle.svg?${query})](${APP_URL}battle?${query})`;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Battle</h1>
        <p className="text-sm text-muted-foreground">Two GitHub usernames. Each one's top four repos fight as cards.</p>
      </div>

      <form onSubmit={start} className="flex flex-wrap items-center gap-2">
        <Input value={a} onChange={(e) => setA(e.target.value.replace(/^@/, ""))} placeholder="Your username" aria-label="Your GitHub username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 basis-36" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">vs</span>
        <Input value={b} onChange={(e) => setB(e.target.value.replace(/^@/, ""))} placeholder="Their username" aria-label="Their GitHub username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 basis-36" />
        <Button type="submit" disabled={!ready || loading}>
          <Swords /> {loading ? "Reading both teams..." : "Battle"}
        </Button>
      </form>

      {error && <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm" role="alert">{error}</p>}

      {!battle && !loading && !error && (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          A team is the top four in someone's Stard profile. Without a profile, their pinned repos play. A repo you own is shiny and stronger.
        </p>
      )}

      {battle && state && (
        <div className="space-y-5 rounded-lg border bg-card p-4 sm:p-6">
          <div className="grid grid-cols-2 gap-4 sm:gap-10">
            <TeamColumn team={battle.a} side="a" hp={state.hp.a} active={state.active.a} last={last} step={step} />
            <TeamColumn team={battle.b} side="b" hp={state.hp.b} active={state.active.b} last={last} step={step} />
          </div>

          <p className="min-h-10 text-center text-sm" aria-live="polite">
            {done ? <span className="font-display text-lg font-bold tracking-tight">{headline}</span> : last ? describe(battle, last) : "The faster card hits first."}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {done ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setStep(0)}><RotateCcw /> Replay</Button>
                <CopyButton text={share} label="Copy the result card" />
                <CopyButton text={`${APP_URL}battle?a=${encodeURIComponent(battle.a.login)}&b=${encodeURIComponent(battle.b.login)}`} label="Copy link" />
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setStep(total)}><SkipForward /> Skip to the end</Button>
            )}
          </div>
          <p className="text-center text-xs tabular-nums text-muted-foreground">
            Hit {Math.min(step, total)} of {total}. The same matchup plays the same way all day, so anyone can check the result.
          </p>
        </div>
      )}
    </div>
  );
}
