import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, LayoutGrid, LayoutList } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ListItemDisplay {
  title: string;
  subtitle?: string;
  meta?: string;
  image?: string;
  badge?: string;
}

interface ListViewProps<T> {
  items: T[];
  renderItem: (item: T) => ListItemDisplay;
  searchField?: keyof T & string;
  searchPlaceholder?: string;
  groupBy?: keyof T & string;
  onSelect?: (item: T) => void;
  layout?: "list" | "grid";
  selectable?: boolean;
}

export function ListView<T>({
  items,
  renderItem,
  searchField,
  searchPlaceholder = "Search...",
  groupBy,
  onSelect,
  layout: initialLayout = "list",
}: ListViewProps<T>) {
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState(initialLayout);

  const filtered = useMemo(() => {
    if (!search || !searchField) return items;
    const lower = search.toLowerCase();
    return items.filter((item) => {
      const value = String(item[searchField] ?? "");
      return value.toLowerCase().includes(lower);
    });
  }, [items, search, searchField]);

  const grouped = useMemo(() => {
    if (!groupBy) return new Map([["", filtered]]);
    const groups = new Map<string, T[]>();
    for (const item of filtered) {
      const key = String(item[groupBy] ?? "Uncategorized");
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    return groups;
  }, [filtered, groupBy]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {searchField && (
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
        <div className="ml-auto flex gap-1">
          <Button
            variant={layout === "list" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setLayout("list")}
          >
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button
            variant={layout === "grid" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setLayout("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {Array.from(grouped.entries()).map(([groupName, groupItems]) => (
        <div key={groupName}>
          {groupBy && groupName && (
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {groupName}
            </h3>
          )}
          <div
            className={cn(
              layout === "grid"
                ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                : "flex flex-col gap-1",
            )}
          >
            {groupItems.map((item, index) => {
              const display = renderItem(item);
              return (
                <ListItem
                  key={index}
                  display={display}
                  layout={layout}
                  onClick={onSelect ? () => onSelect(item) : undefined}
                />
              );
            })}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No items found.</p>
      )}
    </div>
  );
}

function ListItem({
  display,
  layout,
  onClick,
}: {
  display: ListItemDisplay;
  layout: "list" | "grid";
  onClick?: () => void;
}) {
  if (layout === "grid") {
    return (
      <div
        onClick={onClick}
        className={cn(
          "group rounded-lg border bg-card p-3 transition-colors",
          onClick && "cursor-pointer hover:bg-accent",
        )}
      >
        {display.image && (
          <div className="mb-2 aspect-square overflow-hidden rounded-md bg-muted">
            <img src={display.image} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <p className="font-medium text-sm truncate">{display.title}</p>
        {display.subtitle && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{display.subtitle}</p>
        )}
        <div className="mt-1 flex items-center gap-2">
          {display.meta && <span className="text-xs text-muted-foreground">{display.meta}</span>}
          {display.badge && <Badge variant="secondary" className="text-xs">{display.badge}</Badge>}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
        onClick && "cursor-pointer hover:bg-accent",
      )}
    >
      {display.image && (
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
          <img src={display.image} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm truncate">{display.title}</p>
        {display.subtitle && (
          <p className="text-xs text-muted-foreground truncate">{display.subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {display.meta && <span className="text-xs text-muted-foreground">{display.meta}</span>}
        {display.badge && <Badge variant="secondary" className="text-xs">{display.badge}</Badge>}
      </div>
    </div>
  );
}
