import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { useState, useMemo, useCallback } from "react";
import { z } from "zod";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RepoActions } from "@/components/repo-actions";
import { RepoDetailSheet } from "@/components/repo-detail-sheet";
import {
  repoCollection,
  listCollection,
  listItemCollection,
  type Repo,
} from "@/lib/collections";
import {
  FilterProvider,
  DataTable,
  DataTableToolbar,
  parseUrlToViewState,
  serializeViewStateToUrl,
  type ViewState,
} from "@/components/views/data-table";
import { createRepoColumns } from "@/components/repo-table/columns";
import { RepoBulkActions } from "@/components/repo-table/bulk-actions";
import {
  buildRepoRegistry,
  DEFAULT_SORT,
  DEFAULT_GROUP_BY,
  repoSearchFields,
} from "@/components/repo-table/registry";

const searchSchema = z.object({
  sort: z.string().optional(),
  group: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().optional(),
  language: z.string().optional(),
  archived: z.string().optional(),
  healthMin: z.coerce.number().optional(),
  healthMax: z.coerce.number().optional(),
  starsMin: z.coerce.number().optional(),
  starsMax: z.coerce.number().optional(),
  topics: z.string().optional(),
});

export const Route = createFileRoute("/")({
  component: AllStarsPage,
  validateSearch: searchSchema,
});

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function AllStarsPage() {
  const navigate = Route.useNavigate();
  const searchParams = Route.useSearch();

  const { data: repos } = useLiveQuery((q) =>
    q.from({ repoCollection }).select(({ repoCollection }) => repoCollection),
  );
  const { data: lists } = useLiveQuery((q) =>
    q.from({ listCollection }).select(({ listCollection }) => listCollection),
  );
  const { data: listItems } = useLiveQuery((q) =>
    q
      .from({ listItemCollection })
      .select(({ listItemCollection }) => listItemCollection),
  );

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [detailRepo, setDetailRepo] = useState<Repo | null>(null);

  const allRepos = repos ?? [];

  const { registry, sortDefinitions } = useMemo(
    () => buildRepoRegistry(allRepos),
    [allRepos],
  );

  const viewState = useMemo(
    () =>
      parseUrlToViewState<Repo, string>(
        searchParams as Record<string, string | number | undefined>,
        registry,
        DEFAULT_SORT,
        DEFAULT_GROUP_BY,
      ),
    [searchParams, registry],
  );

  const handleViewStateChange = useCallback(
    (newState: ViewState<string>) => {
      const params = serializeViewStateToUrl(
        newState,
        registry,
        DEFAULT_SORT,
        DEFAULT_GROUP_BY,
      );
      navigate({ search: params as Record<string, string>, replace: true });
    },
    [navigate, registry],
  );

  async function handleImport() {
    setImporting(true);
    setProgress("Importing stars from GitHub...");
    try {
      const response = await fetch(`${API_URL}/api/import-stars`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      let job = await response.json();
      if (!response.ok) throw new Error(job.error ?? "Import failed");
      // The server imports in the background; poll until it settles.
      while (job.status === "running") {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        job = await (await fetch(`${API_URL}/api/import-stars`)).json();
        if (job.status === "running") setProgress(`Importing... ${job.imported} repos read`);
      }
      if (job.status === "error") throw new Error(job.error ?? "Import failed");
      setProgress(`Checked ${job.imported} repos and ${job.lists} lists.`);
    } catch (error) {
      setProgress(
        `Error: ${error instanceof Error ? error.message : "Unknown"}`,
      );
    } finally {
      setImporting(false);
    }
  }

  const columns = useMemo(
    () =>
      createRepoColumns({
        selectable: true,
        onPreview: (repo) => setDetailRepo(repo),
        renderActions: (repo) => (
          <RepoActions repo={repo}>
            <RepoActions.AddToList
              repo={repo}
              lists={lists ?? []}
              listItems={listItems ?? []}
            />
            <RepoActions.Rate repo={repo} />
            <RepoActions.Separator />
            <RepoActions.OpenOnGithub url={repo.url} />
            <RepoActions.CopyUrl url={repo.url} />
            <RepoActions.Separator />
            <RepoActions.Unstar repo={repo} />
          </RepoActions>
        ),
      }),
    [lists, listItems],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            All Stars
          </h1>
          <p className="text-sm text-muted-foreground">
            {allRepos.length} starred repositories
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
          <Button onClick={handleImport} disabled={importing}>
            <Download className="mr-2 h-4 w-4" />
            {importing ? "Importing..." : "Import Stars"}
          </Button>
        </div>
      </div>

      <FilterProvider<Repo, string>
        items={allRepos}
        registry={registry}
        sortDefinitions={sortDefinitions}
        defaultSort={DEFAULT_SORT}
        defaultGroupBy={DEFAULT_GROUP_BY}
        viewState={viewState}
        onViewStateChange={handleViewStateChange}
        searchFields={repoSearchFields}
      >
        <DataTable
          columns={columns}
          getRowId={(repo) => repo.id}
          toolbar={<DataTableToolbar />}
          renderBulkActions={(selectedRepos, clearSelection) => (
            <RepoBulkActions
              selectedRepos={selectedRepos}
              lists={lists ?? []}
              listItems={listItems ?? []}
              clearSelection={clearSelection}
            />
          )}
        />
      </FilterProvider>

      <RepoDetailSheet
        repo={detailRepo}
        lists={lists ?? []}
        listItems={listItems ?? []}
        open={detailRepo !== null}
        onOpenChange={(open) => {
          if (!open) setDetailRepo(null);
        }}
      />
    </div>
  );
}
