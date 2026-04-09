import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
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
import type {
  OperationEvent,
  ProjectConfig,
  ProjectDiagnosis,
  ProjectLogEntry,
  ProjectRuntime,
} from "@/shared/contracts";

type ProjectCardProps = {
  project: ProjectConfig;
  runtime?: ProjectRuntime;
  runtimeFailureMessage?: string;
  operationPanel?: OperationEvent;
  diagnosis?: ProjectDiagnosis;
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
    .slice(-8);
}

function getRuntimeErrorMessage(runtime: ProjectRuntime | undefined) {
  if (!runtime) {
    return "启动失败，请查看终端输出。";
  }

  const recentLogMessage = [...(runtime.recentLogs ?? [])]
    .reverse()
    .map((entry) => entry.message.trim())
    .find(Boolean);

  return runtime.lastMessage?.trim() || recentLogMessage || "启动失败，请查看终端输出。";
}

function getOperationTone(status: OperationEvent["status"]) {
  switch (status) {
    case "queued":
      return {
        shell: "border-amber-400/20 bg-amber-500/[0.07]",
        icon: "bg-amber-500/15 text-amber-200",
        text: "text-amber-100",
        subtext: "text-amber-100/70",
        badge: "等待处理",
      };
    case "running":
      return {
        shell: "border-sky-400/20 bg-sky-500/[0.07]",
        icon: "bg-sky-500/15 text-sky-200",
        text: "text-sky-100",
        subtext: "text-sky-100/70",
        badge: "处理中",
      };
    case "success":
      return {
        shell: "border-emerald-400/20 bg-emerald-500/[0.07]",
        icon: "bg-emerald-500/15 text-emerald-200",
        text: "text-emerald-100",
        subtext: "text-emerald-100/70",
        badge: "已完成",
      };
    default:
      return {
        shell: "border-rose-400/20 bg-rose-500/[0.07]",
        icon: "bg-rose-500/15 text-rose-200",
        text: "text-rose-100",
        subtext: "text-rose-100/75",
        badge: "处理失败",
      };
  }
}

function getOperationIcon(event: OperationEvent) {
  if (event.status === "running") {
    return <LoaderCircle className="size-4 animate-spin" />;
  }

  if (event.status === "success") {
    return <CheckCircle2 className="size-4" />;
  }

  return <RefreshCw className="size-4" />;
}

function getDiagnosisTone(diagnosis: ProjectDiagnosis) {
  if (diagnosis.readiness.canStart) {
    return {
      shell: "border-emerald-400/20 bg-emerald-500/[0.06]",
      icon: "bg-emerald-500/15 text-emerald-200",
      text: "text-emerald-100",
      subtext: "text-emerald-100/70",
      title: "环境检测通过",
      message: "当前项目环境检测通过，请点击启动。",
    };
  }

  return {
    shell: "border-amber-400/20 bg-amber-500/[0.06]",
    icon: "bg-amber-500/15 text-amber-200",
    text: "text-amber-100",
    subtext: "text-amber-100/70",
    title: "启动前还需处理",
    message: diagnosis.readiness.warnings[0] ?? "当前项目还需要补充环境后才能启动。",
  };
}

export function ProjectCard({
  project,
  runtime,
  runtimeFailureMessage,
  operationPanel,
  diagnosis,
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
  const terminalPreview = useMemo(() => getTerminalPreview(runtime?.recentLogs), [runtime?.recentLogs]);
  const showTerminalPreview = !operationPanel && !showAddresses && isBusy;
  const showRuntimeError = !operationPanel && Boolean(runtimeFailureMessage || status === "error");
  const showDiagnosis =
    !operationPanel && !showAddresses && status === "stopped" && Boolean(diagnosis);
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

  const operationTone = operationPanel ? getOperationTone(operationPanel.status) : null;
  const diagnosisTone = diagnosis ? getDiagnosisTone(diagnosis) : null;

  return (
    <Card
      className={cn(
        "self-start overflow-hidden border-white/10 bg-[#171d2a]/94 py-0 shadow-lg shadow-black/20 backdrop-blur-sm transition-all duration-500",
        isBusy && "running-marquee !border-primary/30"
      )}
    >
      <div className="border-b border-white/8 px-3.5 py-2.5">
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
                <div className="absolute right-0 top-7 z-20 min-w-40 rounded-xl border border-white/10 bg-[#111827]/96 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-xl">
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

      <div className="px-3.5 py-3">
        <div className="flex h-[9.5rem] items-center rounded-xl border border-white/8 bg-[#101621] px-3 py-3">
          {operationPanel && operationTone ? (
            <div
              className={cn(
                "flex h-full w-full flex-col justify-center rounded-xl border px-4 py-3 transition-colors",
                operationTone.shell
              )}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full border border-white/10",
                      operationTone.icon
                    )}
                  >
                    {getOperationIcon(operationPanel)}
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    {operationPanel.title}
                  </div>
                </div>
                <div className={cn("text-[11px] font-medium", operationTone.subtext)}>
                  {operationTone.badge}
                </div>
              </div>

              <div className={cn("line-clamp-2 text-sm leading-6", operationTone.text)}>
                {operationPanel.message ?? "正在处理中，请稍后..."}
              </div>
            </div>
          ) : showRuntimeError ? (
            <div className="flex h-full w-full flex-col justify-center rounded-xl border border-rose-400/20 bg-rose-500/[0.07] px-4 py-3">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-rose-500/15 text-rose-200">
                  <AlertTriangle className="size-4" />
                </div>
                <div className="text-sm font-semibold text-foreground">启动失败</div>
              </div>

              <div className="line-clamp-3 text-sm leading-6 text-rose-100">
                {runtimeFailureMessage ?? getRuntimeErrorMessage(runtime)}
              </div>
            </div>
          ) : showDiagnosis && diagnosis && diagnosisTone ? (
            <div
              className={cn(
                "flex h-full w-full flex-col justify-center rounded-xl border px-4 py-3 transition-colors",
                diagnosisTone.shell
              )}
            >
              <div className="mb-3 flex items-center gap-2">
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border border-white/10",
                    diagnosisTone.icon
                  )}
                >
                  <CheckCircle2 className="size-4" />
                </div>
                <div className="text-sm font-semibold text-foreground">{diagnosisTone.title}</div>
              </div>

              <div className={cn("line-clamp-2 text-sm leading-6", diagnosisTone.text)}>
                {diagnosisTone.message}
              </div>

              {!diagnosis.readiness.canStart && diagnosis.readiness.warnings.length > 1 ? (
                <div className={cn("mt-2 text-xs", diagnosisTone.subtext)}>
                  另外还有 {diagnosis.readiness.warnings.length - 1} 项需要处理。
                </div>
              ) : null}
            </div>
          ) : showAddresses ? (
            <div className="flex h-full w-full items-center justify-center">
              <div className="w-full max-w-[22rem] space-y-2">
                {addresses.map((address) => (
                  <button
                    key={address.url}
                    type="button"
                    className="flex h-8 w-full items-center justify-between gap-2.5 rounded-xl border border-white/8 bg-white/5 px-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/8 disabled:opacity-60"
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
            <div className="h-full w-full overflow-auto rounded-xl border border-white/8 bg-black/20 px-3 py-2">
              {terminalPreview.length > 0 ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-[1.45] text-muted-foreground">
                  {terminalPreview.join("\n")}
                </pre>
              ) : (
                <div className="font-mono text-[10px] leading-[1.45] text-muted-foreground">
                  正在等待终端输出...
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 px-3 text-[13px] text-muted-foreground">
              项目未启动
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/8 px-3.5 py-2.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-3 text-[11px]"
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
          className="h-7 px-3 text-[11px]"
          onClick={isBusy ? onStop : onStart}
          disabled={isBusy ? isStopLocked : isStartLocked}
        >
          {isBusy ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
          {isBusy ? "停止" : "启动"}
        </Button>
      </div>
    </Card>
  );
}
