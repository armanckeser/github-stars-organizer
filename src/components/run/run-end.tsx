import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { StarStard } from "@/components/star-stard";
import { TeamTiles } from "@/components/run/team-tiles";
import { APP_URL } from "@/lib/published-list";
import { WINS_TO_FINISH, type Unit } from "@/lib/run";
import { recordOf, saveTeam, teamLink } from "@/lib/saved-team";
import type { Snapshot } from "../../../server/run/types";

type Saving = { state: "saving" } | { state: "saved"; link: string } | { state: "failed"; message: string };

/**
 * The end of a run: the team it ended with, the record, and a link to the team. The
 * Worker plays the run's fights again before it hands back the link (worker/src/team.ts).
 */
export function RunEnd({ login, rounds, team, wins, losses, against, loading, onNewRun }: {
  login: string;
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
    saveTeam(login, rounds, against)
      .then(({ token }) => live && setSaving({ state: "saved", link: teamLink(token) }))
      .catch((cause: unknown) => live && setSaving({ state: "failed", message: cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : "The team couldn't be saved." }));
    return () => {
      live = false;
    };
  }, [login, rounds, against]);

  return (
    <div className="w-full max-w-sm space-y-3 rounded-lg border border-white/15 bg-[#0c1014]/90 p-5 text-center shadow-lg backdrop-blur-sm">
      <div>
        <p className="font-display text-2xl font-bold tracking-tight">{wins >= WINS_TO_FINISH ? "Run finished" : "Run over"}</p>
        <p className="text-sm text-white/70">{recordOf(wins, losses)}</p>
      </div>
      <TeamTiles units={team} />
      <Button className="w-full" onClick={onNewRun} disabled={loading}><RotateCcw /> New run</Button>
      <div className="flex items-center justify-between gap-2">
        <StarStard className="text-white/70 hover:text-white" />
        {saving.state === "saved" ? <CopyButton text={saving.link} label="Share team" /> : saving.state === "saving" ? <Button variant="outline" size="sm" disabled>Saving team...</Button> : <CopyButton text={`${APP_URL}run`} label="Share" />}
      </div>
      {saving.state === "failed" && <p className="text-xs text-[#ff8f93]" role="alert">{saving.message} The link opens the Play screen.</p>}
    </div>
  );
}
