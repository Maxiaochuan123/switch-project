import { useEffect, useRef, useState } from "react";
import {
  Check,
  Clock3,
  Copy,
  FileText,
  FolderOpen,
  Pencil,
  Play,
  Power,
  Square,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ProjectConfig, ProjectRuntime } from "@/shared/contracts";

type ProjectCardProps = {
  project: ProjectConfig;
  nodeVersionInstalled: boolean;
  runtime?: ProjectRuntime;
  onEdit: () => void;
  onDelete: () => void;
  onViewLogs: () => void;
  onStart: () => void;
  onStop: () => void;
};

function formatTimestamp(timestamp?: string) {
  if (!timestamp) {
    return "未启动";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function getStatusMeta(status: ProjectRuntime["status"] | undefined) {
  switch (status) {
    case "running":
      return {
        label: "运行中",
        className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
      };
    case "starting":
      return {
        label: "启动中",
        className: "border-sky-400/20 bg-sky-400/10 text-sky-100",
      };
    case "error":
      return {
        label: "异常",
        className: "border-rose-400/20 bg-rose-400/10 text-rose-100",
      };
    default:
      return {
        label: "已停止",
        className: "border-white/10 bg-white/5 text-muted-foreground",
      };
  }
}

export function ProjectCard({
  project,
  nodeVersionInstalled,
  runtime,
  onDelete,
  onEdit,
  onViewLogs,
  onStart,
  onStop,
}: ProjectCardProps) {
  const status = runtime?.status ?? "stopped";
  const statusMeta = getStatusMeta(status);
  const isRunning = status === "running";
  const isStarting = status === "starting";
  const isBusy = isRunning || isStarting;
  const canStart = !isStarting && !isRunning && nodeVersionInstalled;
  const previewMessage = runtime?.lastMessage?.trim() ?? "";
  const showOutputPanel = status !== "stopped" || Boolean(previewMessage);
  const outputTitle = status === "error" ? "最近错误" : "最近输出";
  const outputPlaceholder = isStarting
    ? "正在等待项目输出..."
    : isRunning
      ? "运行中，等待新的输出..."
      : "暂无输出";
  const [copiedField, setCopiedField] = useState<"path" | "command" | null>(null);
  const copiedResetRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedResetRef.current) {
        window.clearTimeout(copiedResetRef.current);
      }
    };
  }, []);

  function handleCopy(field: "path" | "command", value: string) {
    window.switchProjectApi.copyText(value);
    setCopiedField(field);

    if (copiedResetRef.current) {
      window.clearTimeout(copiedResetRef.current);
    }

    copiedResetRef.current = window.setTimeout(() => {
      setCopiedField(null);
      copiedResetRef.current = null;
    }, 1600);
  }

  return (
    <Card className="gap-4 overflow-hidden border-white/10 bg-white/6 py-0 shadow-xl shadow-black/15 backdrop-blur-sm transition-colors hover:border-primary/30">
      <CardHeader className="gap-3 border-b border-white/8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle className="text-xl font-semibold tracking-tight">
              {project.name}
            </CardTitle>
            <div className="flex flex-wrap items-start gap-2">
              <CardDescription className="max-w-[34rem] break-all font-mono text-xs text-muted-foreground/90">
                {project.path}
              </CardDescription>
              <Button
                variant="ghost"
                size="xs"
                className="h-6 px-2"
                onClick={() => handleCopy("path", project.path)}
              >
                {copiedField === "path" ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copiedField === "path" ? "已复制" : "复制路径"}
              </Button>
            </div>
          </div>
          <CardAction className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn("rounded-full px-3 py-1", statusMeta.className)}
            >
              {statusMeta.label}
            </Badge>
          </CardAction>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-6 pb-0">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-black/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <Power className="size-3.5" />
              Node 版本
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-lg font-medium text-foreground">
                v{project.nodeVersion}
              </p>
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full",
                  nodeVersionInstalled
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                    : "border-amber-400/20 bg-amber-400/10 text-amber-100"
                )}
              >
                {nodeVersionInstalled ? "已安装" : "缺失"}
              </Badge>
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <Clock3 className="size-3.5" />
              最近启动
            </div>
            <p className="font-mono text-lg font-medium text-foreground">
              {formatTimestamp(runtime?.startedAt)}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-black/10 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <TerminalSquare className="size-3.5" />
              启动命令
            </div>
            <Button
              variant="ghost"
              size="xs"
              className="h-6 px-2"
              onClick={() => handleCopy("command", project.startCommand)}
            >
              {copiedField === "command" ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copiedField === "command" ? "已复制" : "复制命令"}
            </Button>
          </div>
          <p className="font-mono text-sm text-foreground">{project.startCommand}</p>
        </div>

        {showOutputPanel ? (
          <div
            className={cn(
              "rounded-2xl border bg-black/10 p-4 transition-colors",
              status === "error"
                ? "border-rose-400/20"
                : "border-white/8"
            )}
          >
            <div
              className={cn(
                "mb-2 text-sm font-medium",
                status === "error" ? "text-rose-100" : "text-foreground"
              )}
            >
              {outputTitle}
            </div>
            <p className="min-h-12 break-all font-mono text-xs leading-6 text-muted-foreground">
              {previewMessage || outputPlaceholder}
            </p>
          </div>
        ) : null}

        {!nodeVersionInstalled ? (
          <Alert className="border-white/8 bg-black/10">
            <AlertTitle>Node 版本未安装</AlertTitle>
            <AlertDescription className="font-mono text-xs break-all">
              请先执行 `nvm install {project.nodeVersion}`，再启动这个项目。
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>

      <Separator className="mt-2 bg-white/8" />

      <CardFooter className="flex flex-wrap items-center justify-between gap-3 py-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FolderOpen className="size-3.5" />
          PID {runtime?.pid ?? "无"}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isRunning ? "secondary" : "default"}
                size="sm"
                onClick={isRunning ? onStop : onStart}
                disabled={isRunning ? isStarting : !canStart}
              >
                {isRunning ? <Square className="size-4" /> : <Play className="size-4" />}
                {isRunning ? "停止" : isStarting ? "启动中" : "启动"}
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={8}>
              {isRunning
                ? "停止当前正在运行的项目。"
                : nodeVersionInstalled
                  ? "使用当前项目配置的 Node 版本启动。"
                  : `请先安装 v${project.nodeVersion} 再启动。`}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={onViewLogs}>
                <FileText className="size-4" />
                日志
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={8}>
              查看这个项目的最近运行日志。
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={onEdit} disabled={isBusy}>
                <Pencil className="size-4" />
                编辑
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={8}>
              先停止项目，再修改它的配置。
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-rose-500/20 text-rose-100 hover:bg-rose-500/10"
                onClick={onDelete}
                disabled={isBusy}
              >
                <Trash2 className="size-4" />
                移除
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={8}>
              先停止项目，再把它从面板中移除。
            </TooltipContent>
          </Tooltip>
        </div>
      </CardFooter>
    </Card>
  );
}
