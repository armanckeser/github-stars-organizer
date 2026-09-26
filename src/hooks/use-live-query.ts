import { useLiveQuery as usePGliteLiveQuery } from "@electric-sql/pglite-react";

export function useLiveQuery<T = Record<string, unknown>>(
  query: string,
  params?: unknown[],
) {
  const result = usePGliteLiveQuery(query, params);
  return {
    data: result?.rows as T[] | undefined,
    loading: result === undefined,
  };
}
