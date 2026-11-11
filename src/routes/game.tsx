import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";
import { ArenaScene, ArenaStage, InspectOverlay, Nameplate, TextBox } from "@/components/battle/arena";
import { ActionPanel, Bench, DiceAhead } from "@/components/battle/match";
import { describeEvent, sideView } from "@/components/battle/match-view";
import { CAN_PLAY, fetchMatch, playingAs, postComment, type Match } from "@/lib/game-api";
import type { Fighter, Side } from "../../server/battle";
import { CLASSES } from "../../server/character";
import { applyAction, moveComment, replyComment, type Action, type GameState } from "../../server/game";

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

function GamePage() {
  const { repo, n } = Route.useSearch();
  const [match, setMatch] = useState<Match | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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

  async function post(body: string, after?: GameState) {
    if (!match) return;
    setBusy(true);
    setError("");
    try {
      const comment = await postComment(match.thread, body);
      // Shown at once from the same rules the referee will apply, then confirmed from the thread.
      if (after) setMatch({ ...match, state: { ...after, last: comment.id } });
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
    const line = describeEvent(after, after.events.at(-1)!);
    void post(moveComment(state.turn, action, state.last, `**Turn ${state.turn}.** ${line}`), after);
  }

  if (!repo || !n) {
    return <p className="text-sm text-muted-foreground">This link doesn't point at a match. <Link to="/battle" className="underline underline-offset-4">Go to Battle</Link>.</p>;
  }
  if (!match || !state) {
    return <p className="text-sm text-muted-foreground" role={error ? "alert" : undefined}>{error || "Reading the match from its thread..."}</p>;
  }

  const lastEvent = state.events.at(-1);
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
  const nearSide = sideView(state, near);
  const farSide = sideView(state, other(near));


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
          {lastEvent && state.status === "active" ? `${describeEvent(state, lastEvent)} ${statusLine(state, mine)}` : statusLine(state, mine)}
        </TextBox>
      </ArenaScene>

      {error && <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm" role="alert">{error}</p>}

      {state.status === "waiting" && mine === "b" && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void post(replyComment("accept", `${state.players.b.name} accepts the challenge.`))}><Swords /> Accept the challenge</Button>
          <Button variant="outline" disabled={busy} onClick={() => void post(replyComment("decline", `${state.players.b.name} declines the challenge.`))}>Decline</Button>
        </div>
      )}

      {myTurn && mine && <ActionPanel state={state} seed={seed} side={mine} busy={busy} onPlay={play} />}

      <DiceAhead state={state} note="Everyone sees the same rolls, so plan around them." />

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
