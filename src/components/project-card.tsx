import { useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  FolderOpen,
  LoaderCircle,
  Pencil,
  Play,
  RefreshCw,
  Settings2,
  Square,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getProjectStatusLabel } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import type { ProjectConfig, ProjectLogEntry, ProjectRuntime } from "@/shared/contracts";

type ProjectCardProps = {
  project: ProjectConfig;
  nodeVersionInstalled: boolean;
  runtime?: ProjectRuntime;
  isStartLocked: boolean;
  isStopLocked: boolean;
  isEditLocked: boolean;
  isDeleteLocked: boolean;
  isDeleteNodeModulesLocked: boolean;
  isReinstallNodeModulesLocked: boolean;
  isTerminalLocked: boolean;
  isDirectoryLocked: boolean;
  isAddressLocked: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteNodeModules: () => void;
  onReinstallNodeModules: () => void;
  onOpenTerminalOutput: () => void;
  onStart: () => void;
  onStop: () => void;
  onOpenDirectory: () => void;
  onOpenUrl: (url: string) => void;
};

function getStatusClassName(status: ProjectRuntime["status"] | undefined) {
  switch (status) {
    case "running":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
    case "starting":
      return "border-sky-400/20 bg-sky-400/10 text-sky-100";
    case "error":
      return "border-rose-400/20 bg-rose-400/10 text-rose-100";
    default:
      return "border-white/10 bg-white/5 text-muted-foreground";
  }
}

function getTerminalPreview(logs: ProjectLogEntry[] | undefined) {
  if (!logs?.length) {
    return [];
  }

  return logs
    .filter((entry) => entry.level !== "system")
    .flatMap((entry) =>
      entry.message
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean)
    )
    .slice(-10);
}

export function ProjectCard({
  project,
  nodeVersionInstalled,
  runtime,
  isStartLocked,
  isStopLocked,
  isEditLocked,
  isDeleteLocked,
  isDeleteNodeModulesLocked,
  isReinstallNodeModulesLocked,
  isTerminalLocked,
  isDirectoryLocked,
  isAddressLocked,
  onDelete,
  onDeleteNodeModules,
  onEdit,
  onOpenDirectory,
  onOpenTerminalOutput,
  onOpenUrl,
  onReinstallNodeModules,
  onStart,
  onStop,
}: ProjectCardProps) {
  const status = runtime?.status ?? "stopped";
  const isBusy = status === "running" || status === "starting";
  const addresses = runtime?.detectedAddresses ?? [];
  const showAddresses = addresses.length > 0 && isBusy;
  const showTerminalPreview = !showAddresses && isBusy;
  const terminalPreview = useMemo(
    () => getTerminalPreview(runtime?.recentLogs),
    [runtime?.recentLogs]
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuToggleLocked, setMenuToggleLocked] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  function handleToggleMenu() {
    if (menuToggleLocked) {
      return;
    }

    setMenuToggleLocked(true);
    setMenuOpen((current) => !current);

    window.setTimeout(() => {
      setMenuToggleLocked(false);
    }, 250);
  }

  function handleEdit() {
    setMenuOpen(false);
    onEdit();
  }

  function handleDelete() {
    setMenuOpen(false);
    onDelete();
  }

  function handleDeleteDependencies() {
    setMenuOpen(false);
    onDeleteNodeModules();
  }

  function handleReinstallDependencies() {
    setMenuOpen(false);
    onReinstallNodeModules();
  }

  return (
    <Card
      className={cn(
        "self-start gap-0 overflow-hidden border-white/10 bg-[#171d2a]/94 py-0 shadow-lg shadow-black/20 backdrop-blur-sm transition-all duration-500",
        isBusy && "running-marquee !border-primary/30"
      )}
    >
      <div className="border-b border-white/8 px-3.5 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-1.5">
            <div className="truncate text-[15px] font-semibold tracking-tight text-foreground">
              {project.name}
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-5 text-muted-foreground hover:text-foreground"
                  onClick={onOpenDirectory}
                  disabled={isDirectoryLocked}
                >
                  <FolderOpen className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={8}>打开项目目录</TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn("rounded-full px-2 py-0 text-[10px]", getStatusClassName(status))}
            >
              {getProjectStatusLabel(status)}
            </Badge>

            <div ref={menuRef} className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="size-5 text-muted-foreground hover:text-foreground"
                    onClick={handleToggleMenu}
                    disabled={menuToggleLocked}
                  >
                    <Settings2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent sideOffset={8}>更多操作</TooltipContent>
              </Tooltip>

              {menuOpen ? (
                <div className="absolute top-7 right-0 z-20 min-w-40 rounded-xl border border-white/10 bg-[#111827]/96 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-xl">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-white/8 disabled:opacity-50"
                    onClick={handleEdit}
                    disabled={isBusy || isEditLocked}
                  >
                    <Pencil className="size-3.5" />
                    编辑
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-white/8 disabled:opacity-50"
                    onClick={handleDeleteDependencies}
                    disabled={isBusy || isDeleteNodeModulesLocked}
                  >
                    {isDeleteNodeModulesLocked ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    删除依赖
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-white/8 disabled:opacity-50"
                    onClick={handleReinstallDependencies}
                    disabled={isBusy || isReinstallNodeModulesLocked}
                  >
                    {isReinstallNodeModulesLocked ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                    重装依赖
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-rose-100 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
                    onClick={handleDelete}
                    disabled={isBusy || isDeleteLocked}
                  >
                    <Trash2 className="size-3.5" />
                    移除项目
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="px-3.5 py-2.5">
        <div className="h-[8.5rem] rounded-xl border border-white/8 bg-[#101621] p-2.5">
          {showAddresses ? (
            <div className="flex h-full items-center">
              <div className="w-full space-y-1.5">
                {addresses.map((address) => (
                  <button
                    key={address.url}
                    type="button"
                    className="flex h-7 w-full items-center justify-between gap-2.5 rounded-xl border border-white/8 bg-white/5 px-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/8 disabled:opacity-60"
                    onClick={() => onOpenUrl(address.url)}
                    disabled={isAddressLocked}
                  >
                    <span className="truncate font-mono text-xs text-foreground">
                      {address.url}
                    </span>
                    <ExternalLink className="size-3.5 shrink-0 text-primary" />
                  </button>
                ))}
              </div>
            </div>
          ) : showTerminalPreview ? (
            <div className="h-full overflow-auto rounded-xl border border-white/8 bg-black/20 px-2.5 py-1.5">
              {terminalPreview.length > 0 ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-[1.35] text-muted-foreground">
                  {terminalPreview.join("\n")}
                </pre>
              ) : (
                <div className="font-mono text-[10px] leading-[1.35] text-muted-foreground">
                  正在等待终端输出...
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 px-3 text-[13px] text-muted-foreground">
              项目未启动
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/8 px-3.5 py-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6.5 px-2.5 text-[11px]"
          onClick={onOpenTerminalOutput}
          disabled={isTerminalLocked}
        >
          <TerminalSquare className="size-3.5" />
          终端
        </Button>

        <Button
          type="button"
          size="sm"
          variant={isBusy ? "destructive" : "default"}
          className="h-6.5 px-2.5 text-[11px]"
          onClick={isBusy ? onStop : onStart}
          disabled={isBusy ? isStopLocked : isStartLocked || !nodeVersionInstalled}
        >
          {isBusy ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
          {isBusy ? "停止" : "启动"}
        </Button>
      </div>
    </Card>
  );
}
