import { useEffect, useMemo, useRef } from "react";
import { TerminalSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ProjectConfig, ProjectRuntime } from "@/shared/contracts";

type ProjectLogsDialogProps = {
  open: boolean;
  project: ProjectConfig | null;
  runtime?: ProjectRuntime;
  onOpenChange: (open: boolean) => void;
};

function createTerminalText(runtime?: ProjectRuntime) {
  if (!runtime?.recentLogs?.length) {
    return "";
  }

  return runtime.recentLogs
    .map((entry) => entry.message.trimEnd())
    .filter(Boolean)
    .join("\n");
}

export function ProjectLogsDialog({
  open,
  project,
  runtime,
  onOpenChange,
}: ProjectLogsDialogProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const terminalText = useMemo(() => createTerminalText(runtime), [runtime]);

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
  }, [open, terminalText]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[88vh] overflow-hidden rounded-[24px] border-white/10 bg-[#0d1426]/96 p-0 backdrop-blur-xl sm:max-w-4xl"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="flex min-h-0 w-full flex-col">
          <DialogHeader className="shrink-0 border-b border-white/8 px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <TerminalSquare className="size-5 text-primary" />
              {project ? `${project.name} 终端` : "终端"}
            </DialogTitle>
          </DialogHeader>

          <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-auto px-5 py-4">
            {terminalText ? (
              <>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-foreground">
                  {terminalText}
                </pre>
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
