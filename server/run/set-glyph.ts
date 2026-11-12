// The app, server and Worker builds each read this file; the reference brings the icon modules' types to all three, which an import of a declaration file can't.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./lucide-icons.d.ts" />
import type { IconNode } from "lucide-react";
import { __iconNode as appWindow } from "lucide-react/dist/esm/icons/app-window.mjs";
import { __iconNode as bookOpen } from "lucide-react/dist/esm/icons/book-open.mjs";
import { __iconNode as brain } from "lucide-react/dist/esm/icons/brain.mjs";
import { __iconNode as chartColumn } from "lucide-react/dist/esm/icons/chart-column.mjs";
import { __iconNode as cpu } from "lucide-react/dist/esm/icons/cpu.mjs";
import { __iconNode as database } from "lucide-react/dist/esm/icons/database.mjs";
import { __iconNode as gamepad } from "lucide-react/dist/esm/icons/gamepad-2.mjs";
import { __iconNode as globe } from "lucide-react/dist/esm/icons/globe.mjs";
import { __iconNode as hash } from "lucide-react/dist/esm/icons/hash.mjs";
import { __iconNode as layers } from "lucide-react/dist/esm/icons/layers.mjs";
import { __iconNode as scrollText } from "lucide-react/dist/esm/icons/scroll-text.mjs";
import { __iconNode as shield } from "lucide-react/dist/esm/icons/shield.mjs";
import { __iconNode as squareTerminal } from "lucide-react/dist/esm/icons/square-terminal.mjs";
import { __iconNode as terminal } from "lucide-react/dist/esm/icons/terminal.mjs";

// Each set's mark: a white glyph in a dark hex (docs/GAME-UI.md §4). Topics and type
// families take an icon; a language takes its initials, since no icon reads as one.
// A topic with no bonus of its own takes a hash. The shop draws the mark with React
// (src/components/run/set-glyph.tsx) and the share pictures as SVG (server/cards.ts).
// An icon is lucide's drawing of it: SVG elements and their attributes, on a 24 by 24 grid.

export type SetMark = { kind: "icon"; node: IconNode } | { kind: "initials"; text: string } | { kind: "topic"; node: IconNode };

const ICONS: Record<string, IconNode> = {
  cli: terminal,
  ai: brain,
  web: globe,
  database,
  security: shield,
  game: gamepad,
  shell: squareTerminal,
  systems: cpu,
  scripts: scrollText,
  "web-family": layers,
  apps: appWindow,
  data: chartColumn,
  docs: bookOpen,
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

/** The set's mark. `language` is the card's language, lower-case, so its first set reads as initials. */
export function markOf(set: string, language?: string | null): SetMark {
  const icon = ICONS[set];
  if (icon) return { kind: "icon", node: icon };
  const initials = INITIALS[set] ?? (set === language ? set.slice(0, 2).replace(/^./, (letter) => letter.toUpperCase()) : null);
  return initials ? { kind: "initials", text: initials } : { kind: "topic", node: hash };
}
