import { useEffect, useMemo, useRef } from "react";
import { TerminalSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getLatestStartupTimingSummary,
  getProjectTerminalText,
  getStartupTimingSummaryParts,
} from "@/features/project-panel/helpers";
import type { ProjectConfig, ProjectRuntime } from "@/shared/contracts";

type ProjectLogsDialogProps = {
  open: boolean;
  project: ProjectConfig | null;
  runtime?: ProjectRuntime;
  onOpenChange: (open: boolean) => void;
};

export function ProjectLogsDialog({
  open,
  project,
  runtime,
  onOpenChange,
}: ProjectLogsDialogProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const terminalText = useMemo(
    () => getProjectTerminalText(runtime?.recentLogs),
    [runtime?.recentLogs]
  );
  const startupTimingSummary = useMemo(
    () => getLatestStartupTimingSummary(runtime?.recentLogs),
    [runtime?.recentLogs]
  );
  const startupTimingSummaryParts = useMemo(
    () => getStartupTimingSummaryParts(startupTimingSummary),
    [startupTimingSummary]
  );

  function scrollToBottom() {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
    bottomAnchorRef.current?.scrollIntoView({ block: "end" });
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const timers = [
      window.setTimeout(scrollToBottom, 0),
      window.setTimeout(scrollToBottom, 80),
      window.setTimeout(scrollToBottom, 180),
      window.setTimeout(scrollToBottom, 360),
    ];

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [open, startupTimingSummary, startupTimingSummaryParts, terminalText]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[88vh] overflow-hidden rounded-xl border-border/50 bg-black/60 p-0 backdrop-blur-xl sm:max-w-4xl"
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex min-h-0 w-full flex-col">
          <DialogHeader className="shrink-0 border-b border-border/30 px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <TerminalSquare className="size-5 text-primary" />
              {project ? `${project.name} 终端` : "终端"}
            </DialogTitle>
          </DialogHeader>

          <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-auto px-5 py-4">
            {terminalText || startupTimingSummary ? (
              <>
                {terminalText ? (
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-foreground">
                    {terminalText}
                  </pre>
                ) : null}
                {startupTimingSummary ? (
                  <div className="mt-4 rounded-xl bg-primary/10 px-4 py-3 text-primary shadow-2xl backdrop-blur-md">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] font-semibold leading-5">
                      {startupTimingSummaryParts.map((part) => (
                        <span
                          key={part}
                          className="inline-flex rounded-md bg-primary/10 px-2.5 py-1 whitespace-nowrap"
                        >
                          {part}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div ref={bottomAnchorRef} className="h-px w-full" />
              </>
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-muted-foreground">
                暂无终端输出
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
