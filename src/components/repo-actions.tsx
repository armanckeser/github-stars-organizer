import { type ReactNode } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
  DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, ListPlus, ExternalLink, Trash2, Eye, Link2, X, Star } from "lucide-react";
import { listItemCollection, repoCollection, type Repo, type StarList, type ListItem } from "@/lib/collections";

interface RepoActionsProps {
  repo: Repo;
  children: ReactNode;
}

function RepoActions({ children }: RepoActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-10 md:size-7" aria-label="Actions" />}>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AddToListProps {
  repo: Repo;
  lists: StarList[];
  listItems: ListItem[];
}

function AddToList({ repo, lists, listItems }: AddToListProps) {
  if (lists.length === 0) return null;

  const repoListIds = new Set(
    listItems.filter((li) => li.repo_id === repo.id).map((li) => li.list_id),
  );

  function handleToggle(list: StarList, isInList: boolean) {
    if (isInList) {
      const item = listItems.find((li) => li.repo_id === repo.id && li.list_id === list.id);
      if (item) listItemCollection.delete(item.id);
    } else {
      listItemCollection.insert({
        id: crypto.randomUUID(),
        list_id: list.id,
        repo_id: repo.id,
        position: 0,
        added_at: new Date().toISOString(),
      });
    }
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger><ListPlus className="mr-2 h-4 w-4" />Add to list</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {lists.map((list) => {
          const isInList = repoListIds.has(list.id);
          return (
            <DropdownMenuCheckboxItem
              key={list.id}
              checked={isInList}
              onClick={() => handleToggle(list, isInList)}
            >
              {list.name}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

interface RateProps {
  repo: Repo;
}

function Rate({ repo }: RateProps) {
  function handleRate(rating: number | null) {
    repoCollection.update(repo.id, (draft) => {
      draft.usefulness_rating = rating;
    });
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger><Star className="mr-2 h-4 w-4" />Rate</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {[1, 2, 3, 4, 5].map((rating) => (
          <DropdownMenuCheckboxItem
            key={rating}
            checked={repo.usefulness_rating === rating}
            onClick={() => handleRate(rating)}
          >
            {"★".repeat(rating)}{"☆".repeat(5 - rating)}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem onClick={() => handleRate(null)}>
          Clear rating
        </DropdownMenuCheckboxItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

interface RemoveFromListProps {
  listItemId: string;
}

function RemoveFromList({ listItemId }: RemoveFromListProps) {
  return (
    <DropdownMenuItem onClick={() => listItemCollection.delete(listItemId)}>
      <X className="mr-2 h-4 w-4" />Remove from list
    </DropdownMenuItem>
  );
}

interface UnstarProps {
  repo: Repo;
}

function Unstar({ repo }: UnstarProps) {
  return (
    <DropdownMenuItem variant="destructive" onClick={() => {
      if (window.confirm(`Unstar ${repo.full_name}? Its tags, rating and notes go with it.`)) repoCollection.delete(repo.id);
    }}>
      <Trash2 className="mr-2 h-4 w-4" />Unstar
    </DropdownMenuItem>
  );
}

interface ViewDetailProps {
  onOpen: () => void;
}

function ViewDetail({ onOpen }: ViewDetailProps) {
  return (
    <DropdownMenuItem onClick={onOpen}>
      <Eye className="mr-2 h-4 w-4" />View detail
    </DropdownMenuItem>
  );
}

interface OpenOnGithubProps {
  url: string;
}

function OpenOnGithub({ url }: OpenOnGithubProps) {
  return (
    <DropdownMenuItem onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
      <ExternalLink className="mr-2 h-4 w-4" />Open on GitHub
    </DropdownMenuItem>
  );
}

interface CopyUrlProps {
  url: string;
}

function CopyUrl({ url }: CopyUrlProps) {
  return (
    <DropdownMenuItem onClick={() => navigator.clipboard.writeText(url)}>
      <Link2 className="mr-2 h-4 w-4" />Copy URL
    </DropdownMenuItem>
  );
}

RepoActions.AddToList = AddToList;
RepoActions.Rate = Rate;
RepoActions.RemoveFromList = RemoveFromList;
RepoActions.Unstar = Unstar;
RepoActions.ViewDetail = ViewDetail;
RepoActions.OpenOnGithub = OpenOnGithub;
RepoActions.CopyUrl = CopyUrl;
RepoActions.Separator = DropdownMenuSeparator;

export { RepoActions };
