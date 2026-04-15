import { AlertTriangle } from "lucide-react";
import { NodeInstallProgress } from "@/components/node-install-progress";
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
import type { NodeInstallProgress as NodeInstallProgressState } from "@/features/project-panel/use-project-dialog-state";

type InstallNodeVersionDialogProps = {
  open: boolean;
  projectName: string;
  nodeVersion: string;
  isInstalling: boolean;
  progress: NodeInstallProgressState | null;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function InstallNodeVersionDialog({
  open,
  projectName,
  nodeVersion,
  isInstalling,
  progress,
  onConfirm,
  onOpenChange,
}: InstallNodeVersionDialogProps) {
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
          <AlertDialogTitle>需要先安装 Node 版本</AlertDialogTitle>
          <AlertDialogDescription>
            {`${projectName} 需要 Node v${nodeVersion}。当前系统还没有安装这个版本，是否现在安装并继续启动项目？`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {progress?.kind === "single" ? <NodeInstallProgress progress={progress} tone="amber" /> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isInstalling}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            disabled={isInstalling}
          >
            {isInstalling ? "安装中..." : "安装并继续启动"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
