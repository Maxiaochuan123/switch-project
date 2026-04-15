import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProjectGroupSectionProps = {
  name: string;
  count: number;
  isCollapsed: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isVirtual?: boolean;
  onToggle: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  children: ReactNode;
};

export function ProjectGroupSection({
  name,
  count,
  isCollapsed,
  canMoveUp,
  canMoveDown,
  isVirtual,
  onToggle,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
  children,
}: ProjectGroupSectionProps) {
  return (
    <section className="rounded-2xl border border-border/40 bg-black/25 p-3 shadow-xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={onToggle}
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
            {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{name}</div>
            <div className="text-xs text-muted-foreground">{count} 个项目</div>
          </div>
        </button>

        <div className="flex items-center gap-1">
          {!isVirtual ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn("size-8", !canMoveUp && "opacity-40")}
                onClick={onMoveUp}
                disabled={!canMoveUp}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn("size-8", !canMoveDown && "opacity-40")}
                onClick={onMoveDown}
                disabled={!canMoveDown}
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onRename}>
                <Pencil className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-8 text-rose-200 hover:text-rose-100" onClick={onDelete}>
                <Trash2 className="size-4" />
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {!isCollapsed ? <div className="pt-3">{children}</div> : null}
    </section>
  );
}
