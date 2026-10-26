import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { useState, useMemo, useCallback, useEffect } from "react";
import { z } from "zod";
import { ChevronDown, Download } from "lucide-react";
import { DEMO } from "@/lib/demo";
import { APP_MODE } from "@/lib/mode";
import { importFromGitHub, scoreHealth } from "@/lib/local-sync";
import { DemoUserForm } from "@/components/demo-user-form";
import { AstralImportDialog } from "@/components/astral-import-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { RepoMobileRow } from "@/components/repo-table/mobile-row";
import { useIsDesktop } from "@/hooks/use-media-query";
import { AgentTip, TokenTip } from "@/components/header-tips";
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
  freshness: z.string().optional(),
  lists: z.string().optional(),
});

export const Route = createFileRoute("/")({
  component: AllStarsPage,
  validateSearch: searchSchema,
});

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

let launchImportStarted = false;

class MissingTokenError extends Error {}

// GitHub ticks the scopes from the link; the token's name is typed by hand.
const NEW_TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo";

async function importFromServer(setProgress: (text: string) => void) {
  setProgress("Importing stars from GitHub...");
  const response = await fetch(`${API_URL}/api/import-stars`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  let job = await response.json();
  if (!response.ok && job.code === "no_token") throw new MissingTokenError();
  if (!response.ok) throw new Error(job.error ?? "Import failed");
  // The server imports in the background; poll until it settles.
  while (job.status === "running") {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    job = await (await fetch(`${API_URL}/api/import-stars`)).json();
    if (job.status === "running") setProgress(`Importing... ${job.imported} repos read`);
  }
  if (job.status === "error") throw new Error(job.error ?? "Import failed");
  setProgress(`Checked ${job.imported} repos and ${job.lists} lists.`);
}

async function importLocal(setProgress: (text: string) => void) {
  setProgress("Reading your stars and Lists from GitHub...");
  const { stars, lists } = await importFromGitHub();
  const read = `Read ${stars} stars and ${lists} lists.`;
  setProgress(read);
  const health = await scoreHealth("missing", ({ scored, total }) => setProgress(`${read} Scoring health ${scored}/${total}...`));
  if (health.total > 0) setProgress(`${read} Scored ${health.scored} repos.`);
}

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
  const [astralOpen, setAstralOpen] = useState(false);
  const [progress, setProgress] = useState("");
  const [needsToken, setNeedsToken] = useState(false);
  const [detailRepo, setDetailRepo] = useState<Repo | null>(null);
  const isDesktop = useIsDesktop();

  const allRepos = repos ?? [];

  const listIdsByRepo = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const li of listItems ?? []) {
      const ids = map.get(li.repo_id) ?? [];
      ids.push(li.list_id);
      map.set(li.repo_id, ids);
    }
    return map;
  }, [listItems]);

  const { registry, sortDefinitions } = useMemo(
    () => buildRepoRegistry(allRepos, { lists: lists ?? [], listIdsByRepo }),
    [allRepos, lists, listIdsByRepo],
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
    setNeedsToken(false);
    try {
      await (APP_MODE === "local" ? importLocal(setProgress) : importFromServer(setProgress));
    } catch (error) {
      if (error instanceof MissingTokenError) {
        setProgress("");
        setNeedsToken(true);
        return;
      }
      setProgress(
        `Error: ${error instanceof Error ? error.message : "Unknown"}`,
      );
    } finally {
      setImporting(false);
    }
  }

  // The npx build opens already up to date: it reads GitHub once per launch.
  useEffect(() => {
    if (APP_MODE !== "local" || launchImportStarted) return;
    launchImportStarted = true;
    void handleImport();
  }, []);

  const renderActions = useCallback(
    (repo: Repo) => (
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
    [lists, listItems],
  );

  const columns = useMemo(
    () =>
      createRepoColumns({
        selectable: true,
        onPreview: (repo) => setDetailRepo(repo),
        renderActions,
      }),
    [renderActions],
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
        {DEMO ? (
          <div className="flex items-start gap-2">
            <AgentTip />
            <DemoUserForm />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
            {needsToken && (
              <span className="text-xs text-muted-foreground">
                Needs a GitHub token.{" "}
                <a href={NEW_TOKEN_URL} target="_blank" rel="noopener" className="font-medium text-primary underline-offset-4 hover:underline">
                  Create one
                </a>{" "}
                (classic, repo scope), set it as GITHUB_TOKEN in the app's settings, and restart the app.
              </span>
            )}
            <AgentTip />
            <TokenTip />
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button disabled={importing} />}>
                <Download className="mr-2 h-4 w-4" />
                {importing ? "Importing..." : "Import Stars"}
                <ChevronDown className="ml-1 h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-48">
                <DropdownMenuItem onClick={handleImport}>From GitHub</DropdownMenuItem>
                {/* Astral tags attach to starred repos, so there is nothing to attach them to before a GitHub import. */}
                <DropdownMenuItem disabled={allRepos.length === 0} onClick={() => setAstralOpen(true)}>
                  From an Astral export
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {astralOpen && (
              <AstralImportDialog
                stored={{ repos: allRepos, lists: lists ?? [], list_items: listItems ?? [] }}
                onClose={() => setAstralOpen(false)}
              />
            )}
          </div>
        )}
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
          onRowClick={isDesktop ? undefined : setDetailRepo}
          renderMobileRow={(repo, state) => (
            <RepoMobileRow repo={repo} state={state} actions={renderActions(repo)} />
          )}
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
