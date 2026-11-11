import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowLeftRight, ExternalLink, Shield, Sparkles, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";
import { ArenaScene, ArenaStage, InspectOverlay, Nameplate, TextBox, repoName, type SideView, type Stance } from "@/components/battle/arena";
import { RepoCard } from "@/components/battle/repo-card";
import { CAN_PLAY, fetchMatch, playingAs, postComment, type Match } from "@/lib/game-api";
import type { Fighter, Side } from "../../server/battle";
import { CLASSES } from "../../server/character";
import { ENERGY_FOR_SPECIAL, applyAction, legalActions, moveComment, replyComment, type Action, type GameEvent, type GameState } from "../../server/game";

// A match played over a GitHub thread (issue #47). The Worker works the match out
// from the thread's comments; this screen shows where the match stands and, for the
// player whose turn it is, what each choice would do. The dice are public, so the
// numbers on the buttons are exactly what will happen. A move is posted as a comment.

export const Route = createFileRoute("/game")({
  component: GamePage,
  validateSearch: (search: Record<string, unknown>): { repo?: string; n?: number } => ({
    repo: typeof search.repo === "string" ? search.repo : undefined,
    n: Number.isInteger(Number(search.n)) && Number(search.n) > 0 ? Number(search.n) : undefined,
  }),
});

const POLL_MS = 15_000;
const NPX = "npx github-stars-organizer";
const other = (side: Side): Side => (side === "a" ? "b" : "a");

function describe(state: GameState, event: GameEvent): string {
  const who = state.players[event.side].name;
  const card = repoName(state.teams[event.side][event.card]);
  if (event.action === "guard") return `${who}'s ${card} guards.`;
  if (event.action === "switch") return `${who} switches to ${repoName(state.teams[event.side][event.to ?? 0])}.`;
  const target = repoName(state.teams[other(event.side)][event.target ?? 0]);
  return [
    `${card} uses ${event.move} on ${target}: ${event.damage} damage.`,
    event.critical ? "A critical hit." : "",
    event.guarded ? "The guard took half." : "",
    event.knockedOut ? `${target} is out.` : "",
  ].filter(Boolean).join(" ");
}

function statusLine(state: GameState, mine: Side | null): string {
  const { a, b } = state.players;
  if (state.status === "waiting") return mine === "b" ? `${a.name} challenged you.` : `Waiting for ${b.name} to accept.`;
  if (state.status === "declined") return `${b.name} declined the challenge.`;
  if (state.status === "void") return state.reason ?? "This match doesn't count.";
  if (state.status === "won") {
    const winner = state.players[state.winner ?? "a"].name;
    return `${state.winner === mine ? "You win" : `${winner} wins`}.${state.reason ? ` ${state.reason}` : ""}`;
  }
  return state.next === mine ? "Your move." : `Waiting for ${state.players[state.next ?? "a"].name}.`;
}

// What an action would do, worked out with the same rules the referee uses.
function preview(state: GameState, seed: string, side: Side, action: Action): GameEvent {
  return applyAction(state, seed, side, action, "preview", "").events.at(-1)!;
}

function ActionButton({ icon, title, detail, disabled, onClick }: { icon: React.ReactNode; title: string; detail: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-16 items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-[background-color,transform] duration-150 hover:bg-accent active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
    >
      <span className="shrink-0 text-muted-foreground [&_svg]:size-5">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}

function Bench({ state, side, onInspect }: { state: GameState; side: Side; onInspect: (fighter: Fighter) => void }) {
  const mine = state.sides[side];
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="truncate text-xs text-muted-foreground">
        {state.players[side].name}{state.players[side].klass === "rookie" ? "" : ` · ${CLASSES[state.players[side].klass].label}`}
      </p>
      <ul className="flex gap-1.5">
        {state.teams[side].map((fighter, i) => (
          <li key={fighter.fullName} className={`w-14 shrink-0 sm:w-16 ${mine.hp[i] === 0 ? "opacity-30 grayscale" : i === mine.active ? "" : "opacity-75"}`}>
            <button type="button" onClick={() => onInspect(fighter)} className={`block w-full cursor-zoom-in rounded-[5%] outline-none focus-visible:ring-2 focus-visible:ring-ring ${i === mine.active ? "ring-2 ring-foreground" : ""}`} aria-label={`Look at ${fighter.fullName}`}>
              <RepoCard fighter={fighter} />
            </button>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted" aria-label={`${repoName(fighter)}: ${mine.hp[i]} of ${fighter.hp} HP`}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${(mine.hp[i] / fighter.hp) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GamePage() {
  const { repo, n } = Route.useSearch();
  const [match, setMatch] = useState<Match | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [inspecting, setInspecting] = useState<Fighter | null>(null);
  const [chat, setChat] = useState("");

  const load = useCallback(
    async (fresh = false) => {
      if (!repo || !n) return;
      try {
        setMatch(await fetchMatch(repo, n, fresh));
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Couldn't read that match.");
      }
    },
    [repo, n],
  );

  useEffect(() => {
    void load();
    void playingAs().then(setMe);
  }, [load]);

  // The other player moves whenever they like, so a match still in play is checked again now and then.
  const live = match?.state.status === "waiting" || match?.state.status === "active";
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [live, load]);

  const state = match?.state;
  const seed = match?.thread.id ?? "";
  const mine: Side | null = !state || !me ? null : state.players.a.login.toLowerCase() === me.toLowerCase() ? "a" : state.players.b.login.toLowerCase() === me.toLowerCase() ? "b" : null;
  const near: Side = mine ?? "a";
  const myTurn = state?.status === "active" && mine !== null && state.next === mine;
  const legal = useMemo(() => (state && mine ? legalActions(state, mine) : []), [state, mine]);

  async function post(body: string, after?: GameState) {
    if (!match) return;
    setBusy(true);
    setError("");
    try {
      const comment = await postComment(match.thread, body);
      // Shown at once from the same rules the referee will apply, then confirmed from the thread.
      if (after) setMatch({ ...match, state: { ...after, last: comment.id } });
      setSwitching(false);
      setTimeout(() => void load(true), 1500);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "GitHub didn't take that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function play(action: Action) {
    if (!state || !mine) return;
    const after = applyAction(state, seed, mine, action, "pending", new Date().toISOString());
    const line = describe(after, after.events.at(-1)!);
    void post(moveComment(state.turn, action, state.last, `**Turn ${state.turn}.** ${line}`), after);
  }

  if (!repo || !n) {
    return <p className="text-sm text-muted-foreground">This link doesn't point at a match. <Link to="/battle" className="underline underline-offset-4">Go to Battle</Link>.</p>;
  }
  if (!match || !state) {
    return <p className="text-sm text-muted-foreground" role={error ? "alert" : undefined}>{error || "Reading the match from its thread..."}</p>;
  }

  const lastEvent = state.events.at(-1);
  const stanceOf = (side: Side): Stance => {
    if (!lastEvent) return state.status === "active" ? "enter" : "idle";
    const attacked = lastEvent.action === "attack" || lastEvent.action === "special";
    if (lastEvent.side === side) return attacked ? "lunge" : lastEvent.action === "switch" ? "enter" : "idle";
    if (!attacked) return "idle";
    // A knocked-out card has already been replaced by the next in line.
    return lastEvent.knockedOut ? (state.status === "won" ? "ko" : "enter") : "hit";
  };
  const sideOf = (side: Side): SideView => {
    const hit = lastEvent && lastEvent.side !== side && lastEvent.damage !== undefined ? { damage: lastEvent.damage, critical: lastEvent.critical ?? false } : undefined;
    return {
      fighter: state.teams[side][state.sides[side].active],
      look: state.players[side].look,
      stance: stanceOf(side),
      hit,
      special: lastEvent?.side === side && lastEvent.action === "special",
      guarding: state.sides[side].guarding,
      won: state.status === "won" && state.winner === side,
    };
  };
  const plateOf = (side: Side) => {
    const sideState = state.sides[side];
    const fighter = state.teams[side][sideState.active];
    const player = state.players[side];
    return (
      <Nameplate
        near={side === near}
        owner={`${player.name}${player.klass === "rookie" ? "" : ` · ${CLASSES[player.klass].label}`}`}
        avatarUrl={player.avatarUrl}
        fighter={fighter}
        hp={sideState.hp[sideState.active]}
        left={sideState.hp.filter((v) => v > 0).length}
        total={sideState.hp.length}
        energy={sideState.energy[sideState.active]}
        onInspect={() => setInspecting(fighter)}
      />
    );
  };
  const nearSide = sideOf(near);
  const farSide = sideOf(other(near));

  const can = (kind: Action["kind"]) => legal.some((action) => action.kind === kind);
  const attack = myTurn && mine ? preview(state, seed, mine, { kind: "attack" }) : null;
  const special = myTurn && mine && can("special") ? preview(state, seed, mine, { kind: "special" }) : null;
  const hitDetail = (event: GameEvent) => `${event.damage} damage${event.critical ? " · critical" : ""}${event.knockedOut ? " · knocks out" : ""}`;
  const active = mine ? state.teams[mine][state.sides[mine].active] : null;
  const charge = mine ? state.sides[mine].energy[state.sides[mine].active] : 0;
  const switches = legal.filter((action): action is { kind: "switch"; to: number } => action.kind === "switch");

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link to="/battle" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Battle</Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-xl font-bold tracking-tight sm:text-2xl">{state.players.a.name} vs {state.players.b.name}</h1>
        <a href={match.thread.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          GitHub thread <ExternalLink className="size-3.5" />
        </a>
      </div>

      <ArenaScene>
        <ArenaStage near={nearSide} far={farSide} beat={state.events.length} onInspect={(where) => setInspecting(where === "near" ? nearSide.fighter : farSide.fighter)} />
        {plateOf(other(near))}
        {plateOf(near)}
        <TextBox strong={state.status !== "active"}>
          {lastEvent && state.status === "active" ? `${describe(state, lastEvent)} ${statusLine(state, mine)}` : statusLine(state, mine)}
        </TextBox>
      </ArenaScene>

      {error && <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm" role="alert">{error}</p>}

      {state.status === "waiting" && mine === "b" && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void post(replyComment("accept", `${state.players.b.name} accepts the challenge.`))}><Swords /> Accept the challenge</Button>
          <Button variant="outline" disabled={busy} onClick={() => void post(replyComment("decline", `${state.players.b.name} declines the challenge.`))}>Decline</Button>
        </div>
      )}

      {myTurn && mine && active && attack && (
        <div className="space-y-2">
          {switching ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Switch to which card? The switch uses your turn.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {switches.map((action) => {
                  const fighter = state.teams[mine][action.to];
                  return (
                    <ActionButton key={action.to} icon={<ArrowLeftRight />} title={repoName(fighter)} detail={`${state.sides[mine].hp[action.to]}/${fighter.hp} HP · Lv ${fighter.level} · ${fighter.type}`} disabled={busy} onClick={() => play(action)} />
                  );
                })}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSwitching(false)}>Back</Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <ActionButton icon={<Swords />} title={active.moves[0].name} detail={hitDetail(attack)} disabled={busy} onClick={() => play({ kind: "attack" })} />
              <ActionButton
                icon={<Sparkles />}
                title={active.moves[1].name}
                detail={special ? hitDetail(special) : `Charge ${charge} of ${ENERGY_FOR_SPECIAL}. Attacking charges the special.`}
                disabled={busy || !special}
                onClick={() => play({ kind: "special" })}
              />
              <ActionButton icon={<Shield />} title="Guard" detail={can("guard") ? "Halve the next hit you take." : "Not twice in a row."} disabled={busy || !can("guard")} onClick={() => play({ kind: "guard" })} />
              <ActionButton icon={<ArrowLeftRight />} title="Switch" detail={switches.length ? "Bring in another card." : "No other card is standing."} disabled={busy || switches.length === 0} onClick={() => setSwitching(true)} />
            </div>
          )}
        </div>
      )}

      {state.status === "active" && state.forecast.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium uppercase tracking-wider">The dice ahead</span>
          {state.forecast.map((roll) => (
            <span key={roll.turn} className="tabular-nums">
              Turn {roll.turn}: {Math.round(roll.variance * 100)}%{roll.critical && <span className="font-semibold text-[#ffd23f]"> critical</span>}
            </span>
          ))}
          <span>Everyone sees the same rolls, so plan around them.</span>
        </div>
      )}

      {!mine && live && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground">
          {CAN_PLAY ? (
            <span>You are watching{me ? ` as ${me}` : ""}. Only {state.players.a.login} and {state.players.b.login} can move.</span>
          ) : (
            <>
              <span>You are watching. Moves are posted as the player, so playing needs your own copy:</span>
              <CopyButton text={NPX} label={NPX} />
            </>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Bench state={state} side={near} onInspect={setInspecting} />
        <Bench state={state} side={other(near)} onInspect={setInspecting} />
      </div>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Chat</h2>
        {state.chat.length === 0 ? (
          <p className="text-sm text-muted-foreground">Comments on the thread that aren't moves show up here.</p>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-3">
            {state.chat.map((line) => (
              <li key={line.url} className="flex gap-2 text-sm">
                {line.avatarUrl && <img src={line.avatarUrl} alt="" className="mt-0.5 size-5 shrink-0 rounded-full" />}
                <p className="min-w-0 break-words"><span className="font-medium">{line.author}</span> <span className="text-muted-foreground">{line.text}</span></p>
              </li>
            ))}
          </ul>
        )}
        {CAN_PLAY && me && (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!chat.trim()) return;
              void post(chat.trim()).then(() => setChat(""));
            }}
          >
            <Input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Say something on the thread" aria-label="Chat message" maxLength={500} className="text-base md:text-sm" />
            <Button type="submit" variant="outline" disabled={busy || !chat.trim()}>Send</Button>
          </form>
        )}
      </section>

      <InspectOverlay fighter={inspecting} onClose={() => setInspecting(null)} />
    </div>
  );
}
