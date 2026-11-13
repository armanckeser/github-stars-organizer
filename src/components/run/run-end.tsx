import { useEffect, useState } from "react";
import { Check, Link2, RotateCcw } from "lucide-react";
import { StarStard } from "@/components/star-stard";
import { TeamTiles } from "@/components/run/team-tiles";
import { APP_URL } from "@/lib/published-list";
import { WINS_TO_FINISH, type Unit } from "@/lib/run";
import { recordOf, saveTeam, teamLink } from "@/lib/saved-team";
import type { Snapshot } from "../../../server/run/types";

// The end of a run, over the dimmed board (docs/GAME-UI.md §1, §2): one slate panel
// with the gold line on its edge, the result, the team as shop cards, New run as the
// only filled button, and the share link and the star link quiet under it.

type Saving = { state: "saving" } | { state: "saved"; link: string } | { state: "failed"; message: string };

// How long "Copied" shows before the button reads as itself again.
const COPIED_FOR = 1500;

/**
 * The end of a run: the team it ended with, the record, and a link to the team. The
 * Worker plays the run's fights again before it hands back the link (worker/src/team.ts).
 */
export function RunEnd({ login, seed, rounds, team, wins, losses, against, loading, onNewRun }: {
  login: string;
  /** The run's seed, which the Worker replays the fights with. */
  seed: string;
  /** The team as fought at each round, round 1 first. */
  rounds: Snapshot[];
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
    saveTeam(login, seed, rounds, against)
      .then(({ token }) => live && setSaving({ state: "saved", link: teamLink(token) }))
      .catch((cause: unknown) => live && setSaving({ state: "failed", message: cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : "The team couldn't be saved." }));
    return () => {
      live = false;
    };
  }, [login, seed, rounds, against]);

  return (
    <section className="run-panel run-end" aria-labelledby="run-end-title">
      <header className="text-center">
        <h2 id="run-end-title" className="run-panel-title">{wins >= WINS_TO_FINISH ? "Run finished" : "Run over"}</h2>
        <p className="run-panel-record">{recordOf(wins, losses)}</p>
      </header>
      <div>
        <p className="run-panel-label">Final team</p>
        <TeamTiles units={team} />
      </div>
      <button type="button" className="hud-button hud-fight run-panel-primary" onClick={onNewRun} disabled={loading}><RotateCcw className="size-4" /> New run</button>
      <div className="run-panel-quiet">
        {saving.state === "saved" ? <CopyLink text={saving.link} label="Copy team link" /> : saving.state === "saving" ? <span className="run-panel-note">Saving the team...</span> : <CopyLink text={`${APP_URL}run`} label="Copy Play link" />}
        <StarStard className="text-white/55 hover:text-white" />
      </div>
      {saving.state === "failed" && <p className="run-panel-note text-center" role="alert">{saving.message} The link opens the Play screen instead.</p>}
    </section>
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
