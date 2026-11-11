import { useEffect, useState } from "react";
import { Layers, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { ArenaScene, ArenaStage, Nameplate, TextBox } from "@/components/battle/arena";
import { ActionPanel, Bench, DiceAhead } from "@/components/battle/match";
import { describeEvent, sideView } from "@/components/battle/match-view";
import type { Fighter, Side } from "../../../server/battle";
import { botAction } from "../../../server/bot";
import { CLASSES, type Character } from "../../../server/character";
import { applyAction, startGame, type Action, type GamePlayer, type GameState } from "../../../server/game";

// A game against the computer (docs/GAME-DESIGN.md, change 1): the person plays team
// `a` and chooses every move; server/bot.ts plays team `b`. Same rules as a match over
// a GitHub thread (server/game.ts), with no thread and nothing stored. Each game gets
// its own dice.

export type ComputerTeam = { login: string; avatarUrl: string | null; character: Character & { level: number }; team: Fighter[] };

const BOT_DELAY_MS = 1400;

const playerOf = (team: ComputerTeam): GamePlayer => ({
  login: team.login, name: team.character.name, klass: team.character.klass, look: team.character.look, level: team.character.level, avatarUrl: team.avatarUrl,
});

function newGame(a: ComputerTeam, b: ComputerTeam): { state: GameState; seed: string } {
  const seed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return { seed, state: startGame({ v: 1, players: { a: playerOf(a), b: playerOf(b) }, teams: { a: a.team, b: b.team } }, seed) };
}

export function ComputerGame({ a, b, paused, link, onCards, onInspect }: {
  a: ComputerTeam;
  b: ComputerTeam;
  /** The computer waits while a card is open. */
  paused: boolean;
  link: string;
  onCards: () => void;
  onInspect: (fighter: Fighter) => void;
}) {
  const [game, setGame] = useState(() => newGame(a, b));
  const { state, seed } = game;

  // The computer answers a beat after the person's move, so both animations are seen.
  useEffect(() => {
    if (state.status !== "active" || state.next !== "b" || paused) return;
    const timer = setTimeout(() => {
      const action = botAction(state, seed, "b", Math.random);
      if (action) setGame({ seed, state: applyAction(state, seed, "b", action, `t${state.turn}`, new Date().toISOString()) });
    }, BOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state, seed, paused]);

  function play(action: Action) {
    if (state.status !== "active" || state.next !== "a") return;
    setGame({ seed, state: applyAction(state, seed, "a", action, `t${state.turn}`, new Date().toISOString()) });
  }

  const last = state.events.at(-1);
  const done = state.status === "won";
  const status = done
    ? state.winner === "a" ? "You win." : `${b.character.name} wins.`
    : state.next === "a" ? "Your move." : `${b.character.name} is choosing.`;
  const near = sideView(state, "a");
  const far = sideView(state, "b");
  const plateOf = (side: Side) => {
    const sideState = state.sides[side];
    const fighter = state.teams[side][sideState.active];
    const player = state.players[side];
    return (
      <Nameplate
        near={side === "a"}
        owner={`${player.name}${player.klass === "rookie" ? "" : ` · ${CLASSES[player.klass].label}`}`}
        avatarUrl={player.avatarUrl}
        fighter={fighter}
        hp={sideState.hp[sideState.active]}
        left={sideState.hp.filter((v) => v > 0).length}
        total={sideState.hp.length}
        energy={sideState.energy[sideState.active]}
        onInspect={() => onInspect(fighter)}
      />
    );
  };

  return (
    <div className="space-y-4">
      <ArenaScene>
        <ArenaStage near={near} far={far} beat={state.events.length} onInspect={(where) => onInspect(where === "near" ? near.fighter : far.fighter)} />
        {plateOf("b")}
        {plateOf("a")}
        <TextBox strong={done}>{last && !done ? `${describeEvent(state, last)} ${status}` : status}</TextBox>
      </ArenaScene>

      {done ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button className="h-11 px-4" onClick={() => setGame(newGame(a, b))}><RotateCcw /> Play again</Button>
          <Button variant="outline" className="h-11 px-4" onClick={onCards}><Layers /> Cards</Button>
          <CopyButton text={link} label="Copy link" className="h-11 px-4" />
        </div>
      ) : (
        <div className="min-h-[8.5rem] lg:min-h-16">
          {state.next === "a" && <ActionPanel state={state} seed={seed} side="a" onPlay={play} />}
        </div>
      )}

      <DiceAhead state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Bench state={state} side="a" onInspect={onInspect} />
        <Bench state={state} side="b" onInspect={onInspect} />
      </div>

      {!done && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-11 px-4" onClick={onCards}><Layers /> Cards</Button>
          <CopyButton text={link} label="Copy link" className="h-11 px-4" />
        </div>
      )}
    </div>
  );
}
