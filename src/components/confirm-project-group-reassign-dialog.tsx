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

type ConfirmProjectGroupReassignDialogProps = {
  open: boolean;
  targetGroupName: string;
  projectNames: string[];
  isSubmitting: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function ConfirmProjectGroupReassignDialog({
  open,
  targetGroupName,
  projectNames,
  isSubmitting,
  onConfirm,
  onOpenChange,
}: ConfirmProjectGroupReassignDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="border-border/50 bg-black/60 backdrop-blur-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogMedia className="border border-amber-500/20 bg-amber-500/10 text-amber-100">
            <AlertTriangle className="size-7" />
          </AlertDialogMedia>
          <AlertDialogTitle>检测到已有分组</AlertDialogTitle>
          <AlertDialogDescription>
            {projectNames.length === 1
              ? `“${projectNames[0]}”已经存在分组，是否要变为 ${targetGroupName}？`
              : `以下 ${projectNames.length} 个项目已经存在其他分组，是否要变为 ${targetGroupName}？`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-lg border border-border/30 bg-black/10 p-4 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-2">
            {projectNames.map((name) => (
              <span
                key={name}
                className="rounded-full border border-border/40 bg-white/5 px-2 py-1 text-xs text-foreground"
              >
                {name}
              </span>
            ))}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? "保存中..." : "确认调整分组"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
