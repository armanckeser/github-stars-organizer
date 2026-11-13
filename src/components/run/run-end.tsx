import { useEffect, useState } from "react";
import { Check, Link2, RotateCcw, Swords } from "lucide-react";
import { StarStard } from "@/components/star-stard";
import { TeamTiles } from "@/components/run/team-tiles";
import { Input } from "@/components/ui/input";
import { beatLine, beatenIn, challengeLink, challengeMessage, type RoundResult } from "@/lib/challenge";
import { countEvent } from "@/lib/events";
import { APP_URL, validLogin } from "@/lib/published-list";
import { WINS_TO_FINISH, type Unit } from "@/lib/run";
import { recordOf, saveTeam, teamLink } from "@/lib/saved-team";
import type { Snapshot } from "../../../server/run/types";

// The end of a run, over the dimmed board (docs/GAME-UI.md §1, §2): one slate panel
// with the gold line on its edge, who the run beat, the record, the team as shop cards,
// Challenge a friend as the only filled button, and the rest quiet under it.

type Saving = { state: "saving" } | { state: "saved"; link: string } | { state: "failed"; message: string };

// How long "Copied" shows before the button reads as itself again.
const COPIED_FOR = 1500;

/**
 * The end of a run: who it beat, the record, the team it ended with, and a challenge
 * to beat that team. The Worker plays the run's fights again before it hands back the
 * team's link (worker/src/team.ts).
 */
export function RunEnd({ login, rounds, results, team, wins, losses, against, loading, onNewRun }: {
  login: string;
  /** The team as fought at each round, round 1 first. */
  rounds: Snapshot[];
  /** Each round's opponent and how it went. */
  results: RoundResult[];
  team: Unit[];
  wins: number;
  losses: number;
  /** The saved team's token, when the run was played against one. */
  against?: string;
  loading: boolean;
  onNewRun: () => void;
}) {
  const [saving, setSaving] = useState<Saving>({ state: "saving" });
  useEffect(() => {
    let live = true;
    setSaving({ state: "saving" });
    saveTeam(login, rounds, against)
      .then(({ token }) => live && setSaving({ state: "saved", link: teamLink(token) }))
      .catch((cause: unknown) => live && setSaving({ state: "failed", message: cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : "The team couldn't be saved." }));
    return () => {
      live = false;
    };
  }, [login, rounds, against]);
  const beaten = beatenIn(results);
  const lead = beatLine(beaten);
  const newRun = <button type="button" className="hud-button run-panel-link" onClick={onNewRun} disabled={loading}><RotateCcw className="size-4" /> New run</button>;

  return (
    <section className="run-panel run-end" aria-labelledby="run-end-title">
      <header className="text-center">
        <h2 id="run-end-title" className="run-panel-title">{wins >= WINS_TO_FINISH ? "Run finished" : "Run over"}</h2>
        {lead && <p className="run-panel-beat">{lead}</p>}
        <p className="run-panel-record">{recordOf(wins, losses)}</p>
      </header>
      <div>
        <p className="run-panel-label">Final team</p>
        <TeamTiles units={team} />
      </div>
      {saving.state === "failed" ? (
        // With no team link there is nothing to challenge with, so starting again leads.
        <button type="button" className="hud-button hud-fight run-panel-primary" onClick={onNewRun} disabled={loading}><RotateCcw className="size-4" /> New run</button>
      ) : (
        <Challenge beaten={beaten} link={saving.state === "saved" ? saving.link : null} />
      )}
      <div className="run-panel-quiet">
        {saving.state === "saved" ? <CopyLink text={saving.link} label="Copy team link" /> : saving.state === "saving" ? <span className="run-panel-note">Saving the team...</span> : <CopyLink text={`${APP_URL}run`} label="Copy Play link" />}
        {saving.state !== "failed" && newRun}
        <StarStard className="text-white/55 hover:text-white" />
      </div>
      {saving.state === "failed" && <p className="run-panel-note text-center" role="alert">{saving.message} The link opens the Play screen instead.</p>}
    </section>
  );
}

type Copying = { state: "ready" } | { state: "copied" } | { state: "failed"; link: string };

/** A friend's username and the button that copies the challenge; waits for the team's link. */
function Challenge({ beaten, link }: { beaten: string[]; link: string | null }) {
  const [friend, setFriend] = useState("");
  const [copying, setCopying] = useState<Copying>({ state: "ready" });
  const named = friend.trim();
  const nameOk = named === "" || validLogin(named);

  async function copy() {
    if (!link || !nameOk) return;
    try {
      await navigator.clipboard.writeText(challengeMessage(beaten, link, named));
    } catch {
      // A browser that refuses the clipboard still lets the link be selected by hand.
      return setCopying({ state: "failed", link: challengeLink(link, named) });
    }
    countEvent("challenge_copied");
    setCopying({ state: "copied" });
    setTimeout(() => setCopying({ state: "ready" }), COPIED_FOR);
  }

  return (
    <form className="run-challenge" onSubmit={(event) => { event.preventDefault(); void copy(); }}>
      <div className="run-challenge-name">
        <span aria-hidden="true">@</span>
        <Input value={friend} onChange={(event) => setFriend(event.target.value.replace(/^@/, ""))} placeholder="Friend's username" aria-label="Friend's GitHub username" aria-invalid={!nameOk} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </div>
      <button type="submit" className="hud-button hud-fight run-panel-primary" disabled={!link || !nameOk}>
        {copying.state === "copied" ? <Check className="size-4" /> : <Swords className="size-4" />} {copying.state === "copied" ? "Copied" : "Challenge a friend"}
      </button>
      {copying.state === "failed" && (
        <label className="run-panel-note run-challenge-fallback">
          Couldn't copy. Send this link:
          <Input readOnly value={copying.link} onFocus={(event) => event.target.select()} aria-label="Challenge link" />
        </label>
      )}
    </form>
  );
}

function CopyLink({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_FOR);
  }
  return (
    <button type="button" className="hud-button run-panel-link" onClick={() => void copy()}>
      {copied ? <Check className="size-4" /> : <Link2 className="size-4" />} {copied ? "Copied" : label}
    </button>
  );
}
