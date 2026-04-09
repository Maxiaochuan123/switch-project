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
import type { ProjectConfig } from "@/shared/contracts";

type DeleteProjectDialogProps = {
  project: ProjectConfig | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function DeleteProjectDialog({
  project,
  isDeleting,
  onConfirm,
  onOpenChange,
}: DeleteProjectDialogProps) {
  return (
    <AlertDialog open={Boolean(project)} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-white/10 bg-[#0d1426]/96 backdrop-blur-xl">
        <AlertDialogHeader>
          <AlertDialogMedia className="border border-rose-500/20 bg-rose-500/10 text-rose-100">
            <AlertTriangle className="size-7" />
          </AlertDialogMedia>
          <AlertDialogTitle>从面板中移除项目</AlertDialogTitle>
          <AlertDialogDescription>
            {project
              ? `这会把“${project.name}”从面板中移除，但不会删除磁盘里的项目文件。`
              : "这会把当前项目从面板中移除，但不会删除磁盘里的项目文件。"}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {project ? (
          <div className="rounded-2xl border border-white/8 bg-black/10 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{project.path}</p>
            <p className="mt-2 font-mono text-xs">Node v{project.nodeVersion}</p>
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "移除中..." : "移除项目"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
