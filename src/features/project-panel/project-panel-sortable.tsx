import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
  type PointerSensorOptions,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ProjectCard } from "@/components/project-card";
import { cn } from "@/lib/utils";
import {
  ALL_GROUP_TAB_KEY,
  type GroupTabViewModel,
  type VisibleProjectCardViewModel,
} from "./project-panel-view-models";

const LONG_PRESS_DELAY_MS = 150;
const LONG_PRESS_TOLERANCE_PX = 8;
const DRAG_ROOT_ATTRIBUTE = "data-drag-root";
const INTERACTIVE_TAG_NAMES = new Set([
  "A",
  "BUTTON",
  "INPUT",
  "LABEL",
  "OPTION",
  "SELECT",
  "TEXTAREA",
]);


function getDragActivationBlockReason(target: EventTarget | null) {
  let currentElement =
    target instanceof HTMLElement ? target : (target as Node | null)?.parentElement ?? null;

  while (currentElement) {
    if (currentElement.hasAttribute(DRAG_ROOT_ATTRIBUTE)) {
      return null;
    }

    if (currentElement.dataset.noDrag === "true") {
      return "data-no-drag";
    }

    if (currentElement.isContentEditable) {
      return "content-editable";
    }

    const role = currentElement.getAttribute("role");
    if (role === "button" || role === "link" || role === "menuitem") {
      return `interactive-role:${role}`;
    }

    if (INTERACTIVE_TAG_NAMES.has(currentElement.tagName)) {
      return `interactive-tag:${currentElement.tagName.toLowerCase()}`;
    }

    currentElement = currentElement.parentElement;
  }

  return null;
}

function isDragActivationAllowed(target: EventTarget | null) {
  const blockReason = getDragActivationBlockReason(target);
  if (blockReason) {
    return false;
  }

  return true;
}

class LongPressPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: (
        { nativeEvent }: ReactPointerEvent,
        { onActivation }: PointerSensorOptions
      ) => {
        if (!nativeEvent.isPrimary || nativeEvent.button !== 0) {
          return false;
        }

        if (!isDragActivationAllowed(nativeEvent.target)) {
          return false;
        }

        onActivation?.({ event: nativeEvent });
        return true;
      },
    },
  ];
}

function useLongPressFeedback(onComplete?: () => void) {
  const [isPressing, setIsPressing] = useState(false);
  const frameRef = useRef<number | null>(null);
  const startAtRef = useRef<number | null>(null);
  const hasCompletedRef = useRef(false);
  const progressRef = useRef(0);
  const isPressingRef = useRef(false);

  const clear = useCallback(() => {
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    startAtRef.current = null;
    hasCompletedRef.current = false;
    isPressingRef.current = false;
    progressRef.current = 0;
    setIsPressing(false);
  }, []);

  const tick = useCallback(
    (timestamp: number) => {
      if (startAtRef.current == null) {
        return;
      }

      const nextProgress = Math.min(
        (timestamp - startAtRef.current) / LONG_PRESS_DELAY_MS,
        1
      );
      progressRef.current = nextProgress;

      if (nextProgress >= 1) {
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true;
          onComplete?.();
        }
        return;
      }

      frameRef.current = window.requestAnimationFrame(tick);
    },
    [onComplete]
  );

  const handlePointerDownCapture = useCallback(
    (event: ReactPointerEvent) => {
      if (!isDragActivationAllowed(event.target)) {
        return;
      }

      clear();
      startAtRef.current = window.performance.now();
      isPressingRef.current = true;
      setIsPressing(true);
      frameRef.current = window.requestAnimationFrame(tick);
    },
    [clear, tick]
  );

  useEffect(() => () => clear(), [clear]);

  return {
    clear,
    feedbackProps: {
      onPointerCancelCapture: () => clear(),
      onPointerDownCapture: handlePointerDownCapture,
      onPointerLeave: () => clear(),
      onPointerUpCapture: () => clear(),
    },
    isPressing,
  };
}

function useBodyCursor(active: boolean) {
  useEffect(() => {
    if (!active) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";

    return () => {
      document.body.style.cursor = previousCursor;
    };
  }, [active]);
}

function getDragCursor(active: boolean) {
  return active ? "grabbing" : "pointer";
}

const restrictDragToContainer: Modifier = ({
  activeNodeRect,
  containerNodeRect,
  draggingNodeRect,
  transform,
}) => {
  const rect = draggingNodeRect ?? activeNodeRect;

  if (!rect || !containerNodeRect) {
    return transform;
  }

  const minX = containerNodeRect.left - rect.left;
  const maxX = containerNodeRect.right - rect.right;
  const minY = containerNodeRect.top - rect.top;
  const maxY = containerNodeRect.bottom - rect.bottom;

  return {
    ...transform,
    x: Math.min(Math.max(transform.x, minX), maxX),
    y: Math.min(Math.max(transform.y, minY), maxY),
  };
};

function getDragTransform(transform: ReturnType<typeof useSortable>["transform"]) {
  if (!transform) {
    return null;
  }

  return transform;
}

function getTabTransform(transform: ReturnType<typeof useSortable>["transform"]) {
  const nextTransform = getDragTransform(transform);

  if (!nextTransform) {
    return null;
  }

  return {
    ...nextTransform,
    scaleX: 1,
    scaleY: 1,
  };
}

function getSlotIndicatorStyle(
  transform: ReturnType<typeof useSortable>["transform"],
  transition?: string
) {
  if (!transform) {
    return transition ? ({ transition } satisfies CSSProperties) : undefined;
  }

  return {
    transform: CSS.Transform.toString({
      ...transform,
      x: -transform.x,
      y: -transform.y,
      scaleX: 1,
      scaleY: 1,
    }),
    transition,
  } satisfies CSSProperties;
}

function DragRipple({
  active,
  roundedClassName,
  insetOffset = 0,
  colorOverride,
  maxSpread = "8px",
}: {
  active: boolean;
  roundedClassName: string;
  insetOffset?: number;
  colorOverride?: string;
  maxSpread?: string;
}) {
  if (!active) {
    return null;
  }

  const rippleLayers = [
    { delay: "0s" },
    { delay: "0.4s" },
    { delay: "0.8s" },
    { delay: "1.2s" },
  ];

  return (
    <div className={cn("absolute inset-0 pointer-events-none z-[1]", roundedClassName)}>
      {/* Sonar Ripple Layers */}
      {rippleLayers.map((layer, index) => {
        const colorWithAlpha = colorOverride ?? `hsl(var(--primary) / 0.6)`;
        return (
          <div
            key={index}
            className={cn(
              "drag-ripple-layer absolute border",
              roundedClassName
            )}
            style={{
              inset: `${insetOffset}px`,
              animationDelay: layer.delay,
              borderColor: colorWithAlpha,
              "--drag-px": maxSpread,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

function GroupTabShell({
  actionSlot,
  active,
  count,
  dragging,
  className,
  label,
  onClick,
  surfaceStyle,
}: {
  actionSlot?: ReactNode;
  active: boolean;
  count: number;
  dragging?: boolean;
  className?: string;
  label: string;
  onClick?: () => void;
  surfaceStyle?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "relative flex-none w-fit will-change-transform",
        dragging && "z-20",
        className
      )}
      onClick={onClick}
      style={{ ...surfaceStyle, cursor: getDragCursor(Boolean(dragging)) }}
    >
      <div
        className={cn(
          "flex h-9 items-center gap-2 rounded-xl border px-3 text-sm transition-colors",
          active
            ? "border-primary/30 bg-primary text-black"
            : "border-border/25 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
          dragging && "shadow-[0_10px_24px_rgba(0,0,0,0.4)]"
        )}
      >
        <span className="whitespace-nowrap">{label}</span>
        <span className="text-[11px] opacity-75">{count}</span>
        {actionSlot}
      </div>
      {dragging && (
        <div 
          className="absolute inset-[-2px] rounded-[14px] border-2 pointer-events-none z-20" 
          style={{ borderColor: '#ffffff' }}
        />
      )}
    </div>
  );
}

function SortableGroupTabItem({
  active,
  count,
  id,
  isAssignLocked,
  label,
  onAssign,
  onDelete,
  onRename,
  onSelect,
  showActions,
}: {
  active: boolean;
  count: number;
  id: string;
  isAssignLocked: boolean;
  label: string;
  onAssign: () => void;
  onDelete: () => void;
  onRename: () => void;
  onSelect: () => void;
  showActions: boolean;
  activeId: string | null;
}) {
  const sortable = useSortable({ id });
  const longPress = useLongPressFeedback();
  useBodyCursor(longPress.isPressing || sortable.isDragging);

  useEffect(() => {
    if (sortable.isDragging) {
      longPress.clear();
    }
  }, [longPress, sortable.isDragging]);

  const surfaceStyle = {
    transform: CSS.Transform.toString(
      sortable.isDragging ? null : getTabTransform(sortable.transform)
    ),
    transition: sortable.transition,
    cursor: getDragCursor(sortable.isDragging),
  } satisfies CSSProperties;
  return (
    <div
      ref={sortable.setNodeRef}
      {...sortable.attributes}
      {...sortable.listeners}
      {...longPress.feedbackProps}
      data-drag-root="true"
      className={cn(
        "relative flex-none w-fit select-none overflow-visible py-1",
        sortable.isDragging && "cursor-grabbing"
      )}
      style={{ cursor: getDragCursor(sortable.isDragging) }}
    >
      <GroupTabShell
        active={active}
        count={count}
        dragging={false}
        label={label}
        onClick={onSelect}
        surfaceStyle={sortable.isDragging ? undefined : surfaceStyle}
        className={cn(sortable.isDragging && "invisible")}
        actionSlot={
          showActions ? (
            <div className="ml-1 flex items-center gap-1 overflow-hidden border-l border-black/15 pl-2 text-black">
              <button
                type="button"
                tabIndex={-1}
                className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] hover:bg-black/10"
                onClick={(event) => {
                  event.stopPropagation();
                  onAssign();
                }}
                disabled={isAssignLocked}
              >
                <Plus className="size-3.5" />
              </button>
              <button
                type="button"
                tabIndex={-1}
                className="inline-flex size-6 items-center justify-center rounded-md hover:bg-black/10"
                onClick={(event) => {
                  event.stopPropagation();
                  onRename();
                }}
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                tabIndex={-1}
                className="inline-flex size-6 items-center justify-center rounded-md hover:bg-black/10"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ) : null
        }
      />
    </div>
  );
}

function StaticGroupTabItem({
  active,
  count,
  label,
  onSelect,
}: {
  active: boolean;
  count: number;
  label: string;
  onSelect: () => void;
}) {
  return (
    <div
      className="relative flex-none w-fit"
      onClick={onSelect}
      style={{ cursor: 'pointer' }}
    >
      <div
        className={cn(
          "flex h-9 items-center gap-2 rounded-xl border px-3 text-sm transition-colors",
          active
            ? "border-primary/30 bg-primary text-black"
            : "border-border/25 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
        )}
      >
        <span className="whitespace-nowrap">{label}</span>
        <span className="text-[11px] opacity-75">{count}</span>
      </div>
    </div>
  );
}

function NonSortableGroupTabItem({
  active,
  count,
  label,
  onSelect,
  showActions,
  isAssignLocked,
  onAssign,
  onRename,
  onDelete,
}: {
  active: boolean;
  count: number;
  label: string;
  onSelect: () => void;
  showActions: boolean;
  isAssignLocked: boolean;
  onAssign: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="relative flex-none w-fit"
      onClick={onSelect}
      style={{ cursor: 'pointer' }}
    >
      <div
        className={cn(
          "flex h-9 items-center gap-2 rounded-xl border px-3 text-sm transition-colors",
          active
            ? "border-primary/30 bg-primary text-black"
            : "border-border/25 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
        )}
      >
        <span className="whitespace-nowrap">{label}</span>
        <span className="text-[11px] opacity-75">{count}</span>
        {showActions ? (
          <div className="ml-1 flex items-center gap-1 overflow-hidden border-l border-black/15 pl-2 text-black">
            <button
              type="button"
              tabIndex={-1}
              className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] hover:bg-black/10"
              onClick={(event) => {
                event.stopPropagation();
                onAssign();
              }}
              disabled={isAssignLocked}
            >
              <Plus className="size-3.5" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              className="inline-flex size-6 items-center justify-center rounded-md hover:bg-black/10"
              onClick={(event) => {
                event.stopPropagation();
                onRename();
              }}
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              className="inline-flex size-6 items-center justify-center rounded-md hover:bg-black/10"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ProjectGroupTabsDndProps = {
  activeKey: string;
  groupTabs: GroupTabViewModel[];
  isAssignLocked: boolean;
  onAssignProjects: () => void;
  onDeleteGroup: () => void;
  onRenameGroup: () => void;
  onReorder: (groupIds: string[]) => Promise<void>;
  onSelectTab: (key: string) => void;
};

export function ProjectGroupTabsDnd({
  activeKey,
  groupTabs,
  isAssignLocked,
  onAssignProjects,
  onDeleteGroup,
  onRenameGroup,
  onReorder,
  onSelectTab,
}: ProjectGroupTabsDndProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(LongPressPointerSensor, {
      activationConstraint: {
        delay: LONG_PRESS_DELAY_MS,
        tolerance: LONG_PRESS_TOLERANCE_PX,
      },
    })
  );
  const fixedTab = groupTabs.find((tab) => tab.key === ALL_GROUP_TAB_KEY) ?? null;
  const sortableTabs = useMemo(
    () => groupTabs.filter((tab) => tab.key !== ALL_GROUP_TAB_KEY),
    [groupTabs]
  );
  const sortableTabIds = sortableTabs.map((tab) => tab.key);
  const canSortTabs = sortableTabs.length > 1;


  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {

      setActiveId(null);

      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }

      const oldIndex = sortableTabIds.indexOf(String(active.id));
      const newIndex = sortableTabIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) {
        return;
      }

      await onReorder(arrayMove(sortableTabIds, oldIndex, newIndex));
    },
    [onReorder, sortableTabIds]
  );

  return (
    <>
      {fixedTab ? (
        <StaticGroupTabItem
          active={activeKey === fixedTab.key}
          count={fixedTab.count}
          label={fixedTab.name}
          onSelect={() => onSelectTab(fixedTab.key)}
        />
      ) : null}

      {canSortTabs ? (
        <DndContext
          collisionDetection={closestCenter}
          modifiers={[restrictDragToContainer]}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
          onDragStart={handleDragStart}
          sensors={sensors}
        >
          <div className="flex min-w-fit items-center gap-2 overflow-visible">
            <SortableContext items={sortableTabIds} strategy={horizontalListSortingStrategy}>
              {sortableTabs.map((tab) => (
                <SortableGroupTabItem
                  key={tab.key}
                  active={activeKey === tab.key}
                  count={tab.count}
                  id={tab.key}
                  activeId={activeId}
                  isAssignLocked={isAssignLocked}
                  label={tab.name}
                  onAssign={onAssignProjects}
                  onDelete={onDeleteGroup}
                  onRename={onRenameGroup}
                  onSelect={() => onSelectTab(tab.key)}
                  showActions={activeKey === tab.key}
                />
              ))}
            </SortableContext>
          </div>
          <DragOverlay adjustScale={false}>
            {activeId ? (
              (() => {
                const tab = sortableTabs.find((t) => t.key === activeId);
                if (!tab) return null;
                return (
                  <div className="py-1">
                    <GroupTabShell
                      active={activeKey === tab.key}
                      count={tab.count}
                      dragging
                      label={tab.name}
                      actionSlot={
                        activeKey === tab.key ? (
                          <div className="ml-1 flex items-center gap-1 overflow-hidden border-l border-black/15 pl-2 text-black">
                            <button type="button" className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] hover:bg-black/10">
                              <Plus className="size-3.5" />
                            </button>
                            <button type="button" className="inline-flex size-6 items-center justify-center rounded-md hover:bg-black/10">
                              <Pencil className="size-3.5" />
                            </button>
                            <button type="button" className="inline-flex size-6 items-center justify-center rounded-md hover:bg-black/10">
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        ) : null
                      }
                    />
                  </div>
                );
              })()
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        sortableTabs.map((tab) => (
          <NonSortableGroupTabItem
            key={tab.key}
            active={activeKey === tab.key}
            count={tab.count}
            label={tab.name}
            onSelect={() => onSelectTab(tab.key)}
            showActions={activeKey === tab.key}
            isAssignLocked={isAssignLocked}
            onAssign={onAssignProjects}
            onRename={onRenameGroup}
            onDelete={onDeleteGroup}
          />
        ))
      )}
    </>
  );
}

function ProjectCardContent({ card }: { card: VisibleProjectCardViewModel }) {
  return (
    <ProjectCard
      availableGroups={card.availableGroups}
      diagnosis={card.diagnosis}
      groupBadgeLabel={card.groupBadgeLabel}
      isAddressLocked={card.isAddressLocked}
      isDeleteLocked={card.isDeleteLocked}
      isDeleteNodeModulesLocked={card.isDeleteNodeModulesLocked}
      isDiagnosisPending={card.isDiagnosisPending}
      isDirectoryLocked={card.isDirectoryLocked}
      isEditLocked={card.isEditLocked}
      isMoveGroupLocked={card.isMoveGroupLocked}
      isReinstallNodeModulesLocked={card.isReinstallNodeModulesLocked}
      isStartLocked={card.isStartLocked}
      isStartPending={card.isStartPending}
      isStopLocked={card.isStopLocked}
      isStopPending={card.isStopPending}
      isTerminalLocked={card.isTerminalLocked}
      onDelete={card.onDelete}
      onDeleteNodeModules={card.onDeleteNodeModules}
      onEdit={card.onEdit}
      onOpenDirectory={card.onOpenDirectory}
      onOpenMoveGroupDialog={card.onOpenMoveGroupDialog}
      onOpenTerminalOutput={card.onOpenTerminalOutput}
      onOpenUrl={card.onOpenUrl}
      onReinstallNodeModules={card.onReinstallNodeModules}
      onStart={card.onStart}
      onStop={card.onStop}
      operationPanel={card.operationPanel}
      project={card.project}
      runtime={card.runtime}
      runtimeFailureMessage={card.runtimeFailureMessage}
    />
  );
}

function SortableProjectCardItem({ card }: { card: VisibleProjectCardViewModel }) {
  const sortable = useSortable({ id: card.key });
  const longPress = useLongPressFeedback();
  useBodyCursor(longPress.isPressing || sortable.isDragging);

  useEffect(() => {
    if (sortable.isDragging) {
      longPress.clear();
    }
  }, [longPress, sortable.isDragging]);

  const style = {
    transform: CSS.Transform.toString(
      getDragTransform(sortable.transform)
    ),
    transition: sortable.transition,
  } satisfies CSSProperties;
  const slotIndicatorStyle = getSlotIndicatorStyle(
    sortable.transform,
    sortable.transition
  );

  return (
    <div
      ref={sortable.setNodeRef}
      {...sortable.attributes}
      {...sortable.listeners}
      {...longPress.feedbackProps}
      data-drag-root="true"
      className={cn(
        "relative select-none will-change-transform",
        sortable.isDragging && "z-20",
        (longPress.isPressing || sortable.isDragging) && "cursor-grabbing"
      )}
      style={{ ...style, cursor: getDragCursor(longPress.isPressing || sortable.isDragging) }}
    >
      {sortable.isOver && !sortable.isDragging ? (
        <div
          className="pointer-events-none absolute inset-[-8px] z-10 rounded-[1.25rem] border border-primary/20 bg-primary/[0.03] backdrop-blur-[2px] animate-drag-slot"
          style={slotIndicatorStyle}
        />
      ) : null}
      <DragRipple
        active={sortable.isDragging}
        roundedClassName="rounded-[1.15rem]"
        insetOffset={-6}
        maxSpread="24px"
      />
      <div
        className={cn(
          "transition-[transform,opacity,filter] duration-300",
          sortable.isDragging && "drop-shadow-[0_22px_44px_rgba(0,0,0,0.35)]"
        )}
      >
        <ProjectCardContent card={card} />
      </div>
    </div>
  );
}

function StaticProjectCardItem({ card }: { card: VisibleProjectCardViewModel }) {
  return (
    <div className="relative">
      <ProjectCardContent card={card} />
    </div>
  );
}

type SortableProjectCardsGridProps = {
  cards: VisibleProjectCardViewModel[];
  onReorder: (projectIds: string[]) => Promise<void>;
  sortableGroupId: string | null;
};

export function SortableProjectCardsGrid({
  cards,
  onReorder,
  sortableGroupId,
}: SortableProjectCardsGridProps) {
  const sensors = useSensors(
    useSensor(LongPressPointerSensor, {
      activationConstraint: {
        delay: LONG_PRESS_DELAY_MS,
        tolerance: LONG_PRESS_TOLERANCE_PX,
      },
    })
  );
  const cardIds = cards.map((card) => card.key);
  const canSortCards = Boolean(sortableGroupId) && cards.length > 1;


  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {

      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }

      const oldIndex = cardIds.indexOf(String(active.id));
      const newIndex = cardIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) {
        return;
      }

      await onReorder(arrayMove(cardIds, oldIndex, newIndex));
    },
    [cardIds, onReorder]
  );

  if (!canSortCards) {
    return (
      <div className="grid items-start grid-cols-[repeat(auto-fit,minmax(320px,390px))] gap-6">
        {cards.map((card) => (
          <StaticProjectCardItem key={card.key} card={card} />
        ))}
      </div>
    );
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictDragToContainer]}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <SortableContext items={cardIds} strategy={rectSortingStrategy}>
        <div className="grid items-start grid-cols-[repeat(auto-fit,minmax(320px,390px))] gap-6">
          {cards.map((card) => (
            <SortableProjectCardItem key={card.key} card={card} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
