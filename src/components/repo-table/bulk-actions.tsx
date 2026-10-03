import type { ComponentProps } from "react";
import { ListMinus, ListPlus, Star, StarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  repoCollection,
  listItemCollection,
  type Repo,
  type StarList,
  type ListItem,
} from "@/lib/collections";
import { DEMO } from "@/lib/demo";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

interface RepoBulkActionsProps {
  selectedRepos: Repo[];
  lists: StarList[];
  listItems: ListItem[];
  listId?: string;
  clearSelection: () => void;
}

export function RepoBulkActions({
  selectedRepos,
  lists,
  listItems,
  listId,
  clearSelection,
}: RepoBulkActionsProps) {
  return (
    <>
      <BulkAddToList
        selectedRepos={selectedRepos}
        lists={lists}
        listItems={listItems}
        clearSelection={clearSelection}
      />
      {listId && (
        <BulkRemoveFromList
          selectedRepos={selectedRepos}
          listId={listId}
          listItems={listItems}
          clearSelection={clearSelection}
        />
      )}
      <BulkRate selectedRepos={selectedRepos} clearSelection={clearSelection} />
      <BulkUnstar
        selectedRepos={selectedRepos}
        clearSelection={clearSelection}
      />
    </>
  );
}

function BulkAddToList({
  selectedRepos,
  lists,
  listItems,
  clearSelection,
}: {
  selectedRepos: Repo[];
  lists: StarList[];
  listItems: ListItem[];
  clearSelection: () => void;
}) {
  async function handleAddToList(list: StarList) {
    const existingRepoIds = new Set(
      listItems
        .filter((li) => li.list_id === list.id)
        .map((li) => li.repo_id),
    );

    const reposToAdd = selectedRepos.filter(
      (repo) => !existingRepoIds.has(repo.id),
    );

    for (const repo of reposToAdd) {
      if (DEMO) {
        listItemCollection.insert({ id: crypto.randomUUID(), list_id: list.id, repo_id: repo.id, position: 0, added_at: new Date().toISOString() });
        continue;
      }
      await fetch(`${API_URL}/api/lists/${list.id}/add-repo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_id: repo.id }),
      });
    }

    clearSelection();
  }

  if (lists.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<BarButton aria-label="Add to list" title="Add to list" />}>
        <ListPlus />
        <span className="hidden sm:inline">Add to list</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center" sideOffset={10} className="w-auto min-w-48">
        {lists.map((list) => (
          <DropdownMenuCheckboxItem
            key={list.id}
            onClick={() => handleAddToList(list)}
          >
            {list.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkRate({
  selectedRepos,
  clearSelection,
}: {
  selectedRepos: Repo[];
  clearSelection: () => void;
}) {
  function handleRate(rating: number | null) {
    for (const repo of selectedRepos) {
      repoCollection.update(repo.id, (draft) => {
        draft.usefulness_rating = rating;
      });
    }
    clearSelection();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<BarButton aria-label="Rate" title="Rate" />}>
        <Star />
        <span className="hidden sm:inline">Rate</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center" sideOffset={10} className="w-auto min-w-48">
        {[1, 2, 3, 4, 5].map((rating) => (
          <DropdownMenuCheckboxItem
            key={rating}
            onClick={() => handleRate(rating)}
          >
            {"★".repeat(rating)}{"☆".repeat(5 - rating)}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem onClick={() => handleRate(null)}>
          Clear rating
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkRemoveFromList({
  selectedRepos,
  listId,
  listItems,
  clearSelection,
}: {
  selectedRepos: Repo[];
  listId: string;
  listItems: ListItem[];
  clearSelection: () => void;
}) {
  function handleRemove() {
    for (const repo of selectedRepos) {
      const listItem = listItems.find(
        (li) => li.repo_id === repo.id && li.list_id === listId,
      );
      if (listItem) {
        listItemCollection.delete(listItem.id);
      }
    }
    clearSelection();
  }

  return (
    <BarButton aria-label="Remove from list" title="Remove from list" onClick={handleRemove}>
      <ListMinus />
      <span className="hidden sm:inline">Remove</span>
    </BarButton>
  );
}

function BulkUnstar({
  selectedRepos,
  clearSelection,
}: {
  selectedRepos: Repo[];
  clearSelection: () => void;
}) {
  async function handleUnstar() {
    const count = selectedRepos.length;
    if (!window.confirm(`Unstar ${count} ${count === 1 ? "repo" : "repos"} on GitHub?`)) return;
    for (const repo of selectedRepos) {
      if (DEMO) {
        repoCollection.delete(repo.id);
        continue;
      }
      await fetch(`${API_URL}/api/repos/${repo.id}/unstar`, {
        method: "POST",
      });
    }
    clearSelection();
  }

  return (
    <BarButton aria-label="Unstar" title="Unstar" className="text-destructive hover:text-destructive" onClick={handleUnstar}>
      <StarOff />
      <span className="hidden sm:inline">Unstar</span>
    </BarButton>
  );
}

// Icon-only in the floating bar on a phone; the label comes back once there is room for it.
function BarButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button variant="ghost" className={cn("h-10 min-w-10 gap-1.5 px-2.5 sm:px-3", className)} {...props} />;
}
