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
import { Button } from "@/components/ui/button";
import type { AppCloseRequest } from "@/shared/contracts";

type ExitRunningProjectsDialogProps = {
  request: AppCloseRequest | null;
  isConfirming: boolean;
  isMinimizing: boolean;
  onConfirm: () => void;
  onMinimize: () => void;
  onOpenChange: (open: boolean) => void;
};

export function ExitRunningProjectsDialog({
  request,
  isConfirming,
  isMinimizing,
  onConfirm,
  onMinimize,
  onOpenChange,
}: ExitRunningProjectsDialogProps) {
  return (
    <AlertDialog open={Boolean(request)} onOpenChange={onOpenChange}>
      <AlertDialogContent 
        className="border-border/50 bg-black/60 backdrop-blur-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogMedia className="border border-amber-500/20 bg-amber-500/10 text-amber-100">
            <AlertTriangle className="size-7" />
          </AlertDialogMedia>
          <AlertDialogTitle>确认退出</AlertDialogTitle>
          <AlertDialogDescription>
            {request
              ? `还有 ${request.activeProjectCount} 个已启动项目。退出后这些项目会被停止并释放端口。`
              : "退出后已启动项目会被停止并释放端口。"}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {request?.activeProjectNames.length ? (
          <div className="rounded-lg border border-border/30 bg-black/10 p-4 text-sm text-muted-foreground">
            <p className="mb-2 font-medium text-foreground">正在运行的项目</p>
            <div className="space-y-1">
              {request.activeProjectNames.map((name) => (
                <p key={name}>{name}</p>
              ))}
              {request.activeProjectCount > request.activeProjectNames.length ? <p>还有其他项目...</p> : null}
            </div>
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <Button type="button" variant="outline" onClick={onMinimize} disabled={isMinimizing || isConfirming}>
            {isMinimizing ? "最小化中..." : "最小化到托盘"}
          </Button>
          <AlertDialogAction
            variant="destructive"
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            disabled={isConfirming}
          >
            {isConfirming ? "退出中..." : "仍然退出"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
