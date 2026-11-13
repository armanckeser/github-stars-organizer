import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Figure } from "@/components/battle/figure";
import { useIsDesktop } from "@/hooks/use-media-query";
import { CLASSES, CLASS_IDS, COLOR_PARTS, MAX_MOTTO, MAX_NAME, STYLE_PARTS, partLabel, type Character, type ColorPart, type Look, type StylePart } from "../../../server/character";

// The character builder. Nothing is saved from here: the choices go into the address
// of the trainer card in the README, and the game reads them back from there.

// The parts in the order the builder lists them, each either a set of styles or a palette.
type Row = { kind: "style"; key: StylePart } | { kind: "color"; key: ColorPart };
const ROWS: Row[] = [
  { kind: "color", key: "skin" },
  { kind: "style", key: "hair" },
  { kind: "color", key: "hairColor" },
  { kind: "style", key: "beard" },
  { kind: "style", key: "glasses" },
  { kind: "style", key: "hat" },
  { kind: "style", key: "headphones" },
  { kind: "style", key: "top" },
  { kind: "color", key: "topColor" },
];
const PART_LABEL: Record<keyof Look, string> = {
  skin: "Skin", hair: "Hair", hairColor: "Hair colour", beard: "Beard", glasses: "Glasses", hat: "Hat", headphones: "Headphones", top: "Top", topColor: "Top colour",
};
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

export function CharacterSheet({
  open,
  onOpenChange,
  login,
  character,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  login: string;
  character: Character;
  onChange: (character: Character) => void;
}) {
  const isDesktop = useIsDesktop();
  const klass = CLASSES[character.klass];
  const setLook = (change: Partial<Look>) => onChange({ ...character, look: { ...character.look, ...change } });

  function shuffle() {
    onChange({
      ...character,
      look: {
        skin: pick(COLOR_PARTS.skin).hex, hair: pick(STYLE_PARTS.hair), hairColor: pick(COLOR_PARTS.hairColor).hex,
        beard: pick(STYLE_PARTS.beard), glasses: pick(STYLE_PARTS.glasses), hat: pick(STYLE_PARTS.hat), headphones: pick(STYLE_PARTS.headphones),
        top: pick(STYLE_PARTS.top), topColor: pick(COLOR_PARTS.topColor).hex,
      },
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={isDesktop ? "overflow-y-auto sm:max-w-md" : "max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)]"}
      >
        <SheetHeader>
          <SheetTitle className="font-display text-lg">Your character</SheetTitle>
          <SheetDescription>Stands behind your cards in a battle. The character lives in your README, in the address of its card.</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-6">
          <div className="flex items-center gap-4 rounded-lg p-3" style={{ background: `${klass.color}33` }}>
            <div className="shrink-0 rounded-md" style={{ background: klass.color }}>
              <Figure look={character.look} className="h-36 w-auto" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="truncate font-display text-xl font-bold tracking-tight">{character.name || login || "Your name"}</p>
              <p className="text-sm font-medium">{klass.label}</p>
              <p className="text-xs text-muted-foreground">{klass.perk}</p>
              <Button variant="outline" size="sm" onClick={shuffle} className="mt-1"><Shuffle /> Shuffle the look</Button>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="character-name">Name</Label>
              <Input id="character-name" value={character.name === login ? "" : character.name} placeholder={login || "Your username"} maxLength={MAX_NAME} onChange={(e) => onChange({ ...character, name: e.target.value || login })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="character-motto">Motto</Label>
              <Input id="character-motto" value={character.motto} placeholder="A line for your card (optional)" maxLength={MAX_MOTTO} onChange={(e) => onChange({ ...character, motto: e.target.value })} />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Class</legend>
            {CLASS_IDS.filter((id) => id !== "rookie").map((id) => {
              const on = character.klass === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  // Pressing the chosen class again goes back to having none.
                  onClick={() => onChange({ ...character, klass: on ? "rookie" : id })}
                  className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent ${on ? "border-foreground bg-accent" : ""}`}
                >
                  <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: CLASSES[id].color }} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{CLASSES[id].label}</span>
                    <span className="block text-xs text-muted-foreground">{CLASSES[id].perk}</span>
                  </span>
                </button>
              );
            })}
          </fieldset>

          <div className="space-y-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Look</h3>
            {ROWS.map((row) => (
              <div key={row.key} className="space-y-1.5">
                <p className="text-sm font-medium">{PART_LABEL[row.key]}</p>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={PART_LABEL[row.key]}>
                  {row.kind === "color" ? <Swatches part={row.key} look={character.look} onPick={setLook} /> : <Styles part={row.key} look={character.look} onPick={setLook} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Swatches({ part, look, onPick }: { part: ColorPart; look: Look; onPick: (change: Partial<Look>) => void }) {
  const palette = COLOR_PARTS[part];
  // A colour from a character file may be off the palette; it still shows, chosen.
  const own = palette.some((swatch) => swatch.hex === look[part]) ? [] : [{ name: look[part], hex: look[part] }];
  return [...palette, ...own].map((swatch) => {
    const on = look[part] === swatch.hex;
    return (
      <button key={swatch.hex} type="button" role="radio" aria-checked={on} aria-label={partLabel(swatch.name)} title={partLabel(swatch.name)} onClick={() => onPick({ [part]: swatch.hex })}
        className={`size-8 rounded-full border-2 transition-transform active:scale-95 ${on ? "border-foreground" : "border-transparent"}`}>
        <span className="block size-full rounded-full border border-black/20" style={{ background: swatch.hex }} />
      </button>
    );
  });
}

function Styles({ part, look, onPick }: { part: StylePart; look: Look; onPick: (change: Partial<Look>) => void }) {
  return STYLE_PARTS[part].map((id) => {
    const on = look[part] === id;
    return (
      <button key={id} type="button" role="radio" aria-checked={on} onClick={() => onPick({ [part]: id })}
        className={`rounded-md border px-2.5 py-1 text-sm transition-colors hover:bg-accent ${on ? "border-foreground bg-accent font-medium" : ""}`}>
        {partLabel(id)}
      </button>
    );
  });
}
