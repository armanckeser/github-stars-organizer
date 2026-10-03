import {
  type ColumnDef,
  type Row,
  type RowSelectionState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { type ReactNode, useMemo, useState } from "react";
import { CheckCheck, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useFilter } from "./filter-context";
import { ColumnVisibilityContext } from "./column-visibility-context";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  pageSize?: number;
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData) => string;
  renderBulkActions?: (selectedRows: TData[], clearSelection: () => void) => ReactNode;
  toolbar?: ReactNode;
  /** Phones get a one-column list instead of the table; this draws one item of it. */
  renderMobileRow?: (row: TData, state: MobileRowState) => ReactNode;
}

export interface MobileRowState {
  selected: boolean;
  toggleSelected: () => void;
  /** Something is selected, so a tap on the row toggles it instead of opening it. */
  selecting: boolean;
}

export function createSelectColumn<TData>(): ColumnDef<TData> {
  return {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    enableHiding: false,
  };
}

type GroupHeaderMarker = { __groupHeader: true; groupId: string; label: string; count: number };

function isGroupHeader<TData>(item: TData | GroupHeaderMarker): item is GroupHeaderMarker {
  return (item as GroupHeaderMarker).__groupHeader === true;
}

export function DataTable<TData, TValue>({
  columns,
  pageSize = 20,
  onRowClick,
  getRowId,
  renderBulkActions,
  toolbar,
  renderMobileRow,
}: DataTableProps<TData, TValue>) {
  const { filteredItems, groupedItems, viewState, updatePage } = useFilter<TData>();
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const isDesktop = useIsDesktop();
  const asList = !isDesktop && renderMobileRow !== undefined;

  const isGrouped = viewState.groupBy !== "none" && groupedItems.length > 0;

  const displayItems = useMemo(() => {
    if (!isGrouped) return filteredItems;

    const items: (TData | GroupHeaderMarker)[] = [];
    for (const group of groupedItems) {
      items.push({
        __groupHeader: true,
        groupId: group.groupId,
        label: group.label,
        count: group.items.length,
      });
      items.push(...group.items);
    }
    return items;
  }, [isGrouped, filteredItems, groupedItems]);

  const dataRows = useMemo(
    () => (isGrouped ? displayItems.filter((item) => !isGroupHeader(item)) as TData[] : filteredItems),
    [isGrouped, displayItems, filteredItems],
  );

  const table = useReactTable({
    data: dataRows,
    columns,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: isGrouped ? undefined : getPaginationRowModel(),
    autoResetPageIndex: false,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      columnVisibility,
      rowSelection,
      ...(isGrouped ? {} : { pagination: { pageIndex: viewState.page, pageSize } }),
    },
    onPaginationChange: isGrouped
      ? undefined
      : (updater) => {
          const next =
            typeof updater === "function"
              ? updater({ pageIndex: viewState.page, pageSize })
              : updater;
          updatePage(next.pageIndex);
        },
  });

  const selectedRows = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original);

  const clearSelection = () => setRowSelection({});

  const visibleColumnCount = table.getVisibleFlatColumns().length;
  const filteredRowCount = table.getFilteredRowModel().rows.length;

  const columnVisibilityValue = useMemo(
    () => ({
      columns: table
        .getAllColumns()
        .map((col) => ({
          id: col.id,
          canHide: col.getCanHide(),
          isVisible: col.getIsVisible(),
          toggleVisibility: (value: boolean) => col.toggleVisibility(value),
        })),
    }),
    [table, columnVisibility],
  );

  return (
    <ColumnVisibilityContext.Provider value={columnVisibilityValue}>
    <div className={cn("space-y-4", selectedRows.length > 0 && "pb-20")}>
      {toolbar}

      {asList ? (
        <MobileList
          rows={isGrouped ? null : table.getRowModel().rows}
          groupedItems={groupedItems}
          allRows={table.getRowModel().rows}
          getRowId={getRowId}
          selecting={selectedRows.length > 0}
          onRowClick={onRowClick}
          renderRow={renderMobileRow!}
        />
      ) : (
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isGrouped ? (
              <GroupedTableBody
                groupedItems={groupedItems}
                table={table}
                columns={columns}
                visibleColumnCount={visibleColumnCount}
                onRowClick={onRowClick}
                getRowId={getRowId}
              />
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={cn(
                    row.getIsSelected() && "bg-muted/50",
                    onRowClick && "cursor-pointer",
                  )}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={visibleColumnCount}
                  className="h-24 text-center text-muted-foreground"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      )}

      {!isGrouped && table.getPageCount() > 1 && (
        <div className="flex items-center justify-center gap-1 md:justify-end">
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Previous page"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-16 text-center text-sm tabular-nums text-muted-foreground">
            {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Next page"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight />
          </Button>
        </div>
      )}

      {renderBulkActions && (
        <SelectionBar
          count={selectedRows.length}
          total={filteredRowCount}
          onSelectAll={
            table.getIsAllRowsSelected() ? undefined : () => table.toggleAllRowsSelected(true)
          }
          onClear={clearSelection}
        >
          {selectedRows.length > 0 && renderBulkActions(selectedRows, clearSelection)}
        </SelectionBar>
      )}
    </div>
    </ColumnVisibilityContext.Provider>
  );
}

// Selection actions float over the content in the thumb zone instead of
// pushing the list down, so checking a box never moves what is under your finger.
function SelectionBar({
  count,
  total,
  onSelectAll,
  onClear,
  children,
}: {
  count: number;
  total: number;
  onSelectAll?: () => void;
  onClear: () => void;
  children: ReactNode;
}) {
  const open = count > 0;
  // The bar keeps its last count and actions while it slides away.
  const [last, setLast] = useState({ count, children });
  if (open && (last.count !== count || last.children !== children)) setLast({ count, children });

  return (
    <div
      className="selection-bar pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] md:left-64"
      data-open={open || undefined}
      inert={!open}
    >
      <div
        role="toolbar"
        aria-label="Selected repos"
        className="pointer-events-auto flex max-w-full items-center gap-0.5 rounded-2xl border border-white/10 bg-popover/85 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl backdrop-saturate-150"
      >
        <Button variant="ghost" size="icon-lg" aria-label="Clear selection" onClick={onClear}>
          <X />
        </Button>
        <span className="min-w-7 px-1 text-center font-medium tabular-nums" aria-live="polite">
          {last.count}
        </span>
        {onSelectAll && (
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={`Select all ${total}`}
            title={`Select all ${total}`}
            onClick={onSelectAll}
          >
            <CheckCheck />
          </Button>
        )}
        <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
        {last.children}
      </div>
    </div>
  );
}

function MobileList<TData>({
  rows,
  groupedItems,
  allRows,
  getRowId,
  selecting,
  onRowClick,
  renderRow,
}: {
  rows: Row<TData>[] | null;
  groupedItems: { groupId: string; label: string; items: TData[] }[];
  allRows: Row<TData>[];
  getRowId?: (row: TData) => string;
  selecting: boolean;
  onRowClick?: (row: TData) => void;
  renderRow: (row: TData, state: MobileRowState) => ReactNode;
}) {
  const rowsById = useMemo(() => new Map(allRows.map((row) => [row.id, row])), [allRows]);

  function item(row: Row<TData>) {
    const selected = row.getIsSelected();
    const toggleSelected = () => row.toggleSelected(!selected);
    return (
      <li
        key={row.id}
        data-selected={selected || undefined}
        className="mobile-row"
        onClick={() => (selecting ? toggleSelected() : onRowClick?.(row.original))}
      >
        {renderRow(row.original, { selected, toggleSelected, selecting })}
      </li>
    );
  }

  if (rows) {
    if (rows.length === 0)
      return <p className="py-12 text-center text-sm text-muted-foreground">No results.</p>;
    return <ul className="-mx-4 divide-y border-y">{rows.map(item)}</ul>;
  }

  return (
    <div className="-mx-4 border-b">
      {groupedItems.map((group) => (
        <section key={group.groupId}>
          <h3 className="sticky top-0 z-10 flex items-baseline gap-2 border-y bg-background/85 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-md">
            {group.label}
            <span className="font-normal tabular-nums">{group.items.length}</span>
          </h3>
          <ul className="divide-y">
            {group.items.map((data, index) => {
              const row = rowsById.get(getRowId ? getRowId(data) : String(index));
              return row ? item(row) : null;
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function GroupedTableBody<TData, TValue>({
  groupedItems,
  table,
  visibleColumnCount,
  onRowClick,
  getRowId,
}: {
  groupedItems: { groupId: string; label: string; items: TData[] }[];
  table: ReturnType<typeof useReactTable<TData>>;
  columns: ColumnDef<TData, TValue>[];
  visibleColumnCount: number;
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData) => string;
}) {
  const allRows = table.getRowModel().rows;
  const rowsByData = useMemo(() => {
    const map = new Map<string, (typeof allRows)[number]>();
    for (const row of allRows) {
      map.set(row.id, row);
    }
    return map;
  }, [allRows]);

  return (
    <>
      {groupedItems.map((group) => (
        <GroupSection
          key={group.groupId}
          group={group}
          visibleColumnCount={visibleColumnCount}
          onRowClick={onRowClick}
          getRowId={getRowId}
          rowsByData={rowsByData}
        />
      ))}
    </>
  );
}

function GroupSection<TData>({
  group,
  visibleColumnCount,
  onRowClick,
  getRowId,
  rowsByData,
}: {
  group: { groupId: string; label: string; items: TData[] };
  visibleColumnCount: number;
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData) => string;
  rowsByData: Map<string, Row<TData>>;
}) {
  return (
    <>
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell
          colSpan={visibleColumnCount}
          className="py-2 font-medium"
        >
          {group.label}
          <span className="ml-2 text-xs text-muted-foreground">
            ({group.items.length})
          </span>
        </TableCell>
      </TableRow>
      {group.items.map((item, index) => {
        const rowId = getRowId ? getRowId(item) : String(index);
        const row = rowsByData.get(rowId);
        if (!row) return null;

        return (
          <TableRow
            key={row.id}
            data-state={row.getIsSelected() && "selected"}
            className={cn(
              row.getIsSelected() && "bg-muted/50",
              onRowClick && "cursor-pointer",
            )}
            onClick={() => onRowClick?.(row.original)}
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(
                  cell.column.columnDef.cell as never,
                  cell.getContext() as never,
                )}
              </TableCell>
            ))}
          </TableRow>
        );
      })}
    </>
  );
}
