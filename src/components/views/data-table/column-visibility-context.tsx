import { createContext, useContext } from "react";

interface ColumnInfo {
  id: string;
  canHide: boolean;
  isVisible: boolean;
  toggleVisibility: (value: boolean) => void;
}

interface ColumnVisibilityContextValue {
  columns: ColumnInfo[];
}

export const ColumnVisibilityContext =
  createContext<ColumnVisibilityContextValue | null>(null);

export function useColumnVisibility(): ColumnVisibilityContextValue | null {
  return useContext(ColumnVisibilityContext);
}
