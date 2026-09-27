import { useState, useEffect, useRef, useCallback } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Star, GitFork, ExternalLink, Trash2, Check, Globe } from "lucide-react";
import { repoCollection, listItemCollection, type Repo, type StarList, type ListItem } from "../lib/collections";
import { apiPatch } from "../lib/api";

interface RepoDetailSheetProps {
  repo: Repo | null;
  lists: StarList[];
  listItems: ListItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function HealthBar({ value, max = 10, label, detail }: { value: number; max?: number; label: string; detail?: string }) {
  const percentage = (value / max) * 100;
  const color = value >= 7 ? "bg-primary" : value >= 4 ? "bg-yellow-500" : "bg-destructive";

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="w-24 text-xs text-muted-foreground shrink-0">{label}</span>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${percentage}%` }} />
        </div>
        <span className="text-xs tabular-nums w-8 text-right">{value.toFixed(1)}</span>
      </div>
      {detail && (
        <p className="text-[11px] text-muted-foreground/60 ml-27 mt-0.5">{detail}</p>
      )}
    </div>
  );
}

function StarRating({ value, onChange }: { value: number | null; onChange: (rating: number | null) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? value ?? 0;

  return (
    <div className="flex gap-1" onMouseLeave={() => setHovered(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className="p-0.5 hover:scale-110 transition-transform"
          onMouseEnter={() => setHovered(n)}
          onClick={() => onChange(value === n ? null : n)}
        >
          <Star
            className={`h-5 w-5 ${n <= display ? "fill-primary text-primary" : "text-muted-foreground/30"}`}
          />
        </button>
      ))}
    </div>
  );
}

function relativeTime(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatHealthDate(value: string | number | undefined): string | undefined {
  if (!value || value === "unknown" || value === "none") return undefined;
  return relativeTime(String(value));
}

export function RepoDetailSheet({ repo, lists, listItems, open, onOpenChange }: RepoDetailSheetProps) {
  const [notes, setNotes] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (repo) setNotes(repo.notes ?? "");
  }, [repo?.id]);

  const saveNotes = useCallback(async (value: string) => {
    if (!repo) return;
    setSaveStatus("saving");
    await apiPatch("repos", repo.id, { notes: value });
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 1500);
  }, [repo?.id]);

  function handleNotesChange(value: string) {
    setNotes(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveNotes(value), 300);
  }

  async function handleRatingChange(rating: number | null) {
    if (!repo) return;
    await apiPatch("repos", repo.id, { usefulness_rating: rating });
  }

  function handleListToggle(list: StarList) {
    if (!repo) return;
    const existing = listItems.find((li) => li.repo_id === repo.id && li.list_id === list.id);
    if (existing) {
      listItemCollection.delete(existing.id);
    } else {
      listItemCollection.insert({
        id: crypto.randomUUID(),
        list_id: list.id,
        repo_id: repo.id,
        position: 0,
        added_at: new Date().toISOString(),
      });
    }
  }

  function handleUnstar() {
    if (!repo) return;
    if (!window.confirm(`Unstar ${repo.full_name}? Its tags, rating and notes go with it.`)) return;
    repoCollection.delete(repo.id);
    onOpenChange(false);
  }

  if (!repo) return null;

  const healthData = repo.health_data as Record<string, number | string> | null;
  const topics = repo.topics?.split(",").filter(Boolean) ?? [];
  const repoListIds = new Set(listItems.filter((li) => li.repo_id === repo.id).map((li) => li.list_id));

  const lastCommit = formatHealthDate(healthData?.last_commit);
  const lastRelease = formatHealthDate(healthData?.latest_release);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-lg">
            <a href={repo.url} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1.5">
              {repo.full_name}
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          </SheetTitle>
          {repo.description && (
            <SheetDescription>{repo.description}</SheetDescription>
          )}
          <div className="flex items-center gap-3 text-sm text-muted-foreground pt-1">
            <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5" />{repo.stars.toLocaleString()}</span>
            <span className="flex items-center gap-1"><GitFork className="h-3.5 w-3.5" />{repo.forks.toLocaleString()}</span>
            {repo.language && <Badge variant="secondary">{repo.language}</Badge>}
            {repo.is_archived && <Badge variant="destructive">Archived</Badge>}
          </div>
          {repo.starred_at && (
            <p className="text-xs text-muted-foreground/60">Starred {relativeTime(repo.starred_at)}</p>
          )}
        </SheetHeader>

        <div className="px-4 pb-6 space-y-8">

          {/* Health — "Is this repo alive?" */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Health</h3>
            {repo.health_score != null && healthData ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${repo.health_score >= 7 ? "bg-primary" : repo.health_score >= 4 ? "bg-yellow-500" : "bg-destructive"}`}
                      style={{ width: `${(repo.health_score / 10) * 100}%` }}
                    />
                  </div>
                  <span className="text-lg font-semibold tabular-nums">{repo.health_score.toFixed(1)}</span>
                  <span className="text-xs text-muted-foreground">/10</span>
                </div>
                <HealthBar
                  value={Number(healthData.commit_recency) || 0}
                  label="Commits"
                  detail={lastCommit ? `Last commit ${lastCommit}` : undefined}
                />
                <HealthBar value={Number(healthData.issue_resolution) || 0} label="Issues" />
                <HealthBar value={Number(healthData.contributors) || 0} label="Contributors" />
                <HealthBar value={Number(healthData.star_velocity) || 0} label="Star Growth" />
                <HealthBar
                  value={Number(healthData.release_cadence) || 0}
                  label="Releases"
                  detail={lastRelease ? `Last release ${lastRelease}` : undefined}
                />
                {repo.health_refreshed_at && (
                  <p className="text-[11px] text-muted-foreground/50 mt-1">
                    Refreshed {relativeTime(repo.health_refreshed_at)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/60">Not scored yet</p>
            )}
          </section>

          {/* Your Assessment — "How do I feel about this?" */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Your Assessment</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Rating</span>
                <StarRating value={repo.usefulness_rating} onChange={handleRatingChange} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-muted-foreground">Notes</span>
                  {saveStatus === "saved" && (
                    <span className="text-xs text-primary flex items-center gap-1">
                      <Check className="h-3 w-3" />Saved
                    </span>
                  )}
                </div>
                <Textarea
                  value={notes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder="Notes"
                  className="min-h-20 text-sm"
                />
              </div>
            </div>
          </section>

          {/* Organization — "Where does this live in my system?" */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Organization</h3>
            <div className="space-y-3">
              {lists.length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground block mb-1.5">Lists</span>
                  <div className="space-y-1">
                    {lists.map((list) => (
                      <label key={list.id} className="flex items-center gap-2 cursor-pointer py-0.5 hover:bg-accent/50 rounded px-1 -mx-1">
                        <Checkbox
                          checked={repoListIds.has(list.id)}
                          onClick={() => handleListToggle(list)}
                        />
                        <span className="text-sm">{list.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {topics.length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground block mb-1.5">Topics</span>
                  <div className="flex flex-wrap gap-1.5">
                    {topics.map((topic) => (
                      <Badge key={topic} variant="outline" className="text-xs">{topic}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Footer — links and destructive action */}
          <section className="space-y-3 pt-2">
            {repo.homepage && (
              <a href={repo.homepage} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                <Globe className="h-3.5 w-3.5" />{repo.homepage.replace(/^https?:\/\//, "")}
              </a>
            )}
            <Button variant="destructive" size="sm" className="w-full" onClick={handleUnstar}>
              <Trash2 className="mr-2 h-4 w-4" />Unstar
            </Button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
