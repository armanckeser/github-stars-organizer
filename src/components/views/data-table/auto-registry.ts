import type { FilterDimension, FilterRegistry, SortDefinition } from "./types";
import {
  createThreeStateFilter,
  createRangeFilter,
  matchThreeState,
} from "./builders";

type FieldType = "string" | "number" | "boolean" | "date" | "unknown";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{20,}$/i;

const NEVER_USEFUL = new Set(["secret", "token", "nonce", "signature", "etag", "checksum"]);

function detectFieldType(values: unknown[]): FieldType {
  const nonNull = values.filter((v) => v != null);
  if (nonNull.length === 0) return "unknown";

  const sample = nonNull[0];

  if (typeof sample === "boolean") return "boolean";
  if (typeof sample === "number") return "number";
  if (typeof sample === "string") {
    if (ISO_DATE_PATTERN.test(sample)) return "date";
    return "string";
  }
  return "unknown";
}

function isOpaqueField(key: string, values: unknown[]): boolean {
  if (NEVER_USEFUL.has(key.toLowerCase())) return true;

  const nonNull = values.filter((v) => v != null);
  if (nonNull.length === 0) return false;

  if (typeof nonNull[0] !== "string") return false;

  const sampleStrings = nonNull.slice(0, 20) as string[];
  const opaqueCount = sampleStrings.filter(
    (v) => UUID_PATTERN.test(v) || HASH_PATTERN.test(v),
  ).length;

  return opaqueCount > sampleStrings.length * 0.5;
}

function hasLowCardinality(uniqueCount: number, totalCount: number): boolean {
  return uniqueCount > 1 && uniqueCount <= Math.min(100, totalCount * 0.8);
}

function isUniform(uniqueCount: number): boolean {
  return uniqueCount <= 1;
}

function labelFromKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface AutoRegistryOptions<TData> {
  exclude?: (keyof TData & string)[];
  include?: (keyof TData & string)[];
}

interface AutoRegistryResult<TData> {
  registry: FilterRegistry<TData>;
  sortDefinitions: SortDefinition<TData>[];
  searchFields: (item: TData) => string[];
}

export function createAutoRegistry<TData extends Record<string, unknown>>(
  sampleItems: TData[],
  options: AutoRegistryOptions<TData> = {},
): AutoRegistryResult<TData> {
  if (sampleItems.length === 0) {
    return { registry: {}, sortDefinitions: [], searchFields: () => [] };
  }

  const sample = sampleItems[0];
  const allKeys = Object.keys(sample) as (keyof TData & string)[];
  const totalCount = sampleItems.length;

  const keys = allKeys.filter((key) => {
    if (key === "id") return false;
    if (options.include) return options.include.includes(key);
    if (options.exclude) return !options.exclude.includes(key);
    return true;
  });

  const registry: Record<string, FilterDimension<TData>> = {};
  const sortDefinitions: SortDefinition<TData>[] = [];
  const searchableFields: string[] = [];

  for (const key of keys) {
    const values = sampleItems.map((item) => item[key]);

    if (isOpaqueField(key, values)) continue;

    const fieldType = detectFieldType(values);
    const label = labelFromKey(key);
    const urlParam = key;

    switch (fieldType) {
      case "string": {
        const uniqueValues = new Set<string>();
        for (const v of values) {
          if (typeof v === "string" && v) uniqueValues.add(v);
        }

        if (isUniform(uniqueValues.size)) break;

        const allUnique = uniqueValues.size === totalCount;
        if (allUnique) {
          searchableFields.push(key);
          break;
        }

        searchableFields.push(key);

        if (hasLowCardinality(uniqueValues.size, totalCount)) {
          registry[key] = createThreeStateFilter<TData>({
            id: key,
            label: `${label} [auto]`,
            urlParam,
            options: {
              source: "items",
              derive: (items) => {
                const counts = new Map<string, number>();
                for (const item of items) {
                  const val = item[key];
                  if (typeof val === "string" && val) {
                    counts.set(val, (counts.get(val) ?? 0) + 1);
                  }
                }
                return Array.from(counts.entries())
                  .sort(([, a], [, b]) => b - a)
                  .map(([value, count]) => ({
                    value,
                    label: `${value} (${count})`,
                  }));
              },
            },
            match: (item, filter) =>
              matchThreeState(item[key] as string | null, filter),
          });
        }

        sortDefinitions.push(
          {
            value: `${key}-asc`,
            label: `${label} A to Z`,
            category: label,
            compare: (a, b) =>
              String(a[key] ?? "").localeCompare(String(b[key] ?? "")),
          },
          {
            value: `${key}-desc`,
            label: `${label} Z to A`,
            category: label,
            compare: (a, b) =>
              String(b[key] ?? "").localeCompare(String(a[key] ?? "")),
          },
        );
        break;
      }

      case "number": {
        const uniqueNumbers = new Set<number>();
        for (const v of values) {
          if (typeof v === "number") uniqueNumbers.add(v);
        }

        if (isUniform(uniqueNumbers.size)) break;

        registry[key] = createRangeFilter<TData>({
          id: key,
          label: `${label} [auto]`,
          urlParamMin: `${key}Min`,
          urlParamMax: `${key}Max`,
          match: (item, filter) => {
            const val = item[key] as number | null;
            if (val == null) return true;
            if (filter.min !== undefined && val < filter.min) return false;
            if (filter.max !== undefined && val > filter.max) return false;
            return true;
          },
        });

        sortDefinitions.push(
          {
            value: `${key}-high`,
            label: `Most ${label.toLowerCase()} first`,
            category: label,
            compare: (a, b) =>
              ((b[key] as number) ?? -Infinity) -
              ((a[key] as number) ?? -Infinity),
          },
          {
            value: `${key}-low`,
            label: `Fewest ${label.toLowerCase()} first`,
            category: label,
            compare: (a, b) =>
              ((a[key] as number) ?? Infinity) -
              ((b[key] as number) ?? Infinity),
          },
        );
        break;
      }

      case "boolean": {
        const trueCount = values.filter((v) => v === true).length;
        const falseCount = values.filter((v) => v === false).length;
        if (trueCount === 0 || falseCount === 0) break;

        registry[key] = createThreeStateFilter<TData>({
          id: key,
          label: `${label} [auto]`,
          urlParam,
          options: {
            source: "static",
            values: [
              { value: "true", label: "Yes" },
              { value: "false", label: "No" },
            ],
          },
          match: (item, filter) =>
            matchThreeState(String(item[key] ?? false), filter),
        });
        break;
      }

      case "date": {
        const uniqueDates = new Set<string>();
        for (const v of values) {
          if (typeof v === "string" && v) uniqueDates.add(v);
        }
        if (isUniform(uniqueDates.size)) break;

        sortDefinitions.push(
          {
            value: `${key}-newest`,
            label: `${label} newest first`,
            category: label,
            compare: (a, b) =>
              new Date((b[key] as string) ?? 0).getTime() -
              new Date((a[key] as string) ?? 0).getTime(),
          },
          {
            value: `${key}-oldest`,
            label: `${label} oldest first`,
            category: label,
            compare: (a, b) =>
              new Date((a[key] as string) ?? 0).getTime() -
              new Date((b[key] as string) ?? 0).getTime(),
          },
        );
        break;
      }
    }
  }

  const searchFields = (item: TData): string[] =>
    searchableFields
      .map((key): unknown => item[key as keyof TData])
      .filter((v): v is string => typeof v === "string");

  return {
    registry: registry as FilterRegistry<TData>,
    sortDefinitions,
    searchFields,
  };
}

export function mergeWithAutoRegistry<TData extends Record<string, unknown>>(
  auto: AutoRegistryResult<TData>,
  manualRegistry: Partial<FilterRegistry<TData>>,
  manualSortDefinitions?: SortDefinition<TData>[],
  manualSearchFields?: (item: TData) => string[],
): AutoRegistryResult<TData> {
  const mergedRegistry = { ...auto.registry };

  for (const [key, dim] of Object.entries(manualRegistry)) {
    if (dim) {
      mergedRegistry[key] = dim as FilterDimension<TData>;
    }
  }

  const manualSortValues = new Set(
    (manualSortDefinitions ?? []).map((s) => s.value),
  );
  const manualCategories = new Set(
    (manualSortDefinitions ?? []).map((s) => s.category),
  );

  const filteredAutoSorts = auto.sortDefinitions.filter(
    (s) => !manualSortValues.has(s.value) && !manualCategories.has(s.category),
  );

  return {
    registry: mergedRegistry as FilterRegistry<TData>,
    sortDefinitions: [
      ...(manualSortDefinitions ?? []),
      ...filteredAutoSorts,
    ],
    searchFields: manualSearchFields ?? auto.searchFields,
  };
}
