import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Copy,
  EllipsisVertical,
  ExternalLink,
  LoaderCircle,
  Pencil,
  Play,
  RefreshCw,
  Square,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import {
  areOperationEventsEqual,
  areProjectConfigsEqual,
  areProjectDiagnosesEqual,
  areProjectRuntimesEqual,
  getProjectRuntimeErrorMessage,
  selectProjectCardPanelState,
} from "@/features/project-panel/helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { getProjectStatusLabel } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import type {
  OperationEvent,
  ProjectConfig,
  ProjectDiagnosis,
  ProjectGroup,
  ProjectRuntime,
} from "@/shared/contracts";

type ProjectCardProps = {
  project: ProjectConfig;
  runtime?: ProjectRuntime;
  runtimeFailureMessage?: string;
  operationPanel?: OperationEvent;
  diagnosis?: ProjectDiagnosis;
  isDiagnosisPending: boolean;
  isStartPending: boolean;
  isStopPending: boolean;
  isStartLocked: boolean;
  isStopLocked: boolean;
  isEditLocked: boolean;
  isDeleteLocked: boolean;
  isDeleteNodeModulesLocked: boolean;
  isReinstallNodeModulesLocked: boolean;
  isTerminalLocked: boolean;
  isDirectoryLocked: boolean;
  isAddressLocked: boolean;
  isMoveGroupLocked: boolean;
  groupBadgeLabel?: string | null;
  availableGroups: Pick<ProjectGroup, "id" | "name">[];
  onEdit: () => void;
  onDelete: () => void;
  onDeleteNodeModules: () => void;
  onReinstallNodeModules: () => void;
  onOpenTerminalOutput: () => void;
  onStart: () => void;
  onStop: () => void;
  onOpenDirectory: () => void;
  onOpenUrl: (url: string) => void;
  onOpenMoveGroupDialog: () => void;
};

function areProjectCardPropsEqual(left: ProjectCardProps, right: ProjectCardProps) {
  const sameAvailableGroups =
    left.availableGroups.length === right.availableGroups.length &&
    left.availableGroups.every((group, index) => {
      const rightGroup = right.availableGroups[index];
      return rightGroup && group.id === rightGroup.id && group.name === rightGroup.name;
    });

  return (
    areProjectConfigsEqual(left.project, right.project) &&
    areProjectRuntimesEqual(left.runtime, right.runtime) &&
    left.runtimeFailureMessage === right.runtimeFailureMessage &&
    areOperationEventsEqual(left.operationPanel, right.operationPanel) &&
    areProjectDiagnosesEqual(left.diagnosis, right.diagnosis) &&
    left.isDiagnosisPending === right.isDiagnosisPending &&
    left.isStartPending === right.isStartPending &&
    left.isStopPending === right.isStopPending &&
    left.isStartLocked === right.isStartLocked &&
    left.isStopLocked === right.isStopLocked &&
    left.isEditLocked === right.isEditLocked &&
    left.isDeleteLocked === right.isDeleteLocked &&
    left.isDeleteNodeModulesLocked === right.isDeleteNodeModulesLocked &&
    left.isReinstallNodeModulesLocked === right.isReinstallNodeModulesLocked &&
    left.isTerminalLocked === right.isTerminalLocked &&
    left.isDirectoryLocked === right.isDirectoryLocked &&
    left.isAddressLocked === right.isAddressLocked &&
    left.isMoveGroupLocked === right.isMoveGroupLocked &&
    left.groupBadgeLabel === right.groupBadgeLabel &&
    sameAvailableGroups
  );
}

function getStatusClassName(status: ProjectRuntime["status"] | undefined) {
  switch (status) {
    case "running":
      return "border-primary/40 bg-primary/10 text-primary";
    case "starting":
      return "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";
    case "error":
      return "border-destructive/40 bg-destructive/10 text-destructive-foreground";
    default:
      return "border-border/50 bg-white/5 text-muted-foreground";
  }
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
        shell: "border-primary/20 bg-primary/[0.07]",
        icon: "bg-primary/15 text-primary",
        text: "text-primary",
        subtext: "text-primary/70",
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

function getOperationIcon(event: OperationEvent, className = "size-4") {
  if (event.status === "running") {
    return <LoaderCircle className={cn(className, "animate-spin")} />;
  }

  if (event.status === "success") {
    return <CheckCircle2 className={className} />;
  }

  return <RefreshCw className={className} />;
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
    message:
      diagnosis.readiness.warnings[0] ?? "当前项目还需要补全环境后才能启动。",
  };
}

export const ProjectCard = memo(function ProjectCard({
  project,
  runtime,
  runtimeFailureMessage,
  operationPanel,
  diagnosis,
  isDiagnosisPending,
  isStartPending,
  isStopPending,
  isStartLocked,
  isStopLocked,
  isEditLocked,
  isDeleteLocked,
  isDeleteNodeModulesLocked,
  isReinstallNodeModulesLocked,
  isTerminalLocked,
  isDirectoryLocked,
  isAddressLocked,
  isMoveGroupLocked,
  groupBadgeLabel,
  availableGroups,
  onDelete,
  onDeleteNodeModules,
  onEdit,
  onOpenDirectory,
  onOpenTerminalOutput,
  onOpenUrl,
  onReinstallNodeModules,
  onStart,
  onStop,
  onOpenMoveGroupDialog,
}: ProjectCardProps) {
  const status = runtime?.status ?? "stopped";
  const isRunning = status === "running";
  const isStarting = status === "starting";
  const [isImmediateStartPending, setIsImmediateStartPending] = useState(false);
  const [isImmediateStopPending, setIsImmediateStopPending] = useState(false);
  const stopPendingResetTimerRef = useRef<number | null>(null);
  const showImmediateStartPending =
    isImmediateStartPending && !isRunning && !isStarting && !isStopPending;
  const showImmediateStopPending =
    isImmediateStopPending && !isStartPending && !isStarting;
  const isStartingPulse = isStartPending || isStarting || showImmediateStartPending;
  const isStopping = isStopPending || showImmediateStopPending;
  const isBusy = isRunning || isStarting || isStopping;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuToggleLocked, setMenuToggleLocked] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const panelState = useMemo(
    () =>
      selectProjectCardPanelState({
        runtime,
        runtimeFailureMessage,
        operationPanel,
        diagnosis,
        isDiagnosisPending,
      }),
    [diagnosis, isDiagnosisPending, operationPanel, runtime, runtimeFailureMessage]
  );

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

  useEffect(() => {
    if (!isImmediateStartPending) {
      return;
    }

    if (isStartPending || isStarting || isRunning || !isStartLocked) {
      setIsImmediateStartPending(false);
    }
  }, [isImmediateStartPending, isRunning, isStartLocked, isStartPending, isStarting]);

  useEffect(() => {
    if (!isImmediateStopPending) {
      return;
    }

    if (!isRunning && stopPendingResetTimerRef.current) {
      window.clearTimeout(stopPendingResetTimerRef.current);
      stopPendingResetTimerRef.current = null;
    }

    if (isStopPending) {
      return;
    }

    if (!isRunning) {
      setIsImmediateStopPending(false);
      return;
    }

    if (!stopPendingResetTimerRef.current) {
      stopPendingResetTimerRef.current = window.setTimeout(() => {
        stopPendingResetTimerRef.current = null;
        setIsImmediateStopPending(false);
      }, 240);
    }
  }, [
    isImmediateStopPending,
    isRunning,
    isStartPending,
    isStarting,
    isStopPending,
  ]);

  useEffect(() => {
    return () => {
      if (stopPendingResetTimerRef.current) {
        window.clearTimeout(stopPendingResetTimerRef.current);
        stopPendingResetTimerRef.current = null;
      }
    };
  }, []);

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

  function handleOpenMoveGroupDialog() {
    setMenuOpen(false);
    onOpenMoveGroupDialog();
  }

  const operationTone =
    panelState.kind === "operation" ? getOperationTone(panelState.event.status) : null;
  const diagnosisTone =
    panelState.kind === "diagnosis" ? getDiagnosisTone(panelState.diagnosis) : null;
  const showStopLoading = isStopping;
  const showStartLoading = isStartPending || isStarting || showImmediateStartPending;
  const isShowingStopState = isRunning || showStopLoading;
  const isActionButtonDisabled =
    showStartLoading ||
    showStopLoading ||
    (isShowingStopState ? isStopLocked : isStartLocked);
  const actionButtonLabel = showStopLoading
    ? "停止中..."
    : showStartLoading
      ? "启动中..."
      : isRunning
        ? "停止"
        : "启动";

  const isShowMultiMarquee = isRunning && panelState.kind === "addresses";
  const isShowGreenMarquee = isStartingPulse || (isRunning && !isShowMultiMarquee);

  function handleActionButtonClick() {
    if (isActionButtonDisabled) {
      return;
    }

    if (isShowingStopState) {
      setIsImmediateStopPending(true);
      onStop();
      return;
    }

    setIsImmediateStartPending(true);
    onStart();
  }

  return (
    <Card
      className={cn(
        "group self-start overflow-hidden rounded-xl border-border/80 bg-black/40 py-0 shadow-2xl backdrop-blur-xl transition-all duration-500 glass-border hover-glow",
        isShowMultiMarquee && "running-marquee-multi !border-transparent",
        isShowGreenMarquee && "running-marquee-green !border-transparent"
      )}
    >
      <div className="border-b border-border/30 px-3.5 py-2.5 bg-white/2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="truncate text-sm font-bold tracking-wider text-foreground hover:text-primary transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                  onClick={onOpenDirectory}
                  disabled={isDirectoryLocked}
                >
                  {project.name}
                </button>
              </TooltipTrigger>
              <TooltipContent sideOffset={8}>打开项目目录</TooltipContent>
            </Tooltip>
            {groupBadgeLabel ? (
              <Badge
                variant="outline"
                className="max-w-[7rem] truncate border-primary/30 bg-primary/12 px-2 py-0 text-[10px] text-primary"
              >
                {groupBadgeLabel}
              </Badge>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5">
            {status !== "stopped" && (
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full px-2 py-0 text-[10px] flex items-center gap-1",
                  panelState.kind === "addresses" 
                    ? getStatusClassName("running") 
                    : (status === "running" || status === "starting") 
                      ? getStatusClassName("starting") 
                      : getStatusClassName(status)
                )}
              >
                {panelState.kind === "addresses" && (
                  <span className="relative flex size-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full size-1.5 bg-primary"></span>
                  </span>
                )}
                {panelState.kind === "addresses" 
                  ? "运行中" 
                  : (status === "starting" || status === "running") 
                    ? "启动中" 
                    : getProjectStatusLabel(status)}
              </Badge>
            )}

            <div
              ref={menuRef}
              className="relative"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground"
                onClick={handleToggleMenu}
                disabled={menuToggleLocked}
              >
                <EllipsisVertical className="size-4" />
              </Button>

              {menuOpen ? (
                <div className="absolute right-0 top-7 z-20 min-w-40 rounded-lg border border-border/80 bg-black/60 p-1.5 shadow-[0_8px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-white/8 disabled:opacity-50"
                    onClick={handleEdit}
                    disabled={isBusy || isEditLocked}
                  >
                    <Pencil className="size-4" />
                    编辑
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-white/8 disabled:opacity-50"
                    onClick={handleOpenMoveGroupDialog}
                    disabled={isMoveGroupLocked || availableGroups.length === 0}
                  >
                    <ArrowRightLeft className="size-4" />
                    切换分组
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-white/8 disabled:opacity-50"
                    onClick={handleReinstallDependencies}
                    disabled={isBusy || isReinstallNodeModulesLocked}
                  >
                    {isReinstallNodeModulesLocked ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    重装依赖
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-white/8 disabled:opacity-50"
                    onClick={handleDeleteDependencies}
                    disabled={isBusy || isDeleteNodeModulesLocked}
                  >
                    {isDeleteNodeModulesLocked ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    删除依赖
                  </button>
                  <div className="my-1 h-px bg-white/8" />
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-rose-100 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
                    onClick={handleDelete}
                    disabled={isBusy || isDeleteLocked}
                  >
                    <Trash2 className="size-4" />
                    移除项目
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="px-3.5">
        <div className="flex h-[9.8rem] items-center overflow-hidden rounded-lg bg-black/80 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] border border-white/5 transition-colors">
          {panelState.kind === "operation" && operationTone ? (
            <div
              className={cn(
                "flex h-full w-full flex-col justify-center flex-1 pointer-events-none px-4 py-3 transition-colors",
                operationTone.shell
              )}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full border border-border/50",
                      operationTone.icon
                    )}
                  >
                    {getOperationIcon(panelState.event, "size-4.5")}
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    {panelState.event.title}
                  </div>
                </div>
                <div className={cn("text-[11px] font-medium", operationTone.subtext)}>
                  {operationTone.badge}
                </div>
              </div>

              <div className={cn("line-clamp-2 text-sm leading-6", operationTone.text)}>
                {panelState.event.message ?? "正在处理中，请稍后..."}
              </div>
            </div>
          ) : panelState.kind === "failure" ? (
            <div className="flex h-full w-full flex-col justify-center flex-1 pointer-events-none border-rose-400/20 bg-rose-500/[0.07] px-4 py-3">
              <div className="mb-3 flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-full border border-border/50 bg-rose-500/15 text-rose-200">
                  <AlertTriangle className="size-4.5" />
                </div>
                <div className="text-sm font-semibold text-foreground">启动失败</div>
              </div>

              <div className="line-clamp-3 text-sm leading-6 text-rose-100">
                {panelState.message ?? getProjectRuntimeErrorMessage(runtime)}
              </div>
            </div>
          ) : panelState.kind === "diagnosis" && diagnosisTone ? (
            <div
              className={cn(
                "flex h-full w-full flex-col justify-center flex-1 pointer-events-none px-4 py-3 transition-colors",
                diagnosisTone.shell
              )}
            >
              <div className="mb-3 flex items-center gap-2">
                <div
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full border border-border/50",
                    diagnosisTone.icon
                  )}
                >
                  <CheckCircle2 className="size-4.5" />
                </div>
                <div className="text-sm font-semibold text-foreground">{diagnosisTone.title}</div>
              </div>

              <div className={cn("line-clamp-2 text-sm leading-6", diagnosisTone.text)}>
                {diagnosisTone.message}
              </div>

              {!panelState.diagnosis.readiness.canStart &&
              panelState.diagnosis.readiness.warnings.length > 1 ? (
                <div className={cn("mt-2 text-xs", diagnosisTone.subtext)}>
                  另外还有 {panelState.diagnosis.readiness.warnings.length - 1} 项需要处理。
                </div>
              ) : null}
            </div>
          ) : panelState.kind === "diagnosing" ? (
            <div className="flex h-full w-full flex-col justify-center flex-1 pointer-events-none border-primary/20 bg-primary/[0.06] px-4 py-3 transition-colors">
              <div className="mb-3 flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-full border border-border/50 bg-primary/15 text-primary">
                  <LoaderCircle className="size-4.5 animate-spin" />
                </div>
                <div className="text-sm font-semibold text-foreground">
                  正在检测启动环境...
                </div>
              </div>

              <div className="line-clamp-2 text-sm leading-6 text-primary">
                正在检查当前项目的 Node、包管理器和启动命令，请稍候...
              </div>
            </div>
          ) : panelState.kind === "addresses" ? (
            <div className="flex h-full w-full items-center justify-center px-3">
              <div className="w-full max-w-[22rem] space-y-2">
                {panelState.addresses.map((address) => (
                  <div 
                    key={address.url}
                    className="flex w-full items-center gap-1.5"
                  >
                    <button
                      type="button"
                      className="flex h-9 w-full flex-1 items-center justify-between gap-2.5 rounded-xl border border-border/30 bg-white/5 px-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/8 disabled:opacity-60"
                      onClick={() => onOpenUrl(address.url)}
                      disabled={isAddressLocked}
                    >
                      <span className="truncate font-mono text-xs text-foreground">
                        {address.url}
                      </span>
                      <ExternalLink className="size-4 shrink-0 text-primary" />
                    </button>
                    
                    <button
                      type="button"
                      className="flex size-9 items-center justify-center rounded-xl border border-border/30 bg-white/5 text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/8 hover:text-primary active:scale-90"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(address.url);
                        toast.success("链接已复制", {
                          duration: 1500,
                          position: "bottom-center"
                        });
                      }}
                    >
                      <Copy className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : panelState.kind === "terminal" ? (
            <div className="h-full w-full overflow-auto rounded-lg border border-border/50 bg-black/50 px-3 py-2 backdrop-blur-sm">
              {panelState.lines.length > 0 ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-[1.45] text-muted-foreground">
                  {panelState.lines.join("\n")}
                </pre>
              ) : (
                <div className="font-mono text-[10px] leading-[1.45] text-muted-foreground">
                  正在等待终端输出...
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-border/50 bg-black/10 px-3 text-[13px] text-muted-foreground">
              项目未启动
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/30 px-3.5 py-2.5">
        <Button
          type="button"
          size="default"
          variant="outline"
          className="h-9 px-4 text-xs"
          onClick={onOpenTerminalOutput}
          disabled={isTerminalLocked}
        >
          <TerminalSquare className="size-4" />
          终端
        </Button>

        <Button
          type="button"
          size="default"
          variant={isShowingStopState ? "destructive" : "default"}
          className={cn(
            "h-9 gap-1.5 px-4 transition-all active:scale-95",
            isShowingStopState && "shadow-[0_0_15px_rgba(251,86,91,0.15)]"
          )}
          onClick={handleActionButtonClick}
          disabled={isActionButtonDisabled}
        >
          {showStopLoading || showStartLoading ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : isShowingStopState ? (
            <Square className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
          <span className="text-xs">{actionButtonLabel}</span>
        </Button>
      </div>
    </Card>
  );
}, areProjectCardPropsEqual);
