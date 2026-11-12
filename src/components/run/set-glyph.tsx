import type { ComponentType } from "react";
import { AppWindow, BookOpen, Brain, ChartColumn, Cpu, Database, Gamepad2, Globe, Hash, Layers, ScrollText, Shield, SquareTerminal, Terminal, type LucideProps } from "lucide-react";

// Each set's mark: a white glyph in a dark hex (docs/GAME-UI.md §4). Topics and type
// families take an icon; a language takes its initials, since no icon reads as one.
// A topic with no bonus of its own takes a hash.

const ICONS: Record<string, ComponentType<LucideProps>> = {
  cli: Terminal,
  ai: Brain,
  web: Globe,
  database: Database,
  security: Shield,
  game: Gamepad2,
  shell: SquareTerminal,
  systems: Cpu,
  scripts: ScrollText,
  "web-family": Layers,
  apps: AppWindow,
  data: ChartColumn,
  docs: BookOpen,
};

const INITIALS: Record<string, string> = {
  typescript: "TS",
  javascript: "JS",
  python: "Py",
  rust: "Rs",
  go: "Go",
  c: "C",
  "c++": "C++",
  java: "Ja",
  kotlin: "Kt",
  swift: "Sw",
  "c#": "C#",
  ruby: "Rb",
  php: "PHP",
};

/** The set's hex. `language` is the card's language, lower-case, so its first set reads as initials. */
export function SetGlyph({ set, language }: { set: string; language?: string | null }) {
  const Icon = ICONS[set];
  const initials = INITIALS[set] ?? (set === language ? set.slice(0, 2).replace(/^./, (letter) => letter.toUpperCase()) : null);
  return (
    <span className="set-hex" aria-hidden>
      {Icon ? <Icon className="size-[9px]" strokeWidth={2.5} /> : initials ? <span className="set-initials" data-long={initials.length > 2 ? "" : undefined}>{initials}</span> : <Hash className="size-[8px]" strokeWidth={2.6} />}
    </span>
  );
}
