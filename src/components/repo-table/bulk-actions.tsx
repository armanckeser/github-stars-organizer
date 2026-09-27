import { ListPlus, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <ListPlus className="mr-1 h-3.5 w-3.5" />
        Add to list
      </DropdownMenuTrigger>
      <DropdownMenuContent>
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
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Star className="mr-1 h-3.5 w-3.5" />
        Rate
      </DropdownMenuTrigger>
      <DropdownMenuContent>
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
    <Button variant="outline" size="sm" onClick={handleRemove}>
      <X className="mr-1 h-3.5 w-3.5" />
      Remove from list
    </Button>
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
      await fetch(`${API_URL}/api/repos/${repo.id}/unstar`, {
        method: "POST",
      });
    }
    clearSelection();
  }

  return (
    <Button variant="destructive" size="sm" onClick={handleUnstar}>
      <Trash2 className="mr-1 h-3.5 w-3.5" />
      Unstar
    </Button>
  );
}
