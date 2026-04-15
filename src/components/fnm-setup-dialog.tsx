import { useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  LoaderCircle,
  ScrollText,
  TerminalSquare,
  Wrench,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { NodeManagerInstallResult } from "@/shared/contracts";

type FnmSetupDialogProps = {
  open: boolean;
  isInstalling: boolean;
  installResult: NodeManagerInstallResult | null;
  isLogsOpen: boolean;
  onInstall: () => void;
  onLogsOpenChange: (open: boolean) => void;
  onOpenGuide: () => void;
  onOpenLogs: () => void;
  onRefresh: () => void;
};

function getProgressLabel(progressValue: number) {
  if (progressValue < 24) {
    return "正在检查系统环境和可用安装器...";
  }

  if (progressValue < 78) {
    return "正在执行 fnm 安装命令，这一步通常最耗时...";
  }

  return "正在等待 fnm 生效并重新检测...";
}

function createAttemptOutput(label: "stdout" | "stderr", value?: string | null) {
  if (!value?.trim()) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
        {label}
      </div>
      <pre className="overflow-x-auto rounded-lg border border-border/40 bg-black/40 p-3 font-mono text-xs leading-6 text-foreground/90">
        {value.trim()}
      </pre>
    </div>
  );
}

export function FnmSetupDialog({
  open,
  isInstalling,
  installResult,
  isLogsOpen,
  onInstall,
  onLogsOpenChange,
  onOpenGuide,
  onOpenLogs,
  onRefresh,
}: FnmSetupDialogProps) {
  const [progressValue, setProgressValue] = useState(0);
  const hasFailureLogs = (installResult?.attempts.length ?? 0) > 0;
  const isInstallFailed = installResult?.success === false;

  useEffect(() => {
    if (!isInstalling) {
      setProgressValue(0);
      return;
    }

    let animationFrameId = 0;
    const startedAt = performance.now();

    const animate = () => {
      const elapsedMs = performance.now() - startedAt;
      let nextValue = 12;

      if (elapsedMs < 1_600) {
        nextValue = 12 + (elapsedMs / 1_600) * 18;
      } else if (elapsedMs < 10_000) {
        nextValue = 30 + ((elapsedMs - 1_600) / 8_400) * 48;
      } else {
        nextValue = 78 + ((elapsedMs - 10_000) / 10_000) * 16;
      }

      setProgressValue(Math.min(nextValue, 94));
      animationFrameId = window.requestAnimationFrame(animate);
    };

    animationFrameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [isInstalling]);

  const progressLabel = useMemo(() => getProgressLabel(progressValue), [progressValue]);

  return (
    <>
      <AlertDialog open={open} onOpenChange={() => undefined}>
        <AlertDialogContent
          className="border-border/50 bg-black/60 backdrop-blur-xl"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <AlertDialogHeader>
            <AlertDialogMedia className="border border-sky-500/20 bg-sky-500/10 text-sky-100">
              <Wrench className="size-7" />
            </AlertDialogMedia>
            <AlertDialogTitle>需要先初始化 fnm</AlertDialogTitle>
            <AlertDialogDescription>
              当前还没有检测到 fnm。面板接下来会使用 fnm 来安装和切换 Node 版本，请先完成
              fnm 初始化后再继续使用。
            </AlertDialogDescription>
          </AlertDialogHeader>

          {isInstalling ? (
            <div className="space-y-3 rounded-xl border border-sky-500/20 bg-sky-500/8 p-4">
              <div className="flex items-center justify-between gap-3 text-sm text-sky-50">
                <span>{progressLabel}</span>
                <span className="tabular-nums text-sky-100/80">
                  {Math.max(5, Math.round(progressValue))}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 transition-[width] duration-300 ease-out"
                  style={{ width: `${progressValue}%` }}
                />
              </div>
              <p className="text-xs leading-5 text-sky-100/70">
                安装过程可能需要几十秒。窗口会保持当前状态，你可以稍后查看详细日志。
              </p>
            </div>
          ) : null}

          {isInstallFailed ? (
            <div className="space-y-3 rounded-xl border border-rose-500/20 bg-rose-500/8 p-4">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-300" />
                <div className="space-y-1">
                  <div className="text-sm font-medium text-rose-100">自动安装没有完成</div>
                  <p className="text-sm leading-6 text-rose-100/80">{installResult.message}</p>
                </div>
              </div>
              {hasFailureLogs ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center"
                  onClick={onOpenLogs}
                >
                  <ScrollText className="size-4" />
                  查看失败日志
                </Button>
              ) : null}
            </div>
          ) : null}

          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onOpenGuide} disabled={isInstalling}>
              查看官方安装说明
            </Button>
            <Button type="button" variant="outline" onClick={onRefresh} disabled={isInstalling}>
              重新检测
            </Button>
            <Button type="button" onClick={onInstall} disabled={isInstalling}>
              {isInstalling ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {isInstalling ? "安装中..." : "安装 fnm"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isLogsOpen} onOpenChange={onLogsOpenChange}>
        <DialogContent
          className="flex max-h-[88vh] overflow-hidden rounded-xl border-border/50 bg-black/70 p-0 backdrop-blur-xl sm:max-w-4xl"
          onInteractOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="flex min-h-0 w-full flex-col">
            <DialogHeader className="shrink-0 border-b border-border/30 px-5 py-4">
              <DialogTitle className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <TerminalSquare className="size-5 text-primary" />
                fnm 安装日志
              </DialogTitle>
              <DialogDescription>
                {installResult?.message ?? "这里会显示自动安装 fnm 时各个安装器的输出。"}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
              {installResult?.attempts.length ? (
                installResult.attempts.map((attempt, index) => (
                  <section
                    key={`${attempt.installer}-${attempt.command}-${index}`}
                    className="space-y-4 rounded-xl border border-border/40 bg-white/5 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-foreground">
                          安装器 {attempt.installer}
                        </div>
                        <div className="font-mono text-xs leading-5 text-muted-foreground">
                          {attempt.command}
                        </div>
                      </div>
                      <div className="rounded-full border border-border/40 bg-black/30 px-3 py-1 text-xs text-muted-foreground">
                        退出码 {attempt.exitCode ?? "-"}
                      </div>
                    </div>
                    {createAttemptOutput("stdout", attempt.stdout)}
                    {createAttemptOutput("stderr", attempt.stderr)}
                  </section>
                ))
              ) : (
                <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-muted-foreground">
                  暂无详细日志输出
                </div>
              )}
            </div>

            <DialogFooter className="shrink-0 border-t border-border/30 px-5 py-4">
              <Button type="button" variant="outline" onClick={() => onLogsOpenChange(false)}>
                关闭
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
