import type {
  FilterOption,
  GroupByConfig,
  OptionsConfig,
  RangeFilter,
  RangeFilterDimension,
  ThreeStateFilter,
  ThreeStateFilterDimension,
} from "./types";

// =============================================================================
// URL SERIALIZATION HELPERS
// =============================================================================

export function parseThreeStateParam(param: string | undefined): ThreeStateFilter {
  if (param === undefined || !param) return { mode: "any" };
  if (param === "*") return { mode: "any" };

  const values = param.split(",").filter(Boolean);
  if (values.length === 0) return { mode: "any" };

  const included: string[] = [];
  const excluded: string[] = [];

  for (const v of values) {
    if (v.startsWith("-")) {
      excluded.push(v.slice(1));
    } else if (v.startsWith("+")) {
      included.push(v.slice(1));
    } else {
      included.push(v);
    }
  }

  if (included.length > 0) return { mode: "include", values: included };
  if (excluded.length > 0) return { mode: "exclude", values: excluded };
  return { mode: "any" };
}

export function serializeThreeStateParam(filter: ThreeStateFilter): string | undefined {
  if (filter.mode === "any") return "*";
  if (filter.values.length === 0) return "*";
  const prefix = filter.mode === "include" ? "+" : "-";
  return filter.values.map((v) => `${prefix}${v}`).join(",");
}

// =============================================================================
// THREE-STATE FILTER BUILDER
// =============================================================================

interface ThreeStateFilterConfig<TData, TMeta = unknown> {
  id: string;
  label: string;
  urlParam: string;
  options: OptionsConfig<TData, TMeta>;
  match: (item: TData, filter: ThreeStateFilter) => boolean;
  renderOption?: (option: FilterOption) => React.ReactNode;
  groupBy?: Omit<GroupByConfig<TData>, "enabled">;
  defaultValue?: ThreeStateFilter;
}

export function createThreeStateFilter<TData, TMeta = unknown>(
  config: ThreeStateFilterConfig<TData, TMeta>,
): ThreeStateFilterDimension<TData, TMeta> {
  return {
    type: "three-state",
    id: config.id,
    label: config.label,
    urlParam: config.urlParam,
    options: config.options,
    defaultValue: config.defaultValue ?? { mode: "any" },
    match: config.match,
    serialize: serializeThreeStateParam,
    parse: parseThreeStateParam,
    renderOption: config.renderOption,
    groupBy: config.groupBy ? { enabled: true, ...config.groupBy } : undefined,
  };
}

// =============================================================================
// RANGE FILTER BUILDER
// =============================================================================

interface RangeFilterConfig<TData> {
  id: string;
  label: string;
  urlParamMin: string;
  urlParamMax: string;
  match: (item: TData, filter: RangeFilter) => boolean;
}

export function createRangeFilter<TData>(
  config: RangeFilterConfig<TData>,
): RangeFilterDimension<TData> {
  return {
    type: "range",
    id: config.id,
    label: config.label,
    urlParamMin: config.urlParamMin,
    urlParamMax: config.urlParamMax,
    defaultValue: {},
    match: config.match,
    serialize: (value: RangeFilter) => {
      if (value.min === undefined && value.max === undefined) return undefined;
      return JSON.stringify(value);
    },
    parse: () => ({}),
  };
}

// =============================================================================
// COMMON MATCHER HELPERS
// =============================================================================

export function matchThreeState(
  itemValue: string | null | undefined,
  filter: ThreeStateFilter,
): boolean {
  if (filter.mode === "any") return true;
  if (!itemValue) return filter.mode === "exclude";
  if (filter.mode === "include") return filter.values.includes(itemValue);
  if (filter.mode === "exclude") return !filter.values.includes(itemValue);
  return true;
}

export function matchThreeStateArray(
  itemValues: string[],
  filter: ThreeStateFilter,
): boolean {
  if (filter.mode === "any") return true;
  if (itemValues.length === 0) return filter.mode === "exclude";
  if (filter.mode === "include") {
    return itemValues.some((v) => filter.values.includes(v));
  }
  if (filter.mode === "exclude") {
    return !itemValues.some((v) => filter.values.includes(v));
  }
  return true;
}
