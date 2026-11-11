import { Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function Help({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        render={<button type="button" aria-label={label} title={label} className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" />}
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 text-sm leading-relaxed text-muted-foreground">{children}</PopoverContent>
    </Popover>
  );
}

export function OptionRow({ label, checked, onChange, children }: { label: string; checked: boolean; onChange: (on: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Label className="flex cursor-pointer items-center gap-2 font-normal">
        <Checkbox checked={checked} onCheckedChange={onChange} />
        {label}
      </Label>
      {children && <Help label={`About ${label.toLowerCase()}`}>{children}</Help>}
    </div>
  );
}
