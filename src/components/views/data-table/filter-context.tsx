import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";

import type {
  FilterDimension,
  FilterOption,
  FilterRegistry,
  FilterValue,
  GroupedItems,
  RangeFilter,
  SortDefinition,
  ThreeStateFilter,
  ViewState,
} from "./types";

// =============================================================================
// HELPERS
// =============================================================================

function isThreeStateEqual(a: ThreeStateFilter, b: ThreeStateFilter): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === "any" && b.mode === "any") return true;
  const aVals = "values" in a ? [...a.values].sort() : [];
  const bVals = "values" in b ? [...b.values].sort() : [];
  return aVals.length === bVals.length && aVals.every((v, i) => v === bVals[i]);
}

// =============================================================================
// CONTEXT TYPE
// =============================================================================

interface FilterContextValue<TData, TFilterKeys extends string = string> {
  viewState: ViewState<TFilterKeys>;
  updateViewState: (state: ViewState<TFilterKeys>) => void;
  updateFilter: (dimensionId: TFilterKeys, value: FilterValue) => void;
  updateSearchQuery: (query: string) => void;
  updatePage: (page: number) => void;
  resetFilters: () => void;

  filteredItems: TData[];
  groupedItems: GroupedItems<TData>;
  totalCount: number;
  filteredCount: number;
  activeFilterCount: number;

  dimensionOptions: Record<TFilterKeys, FilterOption[]>;

  registry: FilterRegistry<TData>;
  sortDefinitions: SortDefinition<TData>[];
  groupByOptions: Array<{ value: string; label: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FilterContext = createContext<FilterContextValue<any, any> | null>(null);

// =============================================================================
// PROVIDER
// =============================================================================

interface FilterProviderProps<TData, TFilterKeys extends string> {
  children: ReactNode;
  items: TData[];
  registry: Record<TFilterKeys, FilterDimension<TData>>;
  sortDefinitions: SortDefinition<TData>[];
  defaultSort: string;
  defaultGroupBy: TFilterKeys | "none";
  viewState: ViewState<TFilterKeys>;
  onViewStateChange: (state: ViewState<TFilterKeys>) => void;
  searchFields?: (item: TData) => string[];
}

export function FilterProvider<TData, TFilterKeys extends string>({
  children,
  items,
  registry,
  sortDefinitions,
  defaultSort,
  defaultGroupBy,
  viewState,
  onViewStateChange,
  searchFields,
}: FilterProviderProps<TData, TFilterKeys>) {
  // ==========================================================================
  // DERIVE ALL OPTIONS
  // ==========================================================================

  const dimensionOptions = useMemo(() => {
    const options: Record<string, FilterOption[]> = {};

    for (const [id, dim] of Object.entries(registry) as Array<
      [string, FilterDimension<TData>]
    >) {
      if (dim.type === "three-state") {
        switch (dim.options.source) {
          case "static":
            options[id] = dim.options.values;
            break;
          case "items":
            options[id] = dim.options.derive(items);
            break;
        }
      } else {
        options[id] = [];
      }
    }

    return options as Record<TFilterKeys, FilterOption[]>;
  }, [items, registry]);

  // ==========================================================================
  // APPLY FILTERS
  // ==========================================================================

  const filteredItems = useMemo(() => {
    const searchLower = viewState.searchQuery.toLowerCase().trim();

    return items.filter((item) => {
      if (searchLower && searchFields) {
        const fields = searchFields(item);
        const matchesSearch = fields.some(
          (field) => field && field.toLowerCase().includes(searchLower),
        );
        if (!matchesSearch) return false;
      }

      for (const [id, dim] of Object.entries(registry) as Array<
        [string, FilterDimension<TData>]
      >) {
        const filterValue = viewState.filters[id as TFilterKeys];
        if (!dim.match(item, filterValue as never)) return false;
      }
      return true;
    });
  }, [items, viewState.filters, viewState.searchQuery, registry, searchFields]);

  // ==========================================================================
  // APPLY SORTING
  // ==========================================================================

  const sortedItems = useMemo(() => {
    const sortDef = sortDefinitions.find((s) => s.value === viewState.sort);
    if (!sortDef) return filteredItems;
    return [...filteredItems].sort(sortDef.compare);
  }, [filteredItems, viewState.sort, sortDefinitions]);

  // ==========================================================================
  // APPLY GROUPING
  // ==========================================================================

  const groupedItems = useMemo((): GroupedItems<TData> => {
    if (viewState.groupBy === "none") {
      return sortedItems.length > 0
        ? [{ groupId: "all", label: "All Items", items: sortedItems }]
        : [];
    }

    const dim = registry[viewState.groupBy as TFilterKeys];
    if (!dim?.groupBy?.enabled) {
      return [{ groupId: "all", label: "All Items", items: sortedItems }];
    }

    return dim.groupBy.grouper(sortedItems);
  }, [sortedItems, viewState.groupBy, registry]);

  // ==========================================================================
  // GROUP BY OPTIONS (derived from registry)
  // ==========================================================================

  const groupByOptions = useMemo(() => {
    const options = Object.values(registry)
      .filter(
        (dim): dim is FilterDimension<TData> & { groupBy: { enabled: true } } =>
          !!(dim as FilterDimension<TData>).groupBy?.enabled,
      )
      .map((dim) => ({ value: dim.id, label: dim.label }));
    return [...options, { value: "none", label: "None" }];
  }, [registry]);

  // ==========================================================================
  // COUNT ACTIVE FILTERS
  // ==========================================================================

  const activeFilterCount = useMemo(() => {
    let count = 0;
    for (const [id, dim] of Object.entries(registry) as Array<
      [string, FilterDimension<TData>]
    >) {
      const value = viewState.filters[id as TFilterKeys];
      if (dim.type === "three-state") {
        if (!isThreeStateEqual(value as ThreeStateFilter, dim.defaultValue)) {
          count++;
        }
      } else if (dim.type === "range") {
        const range = value as RangeFilter;
        if (range.min !== undefined || range.max !== undefined) count++;
      }
    }
    return count;
  }, [viewState.filters, registry]);

  // ==========================================================================
  // UPDATE HELPERS
  // ==========================================================================

  const updateFilter = useCallback(
    (dimensionId: TFilterKeys, value: FilterValue) => {
      onViewStateChange({
        ...viewState,
        page: 0,
        filters: { ...viewState.filters, [dimensionId]: value },
      });
    },
    [viewState, onViewStateChange],
  );

  const updateSearchQuery = useCallback(
    (query: string) => {
      onViewStateChange({ ...viewState, page: 0, searchQuery: query });
    },
    [viewState, onViewStateChange],
  );

  const updatePage = useCallback(
    (page: number) => {
      onViewStateChange({ ...viewState, page });
    },
    [viewState, onViewStateChange],
  );

  const resetFilters = useCallback(() => {
    const filters: Record<string, FilterValue> = {};
    for (const [id, dim] of Object.entries(registry) as Array<
      [string, FilterDimension<TData>]
    >) {
      filters[id] = dim.defaultValue;
    }
    onViewStateChange({
      sort: defaultSort,
      groupBy: defaultGroupBy,
      filters: filters as Record<TFilterKeys, FilterValue>,
      searchQuery: "",
      page: 0,
    });
  }, [onViewStateChange, registry, defaultSort, defaultGroupBy]);

  // ==========================================================================
  // CONTEXT VALUE
  // ==========================================================================

  const contextValue = useMemo(
    () => ({
      viewState,
      updateViewState: onViewStateChange,
      updateFilter,
      updateSearchQuery,
      updatePage,
      resetFilters,
      filteredItems: sortedItems,
      groupedItems,
      totalCount: items.length,
      filteredCount: sortedItems.length,
      activeFilterCount,
      dimensionOptions,
      registry,
      sortDefinitions,
      groupByOptions,
    }),
    [
      viewState,
      onViewStateChange,
      updateFilter,
      updateSearchQuery,
      updatePage,
      resetFilters,
      sortedItems,
      groupedItems,
      items.length,
      activeFilterCount,
      dimensionOptions,
      registry,
      sortDefinitions,
      groupByOptions,
    ],
  );

  return (
    <FilterContext.Provider value={contextValue}>
      {children}
    </FilterContext.Provider>
  );
}

// =============================================================================
// HOOK
// =============================================================================

export function useFilter<
  TData = unknown,
  TFilterKeys extends string = string,
>(): FilterContextValue<TData, TFilterKeys> {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error("useFilter must be used within a FilterProvider");
  }
  return context as FilterContextValue<TData, TFilterKeys>;
}

// =============================================================================
// URL STATE HELPERS
// =============================================================================

export function getDefaultViewState<TData, TFilterKeys extends string>(
  registry: Record<TFilterKeys, FilterDimension<TData>>,
  defaultSort: string,
  defaultGroupBy: TFilterKeys | "none",
): ViewState<TFilterKeys> {
  const filters: Record<string, FilterValue> = {};
  for (const [id, dim] of Object.entries(registry) as Array<
    [string, FilterDimension<TData>]
  >) {
    filters[id] = dim.defaultValue;
  }
  return {
    sort: defaultSort,
    groupBy: defaultGroupBy,
    filters: filters as Record<TFilterKeys, FilterValue>,
    searchQuery: "",
    page: 0,
  };
}

export function parseUrlToViewState<TData, TFilterKeys extends string>(
  params: Record<string, string | number | undefined>,
  registry: Record<TFilterKeys, FilterDimension<TData>>,
  defaultSort: string,
  defaultGroupBy: TFilterKeys | "none",
): ViewState<TFilterKeys> {
  const filters: Record<string, FilterValue> = {};

  for (const [id, dim] of Object.entries(registry) as Array<
    [string, FilterDimension<TData>]
  >) {
    if (dim.type === "three-state") {
      const urlValue = params[dim.urlParam] as string | undefined;
      filters[id] = urlValue !== undefined ? dim.parse(urlValue) : dim.defaultValue;
    } else if (dim.type === "range") {
      filters[id] = {
        min: params[dim.urlParamMin] as number | undefined,
        max: params[dim.urlParamMax] as number | undefined,
      };
    }
  }

  const pageParam = params.page;
  const page = typeof pageParam === "number" ? pageParam : (typeof pageParam === "string" ? parseInt(pageParam, 10) || 0 : 0);

  return {
    sort: (params.sort as string) ?? defaultSort,
    groupBy: (params.group as TFilterKeys | "none") ?? defaultGroupBy,
    filters: filters as Record<TFilterKeys, FilterValue>,
    searchQuery: (params.search as string) ?? "",
    page,
  };
}

export function serializeViewStateToUrl<TData, TFilterKeys extends string>(
  state: ViewState<TFilterKeys>,
  registry: Record<TFilterKeys, FilterDimension<TData>>,
  defaultSort: string,
  defaultGroupBy: TFilterKeys | "none",
): Record<string, string | number | undefined> {
  const params: Record<string, string | number | undefined> = {};

  if (state.sort !== defaultSort) params.sort = state.sort;
  if (state.groupBy !== defaultGroupBy) params.group = state.groupBy;
  if (state.searchQuery) params.search = state.searchQuery;
  if (state.page > 0) params.page = state.page;

  for (const [id, dim] of Object.entries(registry) as Array<
    [string, FilterDimension<TData>]
  >) {
    const value = state.filters[id as TFilterKeys];

    if (dim.type === "three-state") {
      const filterValue = value as ThreeStateFilter;
      if (!isThreeStateEqual(filterValue, dim.defaultValue)) {
        const serialized = dim.serialize(filterValue);
        if (serialized) params[dim.urlParam] = serialized;
      }
    } else if (dim.type === "range") {
      const range = value as RangeFilter;
      if (range.min !== undefined) params[dim.urlParamMin] = range.min;
      if (range.max !== undefined) params[dim.urlParamMax] = range.max;
    }
  }

  return params;
}

export function hasActiveFilters<TData, TFilterKeys extends string>(
  state: ViewState<TFilterKeys>,
  registry: Record<TFilterKeys, FilterDimension<TData>>,
  defaultSort: string,
  defaultGroupBy: TFilterKeys | "none",
): boolean {
  if (state.sort !== defaultSort) return true;
  if (state.groupBy !== defaultGroupBy) return true;

  for (const [id, dim] of Object.entries(registry) as Array<
    [string, FilterDimension<TData>]
  >) {
    const value = state.filters[id as TFilterKeys];
    if (dim.type === "three-state") {
      if (!isThreeStateEqual(value as ThreeStateFilter, dim.defaultValue)) {
        return true;
      }
    } else if (dim.type === "range") {
      const range = value as RangeFilter;
      if (range.min !== undefined || range.max !== undefined) return true;
    }
  }

  return false;
}
