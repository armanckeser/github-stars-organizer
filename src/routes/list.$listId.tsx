import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { useState, useMemo, useCallback } from "react";
import { z } from "zod";
import { Trash2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RepoActions } from "@/components/repo-actions";
import { RepoDetailSheet } from "@/components/repo-detail-sheet";
import {
  listCollection,
  listItemCollection,
  repoCollection,
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

export const Route = createFileRoute("/list/$listId")({
  component: ListDetailPage,
  validateSearch: searchSchema,
});

function ListDetailPage() {
  const { listId } = Route.useParams();
  const navigate = useNavigate();
  const searchParams = Route.useSearch();

  const { data: lists } = useLiveQuery((q) =>
    q.from({ listCollection }).select(({ listCollection }) => listCollection),
  );
  const { data: listItems } = useLiveQuery((q) =>
    q
      .from({ listItemCollection })
      .select(({ listItemCollection }) => listItemCollection),
  );
  const { data: allRepos } = useLiveQuery((q) =>
    q.from({ repoCollection }).select(({ repoCollection }) => repoCollection),
  );

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [detailRepo, setDetailRepo] = useState<Repo | null>(null);
  const isDesktop = useIsDesktop();

  const list = (lists ?? []).find((l) => l.id === listId);

  const allListItems = listItems ?? [];
  const itemsInList = allListItems.filter((li) => li.list_id === listId);
  const repoIds = new Set(itemsInList.map((li) => li.repo_id));
  const repos = (allRepos ?? []).filter((r) => repoIds.has(r.id));

  const listItemIdByRepoId = useMemo(() => {
    const map = new Map<string, string>();
    for (const li of itemsInList) {
      map.set(li.repo_id, li.id);
    }
    return map;
  }, [itemsInList]);

  const { registry, sortDefinitions } = useMemo(
    () => buildRepoRegistry(repos),
    [repos],
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
      navigate({
        to: "/list/$listId",
        params: { listId },
        search: params as Record<string, string>,
        replace: true,
      });
    },
    [navigate, listId, registry],
  );

  if (!list)
    return <p className="p-8 text-muted-foreground">List not found</p>;

  function startEditing() {
    setEditName(list!.name);
    setEditDesc(list!.description ?? "");
    setEditing(true);
  }

  function saveEdit() {
    listCollection.update(list!.id, (draft) => {
      draft.name = editName;
      draft.description = editDesc || null;
      draft.updated_at = new Date().toISOString();
    });
    setEditing(false);
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${list!.name}" here and on GitHub? The repos stay starred.`)) return;
    listCollection.delete(list!.id);
    navigate({ to: "/" });
  }

  const renderActions = (repo: Repo) => (
    <RepoActions repo={repo}>
      {listItemIdByRepoId.get(repo.id) && (
        <RepoActions.RemoveFromList
          listItemId={listItemIdByRepoId.get(repo.id)!}
        />
      )}
      <RepoActions.AddToList
        repo={repo}
        lists={lists ?? []}
        listItems={allListItems}
      />
      <RepoActions.Rate repo={repo} />
      <RepoActions.Separator />
      <RepoActions.OpenOnGithub url={repo.url} />
      <RepoActions.CopyUrl url={repo.url} />
      <RepoActions.Separator />
      <RepoActions.Unstar repo={repo} />
    </RepoActions>
  );

  const columns = createRepoColumns({
    selectable: true,
    onPreview: (repo) => setDetailRepo(repo),
    renderActions,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        {editing ? (
          <div className="mr-4 flex-1 space-y-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="font-display text-2xl font-bold"
              autoFocus
            />
            <Textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Description"
              className="min-h-16 text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit}>
                <Check className="mr-1 h-3 w-3" />
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                <X className="mr-1 h-3 w-3" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {list.name}
            </h1>
            {list.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {list.description}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {repos.length} repos
            </p>
          </div>
        )}
        {!editing && (
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon-lg" aria-label="Edit list" title="Edit list" onClick={startEditing}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-lg" aria-label="Delete list" title="Delete list" className="text-destructive hover:text-destructive" onClick={handleDelete}>
              <Trash2 />
            </Button>
          </div>
        )}
      </div>

      <FilterProvider<Repo, string>
        items={repos}
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
              listItems={allListItems}
              listId={listId}
              clearSelection={clearSelection}
            />
          )}
        />
      </FilterProvider>

      <RepoDetailSheet
        repo={detailRepo}
        lists={lists ?? []}
        listItems={allListItems}
        open={detailRepo !== null}
        onOpenChange={(open) => {
          if (!open) setDetailRepo(null);
        }}
      />
    </div>
  );
}
