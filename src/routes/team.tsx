import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Swords } from "lucide-react";
import { StarStard } from "@/components/star-stard";
import { NotAffiliated } from "@/components/not-affiliated";
import { TeamTiles } from "@/components/run/team-tiles";
import type { BoardUnit } from "@/components/battle/three/board";
import { rangeOf } from "@/lib/run";
import { finalUnits, openTeam, recordOf, type SavedTeam } from "@/lib/saved-team";
import { cellOf } from "../../server/run/types";

// A finished run's team, opened from its share link. The team stands on the far half
// of the Play board with its trainer, as an opponent does in a run, and the panel under
// it holds the cards and "Beat this team", which starts a run whose every round is
// played against this team as it stood at that round.

export const Route = createFileRoute("/team")({
  component: TeamPage,
  validateSearch: (search: Record<string, unknown>): { t?: string } => ({ t: typeof search.t === "string" ? search.t : undefined }),
});

const Board3D = lazy(() => import("@/components/battle/board3d"));
// The far side of the board: the saved team stands where a run's opponent stands.
const THEIRS = 1;
// The space kept between the panel and the team above it, in CSS pixels.
const PANEL_GAP = 24;

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

  const team = loaded.state === "ready" ? loaded.team : null;
  const units = useMemo<BoardUnit[]>(
    () => (team ? finalUnits(team).map((unit) => ({ id: `${THEIRS}:${unit.fighter.fullName}`, side: THEIRS, fighter: unit.fighter, ...cellOf(THEIRS, unit), ranged: rangeOf(unit.fighter) > 1 })) : []),
    [team],
  );
  // The board's camera keeps the team clear of the panel along the bottom.
  const panel = useRef<HTMLDivElement>(null);
  const [inset, setInset] = useState(0);
  useLayoutEffect(() => {
    const node = panel.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setInset(node.offsetHeight + PANEL_GAP));
    observer.observe(node);
    return () => observer.disconnect();
  }, [loaded.state]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#080b0f] text-white">
      <Suspense fallback={null}>
        <Board3D units={units} near={null} far={team?.character.look ?? null} selected={null} fight={null} speed={1} skips={0} room={0} inset={inset} onSelect={() => {}} onFightEnd={() => {}} onMove={() => {}} sellPrice={() => null} onDrag={() => {}} />
      </Suspense>
      <Link to="/" aria-label="Leave" className="hud-chip absolute left-2 top-2 z-30 grid size-9 place-items-center outline-none focus-visible:ring-2 focus-visible:ring-ring sm:left-3 sm:top-3">
        <ArrowLeft className="size-4" />
      </Link>
      <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center p-3 sm:p-4">
        <div ref={panel} className="w-full max-w-[44rem]">
          {loaded.state === "loading" && <p className="run-panel run-panel-note text-center">Reading the team...</p>}
          {loaded.state === "failed" && (
            <div className="run-panel text-center">
              <p className="run-panel-note" role="alert">{loaded.message}</p>
              <Link to="/run" className="hud-button hud-fight run-panel-primary"><Swords className="size-4" /> Play Stard</Link>
            </div>
          )}
          {team && <SavedTeamPanel team={team} token={t!} />}
        </div>
      </div>
    </div>
  );
}

function SavedTeamPanel({ team, token }: { team: SavedTeam; token: string }) {
  return (
    <section className="run-panel" aria-labelledby="team-title">
      <header className="flex items-center gap-3">
        {team.avatarUrl && <img src={team.avatarUrl} alt="" className="size-10 shrink-0 rounded-full" />}
        <div className="min-w-0">
          <h1 id="team-title" className="run-panel-title break-words">A team from @{team.login}'s stars</h1>
          <p className="run-panel-record">{recordOf(team.wins, team.losses)} · {team.day}</p>
        </div>
      </header>
      <TeamTiles units={finalUnits(team)} />
      <Link to="/run" search={{ against: token }} title="A run with your stars, every round against this team as it stood that round" className="hud-button hud-fight run-panel-primary"><Swords className="size-4" /> Beat this team</Link>
      <div className="run-panel-quiet">
        <StarStard className="text-white/55 hover:text-white" />
        <NotAffiliated />
      </div>
    </section>
  );
}
