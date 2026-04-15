import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ProjectGroup } from "@/shared/contracts";

type DeleteProjectGroupDialogProps = {
  group: ProjectGroup | null;
  affectedProjectCount: number;
  isDeleting: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function DeleteProjectGroupDialog({
  group,
  affectedProjectCount,
  isDeleting,
  onConfirm,
  onOpenChange,
}: DeleteProjectGroupDialogProps) {
  return (
    <AlertDialog open={Boolean(group)} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="border-border/50 bg-black/60 backdrop-blur-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogMedia className="border border-rose-500/20 bg-rose-500/10 text-rose-100">
            <AlertTriangle className="size-7" />
          </AlertDialogMedia>
          <AlertDialogTitle>删除分组</AlertDialogTitle>
          <AlertDialogDescription>
            {group
              ? `删除“${group.name}”后，组内项目不会被删除，会自动回到未分组。`
              : "删除分组后，组内项目会自动回到未分组。"}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-lg border border-border/30 bg-black/10 p-4 text-sm text-muted-foreground">
          当前受影响项目数：<span className="font-semibold text-foreground">{affectedProjectCount}</span>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "删除中..." : "删除分组"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
