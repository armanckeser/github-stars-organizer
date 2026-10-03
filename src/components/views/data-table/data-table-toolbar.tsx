import { useRef } from "react";
import { Filter, Search, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { cn } from "@/lib/utils";
import { useFilter } from "./filter-context";
import { useColumnVisibility } from "./column-visibility-context";
import { FilterPanel } from "./filter-sheet";

export function DataTableToolbar() {
  const { viewState, updateSearchQuery, filteredCount, activeFilterCount } =
    useFilter();
  const columnVisibility = useColumnVisibility();

  return (
    <div className="flex items-center gap-2 md:gap-3">
      <FilterPopover activeFilterCount={activeFilterCount} />
      <SearchInput
        value={viewState.searchQuery}
        onChange={updateSearchQuery}
      />
      <ItemCount
        filteredCount={filteredCount}
        activeFilterCount={activeFilterCount}
      />
      {columnVisibility && (
        <ColumnsDropdown columns={columnVisibility.columns} />
      )}
    </div>
  );
}

function FilterPopover({ activeFilterCount }: { activeFilterCount: number }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="relative h-10 min-w-10 md:h-7 md:min-w-0" aria-label="Filters" />
        }
      >
        <Filter className="h-4 w-4" />
        {activeFilterCount > 0 && (
          <Badge
            variant="secondary"
            className="ml-2 h-5 min-w-5 rounded-full px-1.5 text-xs"
          >
            {activeFilterCount}
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[70dvh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain p-3">
        <FilterPanel />
      </PopoverContent>
    </Popover>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = () => {
    onChange("");
    inputRef.current?.focus();
  };

  return (
    <div className="relative flex-1">
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 pl-8 md:h-8 md:text-sm"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2 p-0 hover:bg-transparent"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}

function ItemCount({
  filteredCount,
  activeFilterCount,
}: {
  filteredCount: number;
  activeFilterCount: number;
}) {
  return (
    <span className={cn("shrink-0 text-sm tabular-nums text-muted-foreground", activeFilterCount === 0 && "hidden md:inline")}>
      {activeFilterCount > 0
        ? `${filteredCount} found`
        : `${filteredCount} repos`}
    </span>
  );
}

function ColumnsDropdown({
  columns,
}: {
  columns: Array<{
    id: string;
    canHide: boolean;
    isVisible: boolean;
    toggleVisibility: (value: boolean) => void;
  }>;
}) {
  const hideableColumns = columns.filter((col) => col.canHide);
  if (hideableColumns.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="hidden md:inline-flex" />}>
        <SlidersHorizontal className="mr-2 h-4 w-4" />
        Columns
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hideableColumns.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.id}
            className="capitalize"
            checked={col.isVisible}
            onCheckedChange={(value) => col.toggleVisibility(!!value)}
          >
            {col.id}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
