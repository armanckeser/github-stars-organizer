import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Figure } from "@/components/battle/figure";
import { useIsDesktop } from "@/hooks/use-media-query";
import { CLASSES, CLASS_IDS, HAIR, LOOK_PARTS, MAX_MOTTO, MAX_NAME, SKIN, TOP, type Character, type Look } from "../../../server/character";

// The character builder. Nothing is saved from here: the choices go into the address
// of the trainer card in the README, and the game reads them back from there.

const PART_LABEL: Record<keyof Look, string> = { skin: "Skin", hair: "Hair", hairColor: "Hair colour", top: "Top", topColor: "Top colour", extra: "Extra" };
const SWATCHES: Partial<Record<keyof Look, string[]>> = { skin: SKIN, hairColor: HAIR, topColor: TOP };
const PARTS = Object.keys(LOOK_PARTS) as (keyof Look)[];

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
  const setLook = (key: keyof Look, value: number) => onChange({ ...character, look: { ...character.look, [key]: value } });

  function shuffle() {
    const look = {} as Look;
    for (const key of PARTS) look[key] = Math.floor(Math.random() * LOOK_PARTS[key].length);
    onChange({ ...character, look });
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
            {PARTS.map((key) => (
              <div key={key} className="space-y-1.5">
                <p className="text-sm font-medium">{PART_LABEL[key]}</p>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={PART_LABEL[key]}>
                  {LOOK_PARTS[key].map((name, i) => {
                    const on = character.look[key] === i;
                    const swatch = SWATCHES[key]?.[i];
                    return swatch ? (
                      <button key={name} type="button" role="radio" aria-checked={on} aria-label={name} title={name} onClick={() => setLook(key, i)}
                        className={`size-8 rounded-full border-2 transition-transform active:scale-95 ${on ? "border-foreground" : "border-transparent"}`}>
                        <span className="block size-full rounded-full border border-black/20" style={{ background: swatch }} />
                      </button>
                    ) : (
                      <button key={name} type="button" role="radio" aria-checked={on} onClick={() => setLook(key, i)}
                        className={`rounded-md border px-2.5 py-1 text-sm transition-colors hover:bg-accent ${on ? "border-foreground bg-accent font-medium" : ""}`}>
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
