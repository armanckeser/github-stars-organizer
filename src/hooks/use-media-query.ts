import { useSyncExternalStore } from "react";

// Layout switches that need different markup, not just different CSS:
// rendering both a table and a list and hiding one would double the DOM.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

export const useIsDesktop = () => useMediaQuery("(min-width: 768px)");
