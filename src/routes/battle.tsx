import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Layers, RotateCcw, SkipForward, Swords, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";
import { Figure } from "@/components/battle/figure";
import { RepoCard, TYPE, TypeDot } from "@/components/battle/repo-card";
import { demoUser } from "@/lib/demo";
import { APP_URL, CARD_ORIGIN, validLogin } from "@/lib/published-list";
import type { BattleEvent, BattleResult, Fighter, Side } from "../../server/battle";
import { CLASSES, defaultCharacter, type Character } from "../../server/character";

// The instant battle (issue #46): two usernames, a fight the demo's Worker decides
// (worker/src/battle.ts), staged here as an arena. The player's card stands large in
// the foreground, the opponent's across the floor, each with a nameplate and HP bar,
// and a text box tells the fight one hit at a time.

type Player = Character & { level: number; custom: boolean };
type Team = { login: string; avatarUrl: string | null; source: "profile" | "pinned" | "repos"; character: Player; team: Fighter[] };
type Battle = { a: Team; b: Team; seed: string; result: BattleResult };
type Stance = "enter" | "lunge" | "hit" | "ko" | "idle";

export const Route = createFileRoute("/battle")({
  component: BattlePage,
  validateSearch: (search: Record<string, unknown>): { a?: string; b?: string } => ({
    a: typeof search.a === "string" ? search.a : undefined,
    b: typeof search.b === "string" ? search.b : undefined,
  }),
});

const STEP_MS = 1500;
const SOURCE = { profile: "Top four from their profile", pinned: "Their pinned repos", repos: "Their most-starred repos" } as const;

const repoName = (fighter: Fighter) => fighter.fullName.split("/")[1] ?? fighter.fullName;
const otherSide = (side: Side): Side => (side === "a" ? "b" : "a");

// Where the fight stands after the first `step` hits: every card's HP, which card each
// side shows, and what that card is doing. A knocked-out card stays up for the hit that
// took it down, so the fall is seen before the next card comes in.
function sceneAt(battle: Battle, step: number) {
  const events = battle.result.events;
  const hp: Record<Side, number[]> = { a: battle.a.team.map((f) => f.hp), b: battle.b.team.map((f) => f.hp) };
  for (const event of events.slice(0, step)) hp[otherSide(event.side)][event.target] = event.targetHp;
  const last = step > 0 ? events[step - 1] : undefined;
  const before = step > 1 ? events[step - 2] : undefined;
  const view = (side: Side): { index: number; stance: Stance } => {
    const alive = hp[side].findIndex((value) => value > 0);
    const index = alive === -1 ? hp[side].length - 1 : alive;
    if (!last) return { index, stance: "enter" };
    if (last.side === side) return { index: last.attacker, stance: "lunge" };
    if (last.knockedOut) return { index: last.target, stance: "ko" };
    if (before && before.side !== side && before.knockedOut && before.target !== index) return { index, stance: "enter" };
    return { index, stance: "hit" };
  };
  return { hp, last, a: view("a"), b: view("b") };
}

function narrate(battle: Battle, step: number, done: boolean): string {
  if (done) {
    const winner = battle.result.winner === "b" ? battle.b : battle.a;
    return `${winner.character.name} wins the battle.`;
  }
  if (step === 0) return `${battle.a.character.name} sends out ${repoName(battle.a.team[0])}. ${battle.b.character.name} sends out ${repoName(battle.b.team[0])}.`;
  const event = battle.result.events[step - 1];
  const attacker = repoName(battle[event.side].team[event.attacker]);
  const target = repoName(battle[otherSide(event.side)].team[event.target]);
  return [
    `${attacker} uses ${event.move}.`,
    event.critical ? "A critical hit." : "",
    event.matchup === 1 ? "The type has the edge." : event.matchup === -1 ? `${target} resists.` : "",
    event.knockedOut ? `${target} is out.` : "",
  ].filter(Boolean).join(" ");
}

function Nameplate({ team, fighter, hp, left, className }: { team: Team; fighter: Fighter; hp: number; left: number; className: string }) {
  const share = hp / fighter.hp;
  const bar = share > 0.5 ? "bg-primary" : share > 0.2 ? "bg-[#e0a312]" : "bg-[#e5484d]";
  return (
    <div className={`absolute z-20 rounded-lg border border-white/15 bg-[#0c1014]/90 shadow-lg ${className}`} style={{ padding: "1.4cqw 1.8cqw" }}>
      <div className="flex items-center" style={{ gap: "1.2cqw" }}>
        {team.avatarUrl && <img src={team.avatarUrl} alt="" className="shrink-0 rounded-full" style={{ width: "4.6cqw", height: "4.6cqw" }} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-muted-foreground" style={{ fontSize: "max(1.5cqw, 10px)", lineHeight: 1.2 }}>
            {team.character.name}{team.character.klass === "rookie" ? "" : ` · ${CLASSES[team.character.klass].label}`}
          </p>
          <p className="truncate font-display font-bold tracking-tight" style={{ fontSize: "max(2.3cqw, 13px)", lineHeight: 1.15 }}>{repoName(fighter)}</p>
        </div>
        <span className="shrink-0 font-semibold tabular-nums" style={{ fontSize: "max(1.6cqw, 10px)" }}>Lv {fighter.level}</span>
        <TypeDot type={fighter.type} size="max(3cqw, 16px)" />
      </div>
      <div className="flex items-center" style={{ gap: "1cqw", marginTop: "0.9cqw" }}>
        <span className="font-semibold text-muted-foreground" style={{ fontSize: "max(1.3cqw, 9px)" }}>HP</span>
        <div className="flex-1 overflow-hidden rounded-full bg-white/10" style={{ height: "max(1.1cqw, 6px)" }} role="meter" aria-label={`${repoName(fighter)} HP`} aria-valuemin={0} aria-valuemax={fighter.hp} aria-valuenow={hp}>
          <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${bar}`} style={{ width: `${share * 100}%` }} />
        </div>
        <span className="tabular-nums" style={{ fontSize: "max(1.5cqw, 10px)" }}>{hp}/{fighter.hp}</span>
      </div>
      <div className="flex items-center" style={{ gap: "0.7cqw", marginTop: "0.9cqw" }} aria-label={`${left} of ${team.team.length} cards left`}>
        {team.team.map((f, i) => (
          <span key={f.fullName} className={`rounded-full ${i >= team.team.length - left ? "bg-foreground" : "bg-white/15"}`} style={{ width: "max(1.1cqw, 6px)", height: "max(1.1cqw, 6px)" }} />
        ))}
      </div>
    </div>
  );
}

// One side's card on the floor. The pose (the lean toward the other side) is fixed;
// the stance on top of it is what animates.
function Stage({ fighter, side, stance, event, step, onInspect }: { fighter: Fighter; side: Side; stance: Stance; event: BattleEvent | undefined; step: number; onInspect: () => void }) {
  const near = side === "a";
  const place = near
    ? "left-[6%] bottom-[20%] w-[42%] sm:left-[10%] sm:bottom-[21%] sm:w-[23%]"
    : "right-[8%] top-[14%] w-[29%] sm:right-[17%] sm:top-[9%] sm:w-[16%]";
  const motion = stance === "idle" ? "" : `battle-${stance}${stance === "lunge" ? (near ? "-near" : "-far") : ""}`;
  const struck = stance === "hit" || stance === "ko";
  return (
    <div className={`absolute ${near ? "z-10" : "z-0"} ${place}`}>
      <div className="battle-platform" style={{ "--type": TYPE[fighter.type].color } as React.CSSProperties} aria-hidden />
      <div style={{ transform: `perspective(900px) rotateY(${near ? 20 : -16}deg) rotateZ(${near ? -2 : 1.5}deg)` }}>
        <button type="button" key={`${step}-${fighter.fullName}`} onClick={onInspect} className={`relative block w-full cursor-zoom-in rounded-[5%] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${motion}`} aria-label={`Look at ${fighter.fullName}`}>
          <RepoCard fighter={fighter} />
          {struck && <span className="battle-flash pointer-events-none absolute inset-0 rounded-[5%] bg-white" aria-hidden />}
          {struck && event && (
            <span className={`battle-damage pointer-events-none absolute left-1/2 top-[28%] font-display font-bold tabular-nums ${event.critical ? "text-[#ffd23f]" : "text-white"}`} style={{ fontSize: near ? "max(5cqw, 26px)" : "max(4cqw, 22px)" }}>
              -{event.damage}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function TeamRow({ team, onInspect, delay }: { team: Team; onInspect: (fighter: Fighter) => void; delay: number }) {
  const klass = CLASSES[team.character.klass];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="shrink-0 rounded-md" style={{ background: klass.color }}>
          <Figure look={team.character.look} className="h-20 w-auto" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate font-display text-xl font-bold tracking-tight">{team.character.name}</h2>
          <p className="truncate text-sm">
            <span className="font-medium">{klass.label} · Lv {team.character.level}</span>
            <span className="text-muted-foreground"> · @{team.login}</span>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {team.character.klass === "rookie" ? SOURCE[team.source] : `${klass.perk} ${SOURCE[team.source]}.`}
          </p>
          {team.character.motto && <p className="truncate text-xs text-muted-foreground">“{team.character.motto}”</p>}
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {team.team.map((fighter, i) => (
          <li key={fighter.fullName} className="battle-deal" style={{ animationDelay: `${delay + i * 90}ms` }}>
            <button type="button" onClick={() => onInspect(fighter)} className="block w-full cursor-zoom-in rounded-[5%] text-left outline-none transition-transform duration-200 ease-out hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Look at ${fighter.fullName}`}>
              <RepoCard fighter={fighter} />
            </button>
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
  const [phase, setPhase] = useState<"teams" | "fight">("teams");
  const [step, setStep] = useState(0);
  const [fast, setFast] = useState(false);
  const [inspecting, setInspecting] = useState<Fighter | null>(null);

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
        // A copy of the Worker from before characters existed sends none.
        for (const team of [body.a, body.b]) team.character ??= { ...defaultCharacter(team.login), level: 1, custom: false };
        setBattle(body);
        setPhase("teams");
        setStep(0);
      })
      .catch((cause: unknown) => !stale && setError(cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : "The battle couldn't start. Check the connection and try again."))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [search.a, search.b]);

  const total = battle?.result.events.length ?? 0;
  const done = battle !== null && phase === "fight" && step >= total;
  // The fight waits while a card is being looked at.
  useEffect(() => {
    if (!battle || phase !== "fight" || step >= total || inspecting) return;
    const timer = setTimeout(() => setStep((s) => s + 1), fast ? STEP_MS / 2 : STEP_MS);
    return () => clearTimeout(timer);
  }, [battle, phase, step, total, fast, inspecting]);

  useEffect(() => {
    if (!inspecting) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setInspecting(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [inspecting]);

  const scene = useMemo(() => (battle ? sceneAt(battle, step) : null), [battle, step]);

  const ready = validLogin(a) && validLogin(b);
  function start(event: React.FormEvent) {
    event.preventDefault();
    if (ready) void navigate({ search: { a: a.trim(), b: b.trim() } });
  }

  const query = battle ? `a=${encodeURIComponent(battle.a.login)}&b=${encodeURIComponent(battle.b.login)}` : "";
  let share = "";
  if (battle && done) {
    const { winner, standing } = battle.result;
    const won = winner === "b" ? battle.b : battle.a;
    const lost = winner === "b" ? battle.a : battle.b;
    const left = standing[winner ?? "a"];
    share = `[![${won.login} beat ${lost.login} with ${left} ${left === 1 ? "card" : "cards"} left](${CARD_ORIGIN}/api/card/battle.svg?${query})](${APP_URL}battle?${query})`;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Battle</h1>
        <p className="text-sm text-muted-foreground">Two GitHub usernames. Each one's top four repos fight as cards.</p>
      </div>

      <form onSubmit={start} className="flex flex-wrap items-center gap-2">
        <Input value={a} onChange={(e) => setA(e.target.value.replace(/^@/, ""))} placeholder="Your username" aria-label="Your GitHub username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 basis-36" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">vs</span>
        <Input value={b} onChange={(e) => setB(e.target.value.replace(/^@/, ""))} placeholder="Their username" aria-label="Their GitHub username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 basis-36" />
        <Button type="submit" disabled={!ready || loading}>
          <Swords /> {loading ? "Reading both teams..." : "Find teams"}
        </Button>
      </form>

      {error && <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm" role="alert">{error}</p>}

      {!battle && !loading && !error && (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          A team is the top four in someone's Stard profile. Without a profile, their pinned repos play. A repo you own is shiny and stronger.
        </p>
      )}

      {battle && phase === "teams" && (
        <div className="space-y-6">
          <TeamRow team={battle.b} onInspect={setInspecting} delay={0} />
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <Button size="lg" onClick={() => { setStep(0); setPhase("fight"); }}><Swords /> Start the battle</Button>
            <div className="h-px flex-1 bg-border" />
          </div>
          <TeamRow team={battle.a} onInspect={setInspecting} delay={360} />
        </div>
      )}

      {battle && scene && phase === "fight" && (
        <div className="@container">
          <div className="battle-scene relative aspect-[4/5] overflow-hidden rounded-xl border sm:aspect-[16/10]">
            <div className="battle-wall" aria-hidden />
            <div className="battle-floor" aria-hidden />

            {/* Each player's character stands behind their card. */}
            <Figure look={battle.b.character.look} flip className="absolute right-[1%] top-[24%] z-0 w-[13%] sm:right-[5%] sm:top-[13%] sm:w-[8%]" />
            <Figure look={battle.a.character.look} className="absolute bottom-[19%] left-[-3%] z-0 w-[19%] sm:bottom-[19%] sm:left-[1%] sm:w-[11%]" />

            <Stage fighter={battle.b.team[scene.b.index]} side="b" stance={scene.b.stance} event={scene.last} step={step} onInspect={() => setInspecting(battle.b.team[scene.b.index])} />
            <Stage fighter={battle.a.team[scene.a.index]} side="a" stance={scene.a.stance} event={scene.last} step={step} onInspect={() => setInspecting(battle.a.team[scene.a.index])} />

            <Nameplate team={battle.b} fighter={battle.b.team[scene.b.index]} hp={scene.hp.b[scene.b.index]} left={scene.hp.b.filter((v) => v > 0).length} className="left-[3%] top-[3%] w-[58%] sm:left-[4%] sm:top-[5%] sm:w-[34%]" />
            <Nameplate team={battle.a} fighter={battle.a.team[scene.a.index]} hp={scene.hp.a[scene.a.index]} left={scene.hp.a.filter((v) => v > 0).length} className="bottom-[19%] right-[3%] w-[47%] sm:bottom-[21%] sm:right-[4%] sm:w-[34%]" />

            <div className="absolute inset-x-0 bottom-0 z-30 flex h-[16%] items-center gap-3 border-t border-white/15 bg-[#0c1014]/95 px-3 sm:h-[17%] sm:px-5">
              <p className={`min-w-0 flex-1 text-sm sm:text-base ${done ? "font-display text-base font-bold tracking-tight sm:text-xl" : ""}`} aria-live="polite">{narrate(battle, step, done)}</p>
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                {done ? (
                  <Button variant="outline" size="sm" onClick={() => setStep(0)}><RotateCcw /> Replay</Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" aria-pressed={fast} onClick={() => setFast((f) => !f)}>{fast ? "2×" : "1×"}</Button>
                    <Button variant="outline" size="sm" onClick={() => setStep(total)}><SkipForward /> Skip</Button>
                  </>
                )}
                <Button variant="outline" size="sm" onClick={() => setPhase("teams")}><Layers /> Cards</Button>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-xs tabular-nums text-muted-foreground">
              Hit {Math.min(step, total)} of {total}. The same matchup plays the same way all day, so anyone can check the result.
            </p>
            {done && <CopyButton text={share} label="Copy the result card" />}
            <CopyButton text={`${APP_URL}battle?${query}`} label="Copy link" />
          </div>
        </div>
      )}

      {inspecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6" role="dialog" aria-modal="true" aria-label={inspecting.fullName} onClick={() => setInspecting(null)}>
          <div className="battle-deal w-[min(86vw,22rem,56vh)]" onClick={(e) => e.stopPropagation()}>
            <RepoCard fighter={inspecting} tilt />
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <a href={`https://github.com/${inspecting.fullName}`} target="_blank" rel="noopener noreferrer" className="truncate underline-offset-4 hover:underline">{inspecting.fullName}</a>
              <Button variant="outline" size="sm" onClick={() => setInspecting(null)}><X /> Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
