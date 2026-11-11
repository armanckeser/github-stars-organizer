import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { ChevronRight, Download, FileText, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/copy-button";
import { Help, OptionRow } from "@/components/compose/controls";
import { CharacterSheet } from "@/components/compose/character-sheet";
import { LeftOutSheet } from "@/components/compose/left-out-sheet";
import { ReadmePreview } from "@/components/compose/readme-preview";
import { RepoPickerSheet } from "@/components/compose/repo-picker-sheet";
import { SectionList } from "@/components/compose/section-list";
import { profilePrompt } from "@/lib/agent-prompt";
import { listCollection, listItemCollection, repoCollection } from "@/lib/collections";
import { demoUser } from "@/lib/demo";
import { defaultCharacter } from "../../server/character";
import {
  DEFAULT_RATING_MIN,
  TOP_FOUR,
  composeMarkdown,
  defaultComposition,
  validLogin,
  type Composition,
  type Options,
  type Section,
} from "@/lib/published-list";

export const Route = createFileRoute("/compose")({ component: ComposePage });

const SUBHEAD = "text-xs font-medium uppercase tracking-wider text-muted-foreground";

// Kept while the app is open, so leaving to rate a repo and coming back loses nothing.
// A reload starts over; saved profiles come with publishing (issue #40).
let kept: Composition | null = null;

function ComposePage() {
  const { data: repos } = useLiveQuery((q) => q.from({ repoCollection }).select(({ repoCollection }) => repoCollection));
  const { data: lists } = useLiveQuery((q) => q.from({ listCollection }).select(({ listCollection }) => listCollection));
  const { data: listItems } = useLiveQuery((q) => q.from({ listItemCollection }).select(({ listItemCollection }) => listItemCollection));

  // Fixed when the screen opens, so a README doesn't change under you as time passes.
  const [now] = useState(() => Date.now());
  const [edited, setEditedState] = useState<Composition | null>(kept);
  // One pane at a time on a phone; both side by side from lg up.
  const [pane, setPane] = useState<"edit" | "readme">("readme");
  const [format, setFormat] = useState<"preview" | "markdown">("preview");
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [leftOutOpen, setLeftOutOpen] = useState(false);

  const allLists = useMemo(() => lists ?? [], [lists]);
  const allRepos = useMemo(() => repos ?? [], [repos]);
  const repoById = useMemo(() => new Map(allRepos.map((r) => [r.id, r])), [allRepos]);
  // Until something is changed, the profile follows the stars: best-rated four, one section per List.
  const composition = useMemo(() => edited ?? defaultComposition(allLists, allRepos, demoUser.current ?? ""), [edited, allLists, allRepos]);

  const composed = useMemo(
    () => composeMarkdown(composition, { repos: allRepos, lists: allLists, listItems: listItems ?? [] }, now),
    [composition, allRepos, allLists, listItems, now],
  );

  function update(change: (c: Composition) => Composition) {
    kept = change(composition);
    setEditedState(kept);
  }
  function startOver() {
    kept = null;
    setEditedState(null);
  }
  function setOption(key: keyof Options, on: boolean) {
    update((c) => ({ ...c, options: { ...c.options, [key]: on } }));
  }
  // A profile leads with the top four, then reviews; a List goes last.
  function addSection(section: Section) {
    update((c) => {
      if (section.kind === "list") return { ...c, sections: [...c.sections, section] };
      if (section.kind === "character") return { ...c, sections: [section, ...c.sections] };
      const lead = c.sections.findIndex((s) => (section.kind === "topFour" ? s.kind !== "character" : s.kind !== "character" && s.kind !== "topFour" && s.kind !== "reviews"));
      const at = lead === -1 ? c.sections.length : lead;
      return { ...c, sections: [...c.sections.slice(0, at), section, ...c.sections.slice(at)] };
    });
    if (section.kind === "character" || section.kind === "topFour" || section.kind === "reviews") setPickingFor(section.id);
  }

  const has = (kind: Section["kind"]) => composition.sections.some((s) => s.kind === kind);
  const usedLists = new Set(composition.sections.flatMap((s) => (s.kind === "list" ? [s.listId] : [])));
  const unusedLists = allLists.filter((l) => !usedLists.has(l.id));
  const picking = composition.sections.find((s) => s.id === pickingFor);
  const pickingIds = picking?.kind === "topFour" || picking?.kind === "reviews" ? picking.repoIds : [];

  const { archived, quiet } = composed.leftOut;
  const leftOutParts = [archived.length && `${archived.length} archived`, quiet.length && `${quiet.length} quiet`].filter(Boolean);
  const leftOutLabel = leftOutParts.length
    ? `${leftOutParts.join(", ")} left out of your Lists`
    : composed.keptQuiet.length
      ? `${composed.keptQuiet.length} quiet kept in your Lists`
      : null;

  const login = composition.login.trim();
  const loginOk = validLogin(login);

  function download() {
    const url = URL.createObjectURL(new Blob([composed.markdown], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "README.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Profile</h1>
        <p className="text-sm text-muted-foreground">Your top four, your reviews and your Lists, as cards for your GitHub README.</p>
      </div>

      <Tabs value={pane} onValueChange={(value) => setPane(value as typeof pane)} className="lg:hidden">
        <TabsList>
          <TabsTrigger value="readme">README</TabsTrigger>
          <TabsTrigger value="edit">Edit</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] lg:items-start">
        <div className={`min-w-0 space-y-6 ${pane === "edit" ? "" : "max-lg:hidden"}`}>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="compose-login">GitHub username</Label>
              <Help label="About the username">Each card is signed with this name. Without a username the README is plain text with no cards.</Help>
            </div>
            <Input
              id="compose-login"
              value={composition.login}
              placeholder="octocat"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={login !== "" && !loginOk}
              onChange={(e) => update((c) => ({ ...c, login: e.target.value.replace(/^@/, "") }))}
            />
            {!loginOk && (
              <p className="text-xs text-muted-foreground">
                {login === "" ? "Add your username to turn the sections below into cards." : "That isn't a GitHub username."}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className={SUBHEAD}>Sections</h2>
              {edited && (
                <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={startOver}>Start over</Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" size="sm" className={edited ? "" : "ml-auto"} />}>
                  <Plus /> Add section
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
                  {!has("character") && (
                    <DropdownMenuItem onClick={() => addSection({ id: crypto.randomUUID(), kind: "character", character: null, heading: "" })}>Character</DropdownMenuItem>
                  )}
                  {!has("topFour") && (
                    <DropdownMenuItem onClick={() => addSection({ id: crypto.randomUUID(), kind: "topFour", repoIds: [], heading: "" })}>Top four</DropdownMenuItem>
                  )}
                  {!has("reviews") && (
                    <DropdownMenuItem onClick={() => addSection({ id: crypto.randomUUID(), kind: "reviews", repoIds: [], heading: "" })}>Reviews</DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => addSection({ id: crypto.randomUUID(), kind: "rating", min: DEFAULT_RATING_MIN, heading: "" })}>By rating</DropdownMenuItem>
                  {unusedLists.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Your Lists</DropdownMenuLabel>
                        {unusedLists.map((l) => (
                          <DropdownMenuItem key={l.id} onClick={() => addSection({ id: crypto.randomUUID(), kind: "list", listId: l.id, heading: "" })}>
                            <span className="min-w-0 flex-1 truncate">{l.name}</span>
                            {l.is_private && <Lock className="size-3.5 text-muted-foreground" aria-label="Private List" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {composition.sections.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing in this profile yet. Add your top four to begin.
              </p>
            ) : (
              <SectionList
                sections={composition.sections}
                counts={composed.counts}
                lists={allLists}
                repos={repoById}
                login={login}
                onChange={(sections) => update((c) => ({ ...c, sections }))}
                onPick={setPickingFor}
                markdownFor={(section) =>
                  composeMarkdown({ ...composition, sections: [section], options: { ...composition.options, credit: false } }, { repos: allRepos, lists: allLists, listItems: listItems ?? [] }, now).markdown
                }
              />
            )}
            {leftOutLabel && (
              <button
                type="button"
                onClick={() => setLeftOutOpen(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <span className="min-w-0 flex-1">{leftOutLabel}</span>
                <span className="flex shrink-0 items-center font-medium text-foreground">Review <ChevronRight className="size-4" /></span>
              </button>
            )}
          </div>

          <div className="space-y-2.5">
            <h2 className={SUBHEAD}>Lists show</h2>
            <OptionRow label="The repos, folded under each card" checked={composition.options.repos} onChange={(on) => setOption("repos", on)}>
              A reader clicks "All 28 repos" under a List's card to open the full list.
            </OptionRow>
            <OptionRow label="Your note, when a repo has one" checked={composition.options.notes} onChange={(on) => setOption("notes", on)}>
              A repo without a note shows its description.
            </OptionRow>
            <OptionRow label="Language" checked={composition.options.language} onChange={(on) => setOption("language", on)} />
            <OptionRow label="Star count" checked={composition.options.stars} onChange={(on) => setOption("stars", on)}>
              A star count written into a README goes out of date as the repo gains stars. The cards always show the current count.
            </OptionRow>
          </div>

          <div className="space-y-3">
            <h2 className={SUBHEAD}>Text above the cards</h2>
            <Input aria-label="Title" placeholder="Title (optional)" value={composition.title} onChange={(e) => update((c) => ({ ...c, title: e.target.value }))} />
            <Textarea aria-label="Intro" placeholder="A line or two about you or this list (optional)" value={composition.intro} onChange={(e) => update((c) => ({ ...c, intro: e.target.value }))} className="min-h-16 text-base md:text-sm" />
            <OptionRow label="Made with Stard line" checked={composition.options.credit} onChange={(on) => setOption("credit", on)}>
              The last line of the README, linking to Stard.
            </OptionRow>
          </div>

          <div className="flex items-center gap-1 border-t pt-4">
            <CopyButton text={profilePrompt()} label="Copy a prompt for your agent" />
            <Help label="About the agent prompt">
              Paste the prompt into Claude Code, Codex or another coding agent. The agent asks which repos are your favorites and why, then writes this README with you.
            </Help>
          </div>
        </div>

        <div className={`min-w-0 rounded-lg border bg-card ${pane === "readme" ? "" : "max-lg:hidden"}`}>
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-t-lg border-b bg-card px-3 py-2">
            <span className="flex items-center gap-1.5 text-sm font-medium"><FileText className="size-4 text-muted-foreground" /> README.md</span>
            <Help label="Where the README goes">
              Paste all of the Markdown, or one part with the copy button on that part, into any README. The README of the repo named after your username{loginOk ? ` (${login}/${login})` : ""} shows on your GitHub page. Battles read your character and ace from a repo called stard{loginOk ? ` (${login}/stard)` : ""} first, then from that one.
            </Help>
            <div className="ml-auto flex items-center gap-2">
              <Tabs value={format} onValueChange={(value) => setFormat(value as typeof format)}>
                <TabsList>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                  <TabsTrigger value="markdown">Markdown</TabsTrigger>
                </TabsList>
              </Tabs>
              <CopyButton text={composed.markdown} label="Copy" />
              <Button variant="outline" size="sm" onClick={download} aria-label="Download README.md" title="Download README.md">
                <Download />
              </Button>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            {format === "preview" ? (
              <ReadmePreview markdown={composed.markdown} />
            ) : (
              <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">{composed.markdown}</pre>
            )}
          </div>
        </div>
      </div>

      <RepoPickerSheet
        open={picking?.kind === "topFour" || picking?.kind === "reviews"}
        onOpenChange={(open) => !open && setPickingFor(null)}
        title={picking?.kind === "topFour" ? "Pick your top four" : "Pick repos to review"}
        repos={allRepos}
        picked={pickingIds}
        max={picking?.kind === "topFour" ? TOP_FOUR : undefined}
        onChange={(repoIds) => update((c) => ({ ...c, sections: c.sections.map((s) => (s.id === pickingFor ? ({ ...s, repoIds } as Section) : s)) }))}
      />
      <CharacterSheet
        open={picking?.kind === "character"}
        onOpenChange={(open) => !open && setPickingFor(null)}
        login={login}
        character={(picking?.kind === "character" ? picking.character : null) ?? defaultCharacter(login)}
        onChange={(character) => update((c) => ({ ...c, sections: c.sections.map((s) => (s.id === pickingFor && s.kind === "character" ? { ...s, character } : s)) }))}
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
