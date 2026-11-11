import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/copy-button";
import { Help, OptionRow } from "@/components/compose/controls";
import { LeftOutSheet } from "@/components/compose/left-out-sheet";
import { ReadmePreview } from "@/components/compose/readme-preview";
import { RepoPickerSheet } from "@/components/compose/repo-picker-sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { listCollection, listItemCollection, repoCollection } from "@/lib/collections";
import {
  DEFAULT_RATING_MIN,
  composeMarkdown,
  defaultComposition,
  defaultHeading,
  type Composition,
  type Options,
  type Section,
} from "@/lib/published-list";

export const Route = createFileRoute("/compose")({ component: ComposePage });

const SUBHEAD = "text-xs font-medium uppercase tracking-wider text-muted-foreground";

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function ComposePage() {
  const { data: repos } = useLiveQuery((q) => q.from({ repoCollection }).select(({ repoCollection }) => repoCollection));
  const { data: lists } = useLiveQuery((q) => q.from({ listCollection }).select(({ listCollection }) => listCollection));
  const { data: listItems } = useLiveQuery((q) => q.from({ listItemCollection }).select(({ listItemCollection }) => listItemCollection));

  // Fixed when the screen opens, so a README doesn't change under you as time passes.
  const [now] = useState(() => Date.now());
  const [edited, setEdited] = useState<Composition | null>(null);
  // Side by side from lg up, where "edit" shows the preview too; on a phone, one at a time.
  const wide = useMediaQuery("(min-width: 1024px)");
  const [view, setView] = useState<"edit" | "preview" | "markdown">("preview");
  const shown = wide && view === "edit" ? "preview" : view;
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [leftOutOpen, setLeftOutOpen] = useState(false);

  const allLists = useMemo(() => lists ?? [], [lists]);
  const allRepos = useMemo(() => repos ?? [], [repos]);
  // Until something is changed, the composition follows the Lists: one section each.
  const composition = useMemo(() => edited ?? defaultComposition(allLists), [edited, allLists]);

  const composed = useMemo(
    () => composeMarkdown(composition, { repos: allRepos, lists: allLists, listItems: listItems ?? [] }, now),
    [composition, allRepos, allLists, listItems, now],
  );

  function update(change: (c: Composition) => Composition) {
    setEdited(change(composition));
  }
  function updateSection(id: string, change: Partial<Section>) {
    update((c) => ({ ...c, sections: c.sections.map((s) => (s.id === id ? ({ ...s, ...change } as Section) : s)) }));
  }
  function moveSection(index: number, by: -1 | 1) {
    update((c) => {
      const sections = [...c.sections];
      [sections[index], sections[index + by]] = [sections[index + by], sections[index]];
      return { ...c, sections };
    });
  }
  function setOption(key: keyof Options, on: boolean) {
    update((c) => ({ ...c, options: { ...c.options, [key]: on } }));
  }
  // Highlights and By rating go first, where a Favorites block belongs; a List goes last.
  function addSection(section: Section) {
    update((c) => ({ ...c, sections: section.kind === "list" ? [...c.sections, section] : [section, ...c.sections] }));
  }

  const usedLists = new Set(composition.sections.flatMap((s) => (s.kind === "list" ? [s.listId] : [])));
  const pickingSection = composition.sections.find((s) => s.id === pickingFor);

  const { archived, quiet } = composed.leftOut;
  const leftOutParts = [archived.length && `${archived.length} archived`, quiet.length && `${quiet.length} quiet`].filter(Boolean);
  const leftOutLabel = leftOutParts.length
    ? `Left out: ${leftOutParts.join(", ")}`
    : composed.keptQuiet.length
      ? `Kept ${plural(composed.keptQuiet.length, "quiet repo")}`
      : null;

  function download() {
    const url = URL.createObjectURL(new Blob([composed.markdown], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "README.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Awesome list</h1>

      <Tabs value={view} onValueChange={(value) => setView(value as typeof view)} className="lg:hidden">
        <TabsList>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="markdown">Markdown</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
        <div className={`space-y-6 ${view === "edit" ? "" : "hidden"} lg:block`}>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="compose-title">Title</Label>
              <Input id="compose-title" value={composition.title} onChange={(e) => update((c) => ({ ...c, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="compose-intro">Intro</Label>
              <Textarea id="compose-intro" value={composition.intro} onChange={(e) => update((c) => ({ ...c, intro: e.target.value }))} className="min-h-20" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className={SUBHEAD}>Sections</h2>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                  <Plus /> Add section
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                  <DropdownMenuItem onClick={() => addSection({ id: crypto.randomUUID(), kind: "highlights", repoIds: [], heading: "" })}>Highlights</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addSection({ id: crypto.randomUUID(), kind: "rating", min: DEFAULT_RATING_MIN, heading: "" })}>By rating</DropdownMenuItem>
                  {allLists.some((l) => !usedLists.has(l.id)) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Lists</DropdownMenuLabel>
                        {allLists.filter((l) => !usedLists.has(l.id)).map((l) => (
                          <DropdownMenuItem key={l.id} onClick={() => addSection({ id: crypto.randomUUID(), kind: "list", listId: l.id, heading: "" })}>
                            {l.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {composition.sections.length === 0 && <p className="text-sm text-muted-foreground">No sections yet.</p>}
            {composition.sections.map((section, index) => (
              <div key={section.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium">
                    {section.kind === "list" ? `List: ${allLists.find((l) => l.id === section.listId)?.name ?? "removed"}` : section.kind === "highlights" ? "Highlights" : "By rating"}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{plural(composed.counts[section.id] ?? 0, "repo")}</span>
                  <div className="ml-auto flex">
                    <Button variant="ghost" size="icon-sm" aria-label="Move up" title="Move up" disabled={index === 0} onClick={() => moveSection(index, -1)}>
                      <ArrowUp />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Move down" title="Move down" disabled={index === composition.sections.length - 1} onClick={() => moveSection(index, 1)}>
                      <ArrowDown />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Remove section" title="Remove section" onClick={() => update((c) => ({ ...c, sections: c.sections.filter((s) => s.id !== section.id) }))}>
                      <X />
                    </Button>
                  </div>
                </div>
                <Input
                  value={section.heading}
                  placeholder={defaultHeading(section, allLists)}
                  aria-label="Heading"
                  onChange={(e) => updateSection(section.id, { heading: e.target.value })}
                />
                {section.kind === "highlights" && (
                  <Button variant="outline" size="sm" onClick={() => setPickingFor(section.id)}>
                    Pick repos ({section.repoIds.length})
                  </Button>
                )}
                {section.kind === "rating" && (
                  <div className="flex items-center gap-2 text-sm">
                    <span>Rated at least</span>
                    <Select value={String(section.min)} onValueChange={(value) => updateSection(section.id, { min: Number(value) })}>
                      <SelectTrigger size="sm" aria-label="Lowest rating"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Help label="About ratings">Uses the rating you gave each repo, from 1 to 5. Repos without a rating are not included.</Help>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <h2 className={SUBHEAD}>Each repo shows</h2>
            <OptionRow label="Your note when it has one" checked={composition.options.notes} onChange={(on) => setOption("notes", on)}>
              A repo without a note shows its description.
            </OptionRow>
            <OptionRow label="Language" checked={composition.options.language} onChange={(on) => setOption("language", on)} />
            <OptionRow label="Star count" checked={composition.options.stars} onChange={(on) => setOption("stars", on)}>
              A star count in a README goes out of date as the repo gains stars.
            </OptionRow>
            <OptionRow label="Stars Organizer credit line" checked={composition.options.credit} onChange={(on) => setOption("credit", on)}>
              The last line of the README, linking to Stars Organizer.
            </OptionRow>
          </div>
        </div>

        <div className={`min-w-0 space-y-3 ${view === "edit" ? "hidden" : ""} lg:sticky lg:top-0 lg:flex lg:max-h-[calc(100dvh-8rem)] lg:flex-col lg:space-y-0 lg:gap-3`}>
          <div className="flex flex-wrap items-center gap-2">
            {leftOutLabel && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setLeftOutOpen(true)}>{leftOutLabel}</Button>
                <Help label="About left-out repos">
                  Archived repos are never listed. A quiet repo has had no push in about six months; keep one by hand if it is finished and still good.
                </Help>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Tabs value={shown} onValueChange={(value) => setView(value as typeof view)} className="max-lg:hidden">
                <TabsList>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                  <TabsTrigger value="markdown">Markdown</TabsTrigger>
                </TabsList>
              </Tabs>
              <CopyButton text={composed.markdown} label="Copy" />
              <Button variant="outline" size="sm" onClick={download}>
                <Download className="mr-2 h-3.5 w-3.5" /> Download
              </Button>
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto rounded-lg border bg-card p-6 lg:flex-1">
            {shown === "preview" ? (
              <ReadmePreview markdown={composed.markdown} />
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{composed.markdown}</pre>
            )}
          </div>
        </div>
      </div>

      <RepoPickerSheet
        open={pickingSection?.kind === "highlights"}
        onOpenChange={(open) => !open && setPickingFor(null)}
        repos={allRepos}
        picked={pickingSection?.kind === "highlights" ? pickingSection.repoIds : []}
        onChange={(repoIds) => pickingFor && updateSection(pickingFor, { repoIds })}
        now={now}
      />
      <LeftOutSheet
        open={leftOutOpen && leftOutLabel !== null}
        onOpenChange={setLeftOutOpen}
        composed={composed}
        onKeep={(id) => update((c) => ({ ...c, keepQuiet: [...c.keepQuiet, id] }))}
        onLeaveOut={(id) => update((c) => ({ ...c, keepQuiet: c.keepQuiet.filter((k) => k !== id) }))}
      />
    </div>
  );
}
