// lucide-react's per-icon modules carry the icon's drawing as plain data, which the
// Worker can draw without React (server/run/set-glyph.ts).
declare module "lucide-react/dist/esm/icons/*.mjs" {
  import type { IconNode } from "lucide-react";
  export const __iconNode: IconNode;
}
