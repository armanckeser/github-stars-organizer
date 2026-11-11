import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Copy, GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Figure } from "@/components/battle/figure";
import { Help } from "@/components/compose/controls";
import { StarRating } from "@/components/repo-detail-sheet";
import { repoCollection } from "@/lib/collections";
import { MAX_REVIEW_CHARS, TOP_FOUR, defaultHeading, type ComposeList, type ComposeRepo, type Section } from "@/lib/published-list";
import { CLASSES, defaultCharacter } from "../../../server/character";

// What a section is and how much is in it, under its heading.
function summary(section: Section, count: number): string {
  if (section.kind === "character") return count === 0 ? "Needs your username" : CLASSES[section.character?.klass ?? "rookie"].label;
  if (section.kind === "topFour") return `${count} of ${TOP_FOUR} picked`;
  if (section.kind === "reviews") return count === 0 ? "No reviews yet" : `${count} ${count === 1 ? "review" : "reviews"}`;
  const kind = section.kind === "list" ? "List" : "By rating";
  return count === 0 ? `${kind} · no repos, not shown` : `${kind} · ${count} ${count === 1 ? "repo" : "repos"}`;
}

// A review is the rating and the note the repo already has, edited here where it is read.
function ReviewEditor({ repo, onRemove }: { repo: ComposeRepo; onRemove: () => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? repo.notes ?? "";

  function save() {
    if (draft === null || draft === (repo.notes ?? "")) return;
    repoCollection.update(repo.id, (r) => {
      r.notes = draft;
    });
  }

  return (
    <li className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{repo.full_name}</span>
        <StarRating
          value={repo.usefulness_rating}
          onChange={(rating) => repoCollection.update(repo.id, (r) => { r.usefulness_rating = rating; })}
        />
        <Button variant="ghost" size="icon-sm" aria-label={`Remove the review of ${repo.full_name}`} title="Remove this review" onClick={onRemove}>
          <X />
        </Button>
      </div>
      <Textarea
        value={text}
        maxLength={MAX_REVIEW_CHARS}
        placeholder="What you think of this repo, in a sentence or two."
        aria-label={`Review of ${repo.full_name}`}
        className="min-h-16 text-base md:text-sm"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
      />
    </li>
  );
}

function SectionRow({
  section,
  count,
  lists,
  repos,
  login,
  onChange,
  onRemove,
  onPick,
  markdown,
}: {
  /** This section alone as Markdown, for someone who wants one part in a README they already have. */
  markdown: string;
  login: string;
  section: Section;
  count: number;
  lists: ComposeList[];
  repos: Map<string, ComposeRepo>;
  onChange: (change: Partial<Section>) => void;
  onRemove: () => void;
  onPick: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: section.id });
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  // The heading shows its default until someone types; emptying the field brings the default back.
  const [typing, setTyping] = useState<string | null>(null);
  const fallback = defaultHeading(section, lists);
  const heading = typing ?? (section.heading || fallback);
  const picked = section.kind === "topFour" || section.kind === "reviews" ? section.repoIds.flatMap((id) => repos.get(id) ?? []) : [];
  const listGone = section.kind === "list" && !lists.some((l) => l.id === section.listId);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-lg border bg-card ${isDragging ? "relative z-10 shadow-lg" : ""}`}
    >
      <div className="flex items-center gap-1 p-1.5">
        <button
          type="button"
          aria-label={`Move ${heading}`}
          title="Drag to reorder"
          className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={heading}
            placeholder={fallback}
            aria-label="Section heading"
            className="w-full rounded-md bg-transparent px-1.5 py-0.5 text-base font-medium outline-none placeholder:text-muted-foreground hover:bg-accent/60 focus-visible:bg-accent/60 md:text-sm"
            onChange={(e) => {
              setTyping(e.target.value);
              onChange({ heading: e.target.value === fallback ? "" : e.target.value });
            }}
            onBlur={() => setTyping(null)}
          />
          <p className="px-1.5 text-xs tabular-nums text-muted-foreground">{summary(section, count)}</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={`Copy ${heading} as Markdown`} title="Copy this part only" onClick={copy}>
          {copied ? <Check /> : <Copy />}
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${heading}`} title="Remove this section" onClick={onRemove}>
          <X />
        </Button>
      </div>

      {section.kind === "character" && (
        <div className="flex items-center gap-3 border-t px-3 py-2">
          <div className="shrink-0 rounded-md" style={{ background: CLASSES[section.character?.klass ?? "rookie"].color }}>
            <Figure look={(section.character ?? defaultCharacter(login)).look} className="h-14 w-auto" />
          </div>
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">{CLASSES[section.character?.klass ?? "rookie"].perk}</p>
          <Button variant="outline" size="sm" onClick={onPick}>{section.character ? "Edit" : "Build yours"}</Button>
        </div>
      )}
      {section.kind === "topFour" && (
        <div className="flex items-center gap-2 border-t px-3 py-2">
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {picked.length ? picked.map((r) => r.full_name.split("/")[1]).join(", ") : "The four repos you would put on a poster."}
          </p>
          <Button variant="outline" size="sm" onClick={onPick}>{picked.length ? "Change" : "Pick four"}</Button>
        </div>
      )}
      {section.kind === "reviews" && (
        <div className="space-y-3 border-t px-3 py-3">
          {picked.length > 0 && (
            <ul className="space-y-3">
              {picked.map((repo) => (
                <ReviewEditor key={repo.id} repo={repo} onRemove={() => onChange({ repoIds: section.repoIds.filter((id) => id !== repo.id) })} />
              ))}
            </ul>
          )}
          <Button variant="outline" size="sm" onClick={onPick}>{picked.length ? "Review another repo" : "Pick repos to review"}</Button>
        </div>
      )}
      {section.kind === "rating" && (
        <div className="flex items-center gap-2 border-t px-3 py-2 text-sm">
          <span>Rated at least</span>
          <Select value={String(section.min)} onValueChange={(value) => onChange({ min: Number(value) })}>
            <SelectTrigger size="sm" aria-label="Lowest rating"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Help label="About ratings">Uses the rating you gave each repo, from 1 to 5. Repos without a rating are not included.</Help>
        </div>
      )}
      {listGone && <p className="border-t px-3 py-2 text-sm text-muted-foreground">This List no longer exists.</p>}
    </li>
  );
}

export function SectionList({
  sections,
  counts,
  lists,
  repos,
  login,
  onChange,
  onPick,
  markdownFor,
}: {
  markdownFor: (section: Section) => string;
  login: string;
  sections: Section[];
  counts: Record<string, number>;
  lists: ComposeList[];
  repos: Map<string, ComposeRepo>;
  onChange: (sections: Section[]) => void;
  onPick: (sectionId: string) => void;
}) {
  // A short drag distance first, so a press on the handle that doesn't move stays a press.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = sections.findIndex((s) => s.id === active.id);
    const to = sections.findIndex((s) => s.id === over.id);
    onChange(arrayMove(sections, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {sections.map((section) => (
            <SectionRow
              key={section.id}
              section={section}
              count={counts[section.id] ?? 0}
              lists={lists}
              repos={repos}
              login={login}
              onChange={(change) => onChange(sections.map((s) => (s.id === section.id ? ({ ...s, ...change } as Section) : s)))}
              onRemove={() => onChange(sections.filter((s) => s.id !== section.id))}
              onPick={() => onPick(section.id)}
              markdown={markdownFor(section)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
