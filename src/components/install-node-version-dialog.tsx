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

type InstallNodeVersionDialogProps = {
  open: boolean;
  projectName: string;
  nodeVersion: string;
  isInstalling: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function InstallNodeVersionDialog({
  open,
  projectName,
  nodeVersion,
  isInstalling,
  onConfirm,
  onOpenChange,
}: InstallNodeVersionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-white/10 bg-[#0d1426]/96 backdrop-blur-xl">
        <AlertDialogHeader>
          <AlertDialogMedia className="border border-amber-500/20 bg-amber-500/10 text-amber-100">
            <AlertTriangle className="size-7" />
          </AlertDialogMedia>
          <AlertDialogTitle>需要先安装 Node 版本</AlertDialogTitle>
          <AlertDialogDescription>
            {`${projectName} 需要 Node v${nodeVersion}。当前系统还没有安装这个版本，是否现在安装并继续启动项目？`}
          </AlertDialogDescription>
        </AlertDialogHeader>

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
