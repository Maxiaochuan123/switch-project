import { getDefaultErrorMessage } from "@/lib/ui-copy";
import type {
  OperationEvent,
  OperationStatus,
  OperationType,
  ProjectRuntime,
} from "@/shared/contracts";

export type Feedback = {
  variant: "default" | "destructive";
  title: string;
  message: string;
};

export function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : getDefaultErrorMessage();
}

function normalizeToastCopy(value: string) {
  return value
    .trim()
    .replace(/[，。！？,.!?\s]+/g, "")
    .toLowerCase();
}

function buildToastDescription(title: string, description?: string | null) {
  if (!description) {
    return undefined;
  }

  const normalizedTitle = normalizeToastCopy(title);
  const normalizedDescription = normalizeToastCopy(description);

  if (!normalizedDescription) {
    return undefined;
  }

  if (
    normalizedDescription === normalizedTitle ||
    normalizedDescription.startsWith(normalizedTitle) ||
    normalizedTitle.startsWith(normalizedDescription)
  ) {
    return undefined;
  }

  return description;
}

function getOperationFallbackDescription(event: OperationEvent) {
  const projectName = event.projectName ?? "当前项目";

  switch (event.status) {
    case "running":
      return `${projectName} 正在处理中，请稍后...`;
    case "success":
      return `${projectName} 操作已完成。`;
    default:
      return undefined;
  }
}

export function getToastContent(title: string, description?: string | null) {
  return buildToastDescription(title, description) ?? title;
}

export function isProjectRuntimeActive(status?: ProjectRuntime["status"]) {
  return status === "running" || status === "starting";
}

export function isDependencyOperationBusy(status?: OperationStatus) {
  return status === "queued" || status === "running";
}

export function isDependencyOperationEvent(type: OperationType) {
  return type === "dependency-delete" || type === "dependency-reinstall";
}

export function getOperationPanelMessage(event: OperationEvent) {
  const projectName = event.projectName ?? "当前项目";

  if (event.status === "queued" && event.title === "当前项目还没有安装依赖") {
    return `${projectName} 当前还没有安装依赖，启动项目时会自动安装。`;
  }

  if (event.type === "dependency-delete") {
    switch (event.status) {
      case "running":
        return `正在删除 ${projectName} 依赖，请稍后...`;
      case "success":
        return `${projectName} 依赖已删除。`;
      case "error":
        return event.error?.message ?? event.message ?? `删除 ${projectName} 依赖失败。`;
      default:
        break;
    }
  }

  if (event.type === "dependency-reinstall") {
    switch (event.status) {
      case "running":
        return `正在重装 ${projectName} 依赖，请稍后...`;
      case "success":
        return `${projectName} 依赖已重装完成。`;
      case "error":
        return event.error?.message ?? event.message ?? `重装 ${projectName} 依赖失败。`;
      default:
        break;
    }
  }

  if (event.type === "node-install") {
    switch (event.status) {
      case "running":
        return `正在为 ${projectName} 安装 Node 版本，请稍后...`;
      case "success":
        return `${projectName} 所需的 Node 版本已安装完成。`;
      case "error":
        return event.error?.message ?? event.message ?? `${projectName} 的 Node 版本安装失败。`;
      default:
        break;
    }
  }

  return (
    buildToastDescription(
      event.title,
      event.status === "error"
        ? event.error?.message ?? event.message ?? getDefaultErrorMessage()
        : event.message ?? getOperationFallbackDescription(event)
    ) ?? undefined
  );
}
