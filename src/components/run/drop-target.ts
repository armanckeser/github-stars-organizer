// Where a dragged creature can land outside the 3D board: a bench slot or the shop.
// The elements mark themselves with `data-drop="bench:<slot>"` or `data-drop="shop"`.

export type DropTarget = { kind: "bench"; slot: number } | { kind: "shop" };

export const benchDrop = (slot: number) => `bench:${slot}`;
export const SHOP_DROP = "shop";

/** The drop target under a point on screen, or null over the board or anything else. */
export function dropTargetAt(clientX: number, clientY: number): DropTarget | null {
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    const marked = element.closest<HTMLElement>("[data-drop]");
    if (!marked) continue;
    const drop = marked.dataset.drop ?? "";
    if (drop === SHOP_DROP) return { kind: "shop" };
    const bench = /^bench:(\d+)$/.exec(drop);
    if (bench) return { kind: "bench", slot: Number(bench[1]) };
  }
  return null;
}

/** Marks the drop target under the point while a drag is on, so the slot or the shop can light up. */
export function markDropTarget(clientX: number | null, clientY: number | null) {
  for (const element of document.querySelectorAll<HTMLElement>("[data-drop][data-over]")) delete element.dataset.over;
  if (clientX === null || clientY === null) return;
  const element = document.elementsFromPoint(clientX, clientY).map((found) => found.closest<HTMLElement>("[data-drop]")).find(Boolean);
  if (element) element.dataset.over = "";
}
