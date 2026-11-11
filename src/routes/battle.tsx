import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Layers, RotateCcw, Send, SkipForward, Star, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";
import { ArenaScene, ArenaStage, InspectOverlay, Nameplate, TextBox, repoName, type SideView, type Stance } from "@/components/battle/arena";
import { Figure } from "@/components/battle/figure";
import { MatchList } from "@/components/battle/match-list";
import { RepoCard } from "@/components/battle/repo-card";
import { demoUser } from "@/lib/demo";
import { CAN_PLAY, challenge, playingAs } from "@/lib/game-api";
import { APP_URL, CARD_ORIGIN, REPO_URL, validLogin } from "@/lib/published-list";
import type { BattleResult, Fighter, Side } from "../../server/battle";
import { CLASSES, defaultCharacter, type Character } from "../../server/character";

// The Battle screen. Two usernames give an instant battle (issue #46): a fight the
// demo's Worker decides (worker/src/battle.ts), staged in the arena one hit at a
// time. From the same screen a player can challenge the other to a real match, played
// over a GitHub thread (routes/game.tsx), and see the matches they are in.

type Player = Character & { level: number; custom: boolean };
type Team = { login: string; avatarUrl: string | null; source: "profile" | "pinned" | "stars" | "repos"; character: Player; team: Fighter[] };
type Battle = { a: Team; b: Team; seed: string; result: BattleResult };

export const Route = createFileRoute("/battle")({
  component: BattlePage,
  validateSearch: (search: Record<string, unknown>): { a?: string; b?: string; me?: string } => ({
    a: typeof search.a === "string" ? search.a : undefined,
    b: typeof search.b === "string" ? search.b : undefined,
    me: typeof search.me === "string" ? search.me : undefined,
  }),
});

const STEP_MS = 1500;
const SOURCE = {
  profile: "Ace from their profile, the rest drawn from their stars today",
  pinned: "Ace from their pinned repos, the rest drawn from their stars today",
  stars: "Drawn from their stars today",
  repos: "Their top repo, the rest drawn from their stars today",
} as const;
const NPX = "npx github-stars-organizer";

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

const ownerLine = (team: Team) => `${team.character.name}${team.character.klass === "rookie" ? "" : ` · ${CLASSES[team.character.klass].label}`}`;

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
            {team.character.klass === "rookie" ? `${SOURCE[team.source]}.` : `${klass.perk} ${SOURCE[team.source]}.`}
          </p>
          {team.character.motto && <p className="truncate text-xs text-muted-foreground">“{team.character.motto}”</p>}
        </div>
      </div>
      <ul className={`grid grid-cols-2 gap-3 ${team.team.length > 4 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
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

// The step from a quick fight to a real one: a thread on GitHub where both players choose their moves.
function ChallengePanel({ battle, me }: { battle: Battle; me: string | null }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mine = me !== null && me.toLowerCase() === battle.a.login.toLowerCase();

  async function send() {
    if (!me) return;
    setBusy(true);
    setError("");
    try {
      const thread = await challenge(me, battle.b.login);
      await navigate({ to: "/game", search: { repo: thread.repo, n: thread.number } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The challenge couldn't be sent.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm">
      <p className="font-medium">Play {battle.b.character.name} for real</p>
      <p className="text-muted-foreground">
        A real match is turn by turn: you each choose to attack, guard, switch or use a special, over hours or days. The match is a thread on your GitHub profile repo, and {battle.b.login} gets a notification.
      </p>
      {!CAN_PLAY ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Moves are posted as you, so playing needs your own copy:</span>
          <CopyButton text={NPX} label={NPX} />
        </div>
      ) : !me ? (
        <p className="text-muted-foreground">Connect GitHub to this copy first.</p>
      ) : !mine ? (
        <p className="text-muted-foreground">You are signed in as {me}. Put your own username on the left to challenge {battle.b.login}.</p>
      ) : (
        <Button onClick={send} disabled={busy}><Send /> {busy ? "Opening the thread..." : `Challenge ${battle.b.login}`}</Button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function BattlePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/battle" });
  const [me, setMe] = useState<string | null>(null);
  const [a, setA] = useState(search.a ?? search.me ?? demoUser.current ?? "");
  const [b, setB] = useState(search.b ?? "");
  const [battle, setBattle] = useState<Battle | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"teams" | "fight">("teams");
  const [step, setStep] = useState(0);
  const [fast, setFast] = useState(false);
  const [inspecting, setInspecting] = useState<Fighter | null>(null);

  // Whose matches the hub lists: the account this copy plays as, else the name a link or the form gives.
  useEffect(() => {
    let stale = false;
    void playingAs().then((login) => {
      if (stale || !login) return;
      setMe(login);
      setA((current) => current || login);
    });
    return () => {
      stale = true;
    };
  }, []);
  const hubLogin = me ?? search.me ?? (validLogin(a) ? a.trim() : null);

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

  // The share picture is slow to draw, so the Worker draws and caches it before anyone shares the link.
  useEffect(() => {
    if (!search.a || !search.b || !validLogin(search.a) || !validLogin(search.b)) return;
    fetch(`${CARD_ORIGIN}/api/card/versus.png?a=${encodeURIComponent(search.a)}&b=${encodeURIComponent(search.b)}`).catch(() => {});
  }, [search.a, search.b]);

  const total = battle?.result.events.length ?? 0;
  const done = battle !== null && phase === "fight" && step >= total;
  // The fight waits while a card is being looked at.
  useEffect(() => {
    if (!battle || phase !== "fight" || step >= total || inspecting) return;
    const timer = setTimeout(() => setStep((s) => s + 1), fast ? STEP_MS / 2 : STEP_MS);
    return () => clearTimeout(timer);
  }, [battle, phase, step, total, fast, inspecting]);

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

  const sideOf = (side: Side): SideView | null => {
    if (!battle || !scene) return null;
    const hit = scene.last && scene.last.side !== side ? { damage: scene.last.damage, critical: scene.last.critical } : undefined;
    return { fighter: battle[side].team[scene[side].index], look: battle[side].character.look, stance: scene[side].stance, hit, special: scene.last?.side === side && scene.last.special, won: done && battle.result.winner === side };
  };
  const plateOf = (side: Side) => {
    if (!battle || !scene) return null;
    const fighter = battle[side].team[scene[side].index];
    return <Nameplate near={side === "a"} owner={ownerLine(battle[side])} avatarUrl={battle[side].avatarUrl} fighter={fighter} hp={scene.hp[side][scene[side].index]} left={scene.hp[side].filter((v) => v > 0).length} total={battle[side].team.length} onInspect={() => setInspecting(fighter)} />;
  };
  const nearSide = sideOf("a");
  const farSide = sideOf("b");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Battle</h1>
        <p className="text-sm text-muted-foreground">Two GitHub usernames. Each one's repos fight as cards.</p>
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
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          A team is four cards: one ace you pick and three drawn from your stars each day. Both sides play the same number of cards.
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
          <ChallengePanel battle={battle} me={me} />
        </div>
      )}

      {battle && scene && phase === "fight" && (
        <div>
          <ArenaScene>
            {nearSide && farSide && <ArenaStage near={nearSide} far={farSide} beat={step} speed={fast ? 2 : 1} onInspect={(where) => setInspecting(where === "near" ? nearSide.fighter : farSide.fighter)} />}
            {plateOf("b")}
            {plateOf("a")}
            <TextBox
              strong={done}
              actions={
                <>
                  {done ? (
                    <Button variant="outline" size="sm" onClick={() => setStep(0)}><RotateCcw /> Replay</Button>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" aria-pressed={fast} onClick={() => setFast((f) => !f)}>{fast ? "2×" : "1×"}</Button>
                      <Button variant="outline" size="sm" onClick={() => setStep(total)}><SkipForward /> Skip</Button>
                    </>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setPhase("teams")}><Layers /> Cards</Button>
                </>
              }
            >
              {narrate(battle, step, done)}
            </TextBox>
          </ArenaScene>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-xs tabular-nums text-muted-foreground">
              Hit {Math.min(step, total)} of {total}
            </p>
            {done && <CopyButton text={share} label="Copy the result card" />}
            {!done && <CopyButton text={`${APP_URL}battle?${query}`} label="Copy link" />}
          </div>
          {done && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"><Star className="size-4" /> Star Stard on GitHub</a>
              <CopyButton text={`${APP_URL}battle?${query}`} label="Share" />
            </div>
          )}
        </div>
      )}

      {hubLogin && (
        <section className="space-y-2 pt-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{me ? "Your matches" : `${hubLogin}'s matches`}</h2>
          <MatchList login={hubLogin} />
        </section>
      )}

      <InspectOverlay fighter={inspecting} onClose={() => setInspecting(null)} />
    </div>
  );
}
