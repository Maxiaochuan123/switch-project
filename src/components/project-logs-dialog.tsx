import { useEffect, useRef, useState } from "react";
import { Check, Copy, FileText, TerminalSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ProjectConfig, ProjectLogEntry, ProjectRuntime } from "@/shared/contracts";

type ProjectLogsDialogProps = {
  open: boolean;
  project: ProjectConfig | null;
  runtime?: ProjectRuntime;
  onOpenChange: (open: boolean) => void;
};

function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function getLevelBadge(entry: ProjectLogEntry) {
  switch (entry.level) {
    case "stderr":
      return "border-rose-400/20 bg-rose-400/10 text-rose-100";
    case "system":
      return "border-sky-400/20 bg-sky-400/10 text-sky-100";
    default:
      return "border-white/10 bg-white/5 text-muted-foreground";
  }
}

function getLevelLabel(entry: ProjectLogEntry) {
  switch (entry.level) {
    case "stderr":
      return "错误输出";
    case "system":
      return "系统";
    default:
      return "标准输出";
  }
}

export function ProjectLogsDialog({
  open,
  project,
  runtime,
  onOpenChange,
}: ProjectLogsDialogProps) {
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const logs = runtime?.recentLogs ?? [];
  const [copied, setCopied] = useState(false);
  const copiedResetRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    bottomAnchorRef.current?.scrollIntoView({ block: "end" });
  }, [logs, open]);

  useEffect(() => {
    return () => {
      if (copiedResetRef.current) {
        window.clearTimeout(copiedResetRef.current);
      }
    };
  }, []);

  function handleCopyLogs() {
    if (logs.length === 0) {
      return;
    }

    const content = logs
      .map(
        (entry) =>
          `[${formatTimestamp(entry.at)}] [${getLevelLabel(entry)}] ${entry.message}`
      )
      .join("\n\n");

    window.switchProjectApi.copyText(content);
    setCopied(true);

    if (copiedResetRef.current) {
      window.clearTimeout(copiedResetRef.current);
    }

    copiedResetRef.current = window.setTimeout(() => {
      setCopied(false);
      copiedResetRef.current = null;
    }, 1600);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden border-white/10 bg-[#0d1426]/96 p-0 backdrop-blur-xl sm:max-w-4xl">
        <div className="flex max-h-[88vh] flex-col rounded-[24px] border border-white/6 bg-[radial-gradient(circle_at_top_right,rgba(62,207,196,0.12),transparent_30%),rgba(0,0,0,0.18)] p-6">
          <DialogHeader className="shrink-0 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <DialogTitle className="text-2xl font-semibold tracking-tight">
                  {project ? `${project.name} 日志` : "项目日志"}
                </DialogTitle>
                <DialogDescription className="break-all font-mono text-xs">
                  {project?.path ?? "选择一个项目后，可以在这里查看运行输出。"}
                </DialogDescription>
              </div>
              {project ? (
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  v{project.nodeVersion}
                </Badge>
              ) : null}
            </div>
          </DialogHeader>

          <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-white/8 bg-black/20">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <TerminalSquare className="size-4 text-primary" />
                运行日志
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-xs text-muted-foreground">
                  最近 {logs.length} 条记录
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-7 px-2"
                  onClick={handleCopyLogs}
                  disabled={logs.length === 0}
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? "已复制" : "复制日志"}
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[min(62vh,560px)]">
              {logs.length === 0 ? (
                <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <FileText className="size-8 text-primary" />
                  </div>
                  <p>暂无日志，启动项目后会在这里显示输出。</p>
                </div>
              ) : (
                <div className="space-y-3 p-4">
                  {logs.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-white/8 bg-black/15 p-3"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn("rounded-full", getLevelBadge(entry))}
                        >
                          {getLevelLabel(entry)}
                        </Badge>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {formatTimestamp(entry.at)}
                        </span>
                      </div>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-foreground">
                        {entry.message}
                      </pre>
                    </div>
                  ))}
                  <div ref={bottomAnchorRef} />
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
