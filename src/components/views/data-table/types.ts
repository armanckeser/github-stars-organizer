import type { ReactNode } from "react";

// =============================================================================
// FILTER VALUE TYPES
// =============================================================================

export type ThreeStateFilter<T extends string = string> =
  | { mode: "any" }
  | { mode: "include"; values: T[] }
  | { mode: "exclude"; values: T[] };

export type RangeFilter = { min?: number; max?: number };

export type FilterValue = ThreeStateFilter | RangeFilter;

// =============================================================================
// OPTION TYPES
// =============================================================================

export interface FilterOption<TMeta = unknown> {
  value: string;
  label: string;
  meta?: TMeta;
}

interface StaticOptionsConfig<TMeta = unknown> {
  source: "static";
  values: FilterOption<TMeta>[];
}

interface ItemOptionsConfig<TData, TMeta = unknown> {
  source: "items";
  derive: (items: TData[]) => FilterOption<TMeta>[];
}

export type OptionsConfig<TData, TMeta = unknown> =
  | StaticOptionsConfig<TMeta>
  | ItemOptionsConfig<TData, TMeta>;

// =============================================================================
// GROUP BY TYPES
// =============================================================================

export interface ItemGroup<TData> {
  groupId: string;
  label: string;
  items: TData[];
}

export type GroupedItems<TData> = ItemGroup<TData>[];

export interface GroupByConfig<TData> {
  enabled: true;
  grouper: (items: TData[]) => ItemGroup<TData>[];
}

// =============================================================================
// FILTER DIMENSION TYPES
// =============================================================================

interface FilterDimensionBase<TData, TValue extends FilterValue> {
  id: string;
  label: string;
  urlParam: string;
  defaultValue: TValue;
  match: (item: TData, value: TValue) => boolean;
  serialize: (value: TValue) => string | undefined;
  parse: (param: string | undefined) => TValue;
  renderOption?: (option: FilterOption) => ReactNode;
  groupBy?: GroupByConfig<TData>;
}

export interface ThreeStateFilterDimension<TData, TMeta = unknown>
  extends FilterDimensionBase<TData, ThreeStateFilter> {
  type: "three-state";
  options: OptionsConfig<TData, TMeta>;
}

export interface RangeFilterDimension<TData>
  extends Omit<FilterDimensionBase<TData, RangeFilter>, "urlParam"> {
  type: "range";
  urlParamMin: string;
  urlParamMax: string;
}

export type FilterDimension<TData> =
  | ThreeStateFilterDimension<TData>
  | RangeFilterDimension<TData>;

// =============================================================================
// SORT TYPES
// =============================================================================

export interface SortDefinition<TData> {
  value: string;
  label: string;
  category: string;
  compare: (a: TData, b: TData) => number;
}

// =============================================================================
// VIEW STATE
// =============================================================================

export interface ViewState<TFilterKeys extends string = string> {
  sort: string;
  groupBy: TFilterKeys | "none";
  filters: Record<TFilterKeys, FilterValue>;
  searchQuery: string;
  page: number;
}

// =============================================================================
// REGISTRY TYPE
// =============================================================================

export type FilterRegistry<TData> = Record<string, FilterDimension<TData>>;
