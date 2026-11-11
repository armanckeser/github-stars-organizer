import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Swords } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Figure } from "@/components/battle/figure";
import { TeamTiles } from "@/components/run/team-tiles";
import { finalUnits, openTeam, recordOf, type SavedTeam } from "@/lib/saved-team";
import { CLASSES } from "../../server/character";

// A finished run's team, opened from its share link. "Beat this team" starts a run
// whose every round is played against this team as it stood at that round.

export const Route = createFileRoute("/team")({
  component: TeamPage,
  validateSearch: (search: Record<string, unknown>): { t?: string } => ({ t: typeof search.t === "string" ? search.t : undefined }),
});

type Loaded = { state: "loading" } | { state: "ready"; team: SavedTeam } | { state: "failed"; message: string };

function TeamPage() {
  const { t } = Route.useSearch();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  useEffect(() => {
    let live = true;
    if (!t) {
      setLoaded({ state: "failed", message: "This link has no team in it." });
      return;
    }
    setLoaded({ state: "loading" });
    openTeam(t)
      .then((team) => live && setLoaded({ state: "ready", team }))
      .catch((cause: unknown) => live && setLoaded({ state: "failed", message: cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : "The team couldn't be read. Check the connection and try again." }));
    return () => {
      live = false;
    };
  }, [t]);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-6xl items-center justify-center rounded-xl border bg-[#080b0f] p-4 text-white">
      {loaded.state === "loading" && <p className="text-sm text-white/70">Reading the team...</p>}
      {loaded.state === "failed" && (
        <div className="space-y-3 text-center">
          <p className="text-sm text-[#ff8f93]" role="alert">{loaded.message}</p>
          <Link to="/run" className={buttonVariants()}><Swords /> Play a run</Link>
        </div>
      )}
      {loaded.state === "ready" && <SavedTeamPanel team={loaded.team} token={t!} />}
    </div>
  );
}

function SavedTeamPanel({ team, token }: { team: SavedTeam; token: string }) {
  const klass = CLASSES[team.character.klass];
  return (
    <div className="w-full max-w-sm space-y-4 rounded-lg border border-white/15 bg-[#0c1014]/90 p-5 shadow-lg">
      <div className="flex items-center gap-3">
        <div className="shrink-0 rounded-md" style={{ background: klass.color }}><Figure look={team.character.look} className="h-20 w-auto" /></div>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
            {team.avatarUrl && <img src={team.avatarUrl} alt="" className="size-6 rounded-full" />}
            <span className="truncate">{team.login}'s team</span>
          </h1>
          <p className="text-sm text-white/70">{recordOf(team.wins, team.losses)} · {team.day}</p>
        </div>
      </div>
      <TeamTiles units={finalUnits(team)} />
      <Link to="/run" search={{ against: token }} className={buttonVariants({ className: "w-full" })}><Swords /> Beat this team</Link>
    </div>
  );
}
