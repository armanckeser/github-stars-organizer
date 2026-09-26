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
import { ChevronLeft, ChevronRight, X } from "lucide-react";
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
import { useFilter } from "./filter-context";
import { ColumnVisibilityContext } from "./column-visibility-context";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  pageSize?: number;
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData) => string;
  renderBulkActions?: (selectedRows: TData[], clearSelection: () => void) => ReactNode;
  toolbar?: ReactNode;
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
}: DataTableProps<TData, TValue>) {
  const { filteredItems, groupedItems, viewState, updatePage } = useFilter<TData>();
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

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
    <div className="space-y-4">
      {selectedRows.length > 0 && renderBulkActions && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2">
          <span className="text-sm font-medium">
            {selectedRows.length} selected
          </span>
          {!table.getIsAllRowsSelected() && (
            <Button
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs"
              onClick={() => table.toggleAllRowsSelected(true)}
            >
              Select all {table.getFilteredRowModel().rows.length} filtered
            </Button>
          )}
          <div className="flex items-center gap-1">
            {renderBulkActions(selectedRows, clearSelection)}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            className="ml-auto"
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      )}

      {toolbar}

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

      {!isGrouped && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {selectedRows.length > 0
              ? `${selectedRows.length} of ${table.getFilteredRowModel().rows.length} row(s) selected`
              : `${table.getFilteredRowModel().rows.length} row(s)`}
          </p>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </p>
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
    </ColumnVisibilityContext.Provider>
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
