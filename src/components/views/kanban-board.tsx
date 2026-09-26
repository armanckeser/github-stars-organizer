import { useState, useMemo, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ColumnConfig {
  id: string;
  title: string;
  color?: string;
}

interface KanbanBoardProps<T extends Record<string, unknown>> {
  items: T[];
  columns: ColumnConfig[];
  statusField: keyof T & string;
  onMove: (itemId: number | string, newStatus: string) => Promise<void>;
  renderCard: (item: T) => ReactNode;
  getId?: (item: T) => string | number;
}

export function KanbanBoard<T extends Record<string, unknown>>({
  items,
  columns,
  statusField,
  onMove,
  renderCard,
  getId = (item) => item.id as number,
}: KanbanBoardProps<T>) {
  const [activeId, setActiveId] = useState<string | number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const itemsByColumn = useMemo(() => {
    const grouped = new Map<string, T[]>();
    for (const col of columns) {
      grouped.set(col.id, []);
    }
    for (const item of items) {
      const status = String(item[statusField]);
      const list = grouped.get(status);
      if (list) list.push(item);
    }
    return grouped;
  }, [items, columns, statusField]);

  const activeItem = useMemo(
    () => items.find((item) => String(getId(item)) === String(activeId)),
    [activeId, items, getId],
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeItemData = items.find((i) => String(getId(i)) === String(active.id));
    if (!activeItemData) return;

    const currentStatus = String(activeItemData[statusField]);
    const overId = String(over.id);

    const isOverColumn = columns.some((c) => c.id === overId);
    const targetStatus = isOverColumn
      ? overId
      : (() => {
          const overItem = items.find((i) => String(getId(i)) === overId);
          return overItem ? String(overItem[statusField]) : currentStatus;
        })();

    if (targetStatus !== currentStatus) {
      await onMove(getId(activeItemData), targetStatus);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => {
          const columnItems = itemsByColumn.get(column.id) ?? [];
          const itemIds = columnItems.map((item) => String(getId(item)));
          return (
            <KanbanColumn key={column.id} column={column} count={columnItems.length}>
              <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2 min-h-[100px]">
                  {columnItems.map((item) => (
                    <KanbanCard key={String(getId(item))} id={String(getId(item))}>
                      {renderCard(item)}
                    </KanbanCard>
                  ))}
                </div>
              </SortableContext>
            </KanbanColumn>
          );
        })}
      </div>

      {createPortal(
        <DragOverlay>
          {activeItem ? (
            <div className="rounded-lg border bg-card p-3 shadow-lg opacity-90">
              {renderCard(activeItem)}
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

function KanbanColumn({
  column,
  count,
  children,
}: {
  column: ColumnConfig;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/50 p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{column.title}</h3>
        <Badge variant="secondary" className="text-xs">
          {count}
        </Badge>
      </div>
      {children}
    </div>
  );
}

function KanbanCard({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({
      id,
      data: { type: "Card" },
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing transition-opacity",
        isDragging && "opacity-50",
      )}
    >
      {children}
    </div>
  );
}
