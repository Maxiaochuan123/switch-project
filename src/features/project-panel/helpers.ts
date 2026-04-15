import { getDefaultErrorMessage } from "@/lib/ui-copy";
import type {
  AppStartupSettings,
  DesktopEnvironment,
  OperationEvent,
  OperationStatus,
  OperationType,
  ProjectAddress,
  ProjectConfig,
  ProjectDiagnosis,
  ProjectLogEntry,
  ProjectRuntime,
} from "@/shared/contracts";

export type Feedback = {
  variant: "default" | "destructive";
  title: string;
  message: string;
};

const STARTUP_TIMING_LOG_PREFIXES = ["启动耗时拆解", "启动未完成，耗时拆解"] as const;

function extractErrorText(error: unknown, key: "message" | "detail") {
  if (!error || typeof error !== "object") {
    return null;
  }

  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export type ProjectCardPanelState =
  | {
      kind: "operation";
      event: OperationEvent;
    }
  | {
      kind: "failure";
      message: string;
    }
  | {
      kind: "diagnosis";
      diagnosis: ProjectDiagnosis;
    }
  | {
      kind: "diagnosing";
    }
  | {
      kind: "addresses";
      addresses: ProjectAddress[];
    }
  | {
      kind: "terminal";
      lines: string[];
    }
  | {
      kind: "idle";
    };

export function getErrorMessage(error: unknown) {
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  const detail = extractErrorText(error, "detail");
  if (detail) {
    return detail;
  }

  const message = extractErrorText(error, "message");
  if (message) {
    return message;
  }

  return error instanceof Error && error.message.trim()
    ? error.message
    : getDefaultErrorMessage();
}

function normalizeToastCopy(value: string) {
  return value.trim().replace(/[，。！？,.!?\s]+/g, "").toLowerCase();
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

export function areOperationEventsEqual(left?: OperationEvent, right?: OperationEvent) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

  return (
    left.operationId === right.operationId &&
    left.type === right.type &&
    left.status === right.status &&
    left.title === right.title &&
    left.projectId === right.projectId &&
    left.projectName === right.projectName &&
    left.message === right.message &&
    left.error?.code === right.error?.code &&
    left.error?.message === right.error?.message &&
    left.error?.detail === right.error?.detail
  );
}

export function areProjectRuntimesEqual(left?: ProjectRuntime, right?: ProjectRuntime) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

  if (
    left.projectId !== right.projectId ||
    left.status !== right.status ||
    left.pid !== right.pid ||
    left.startedAt !== right.startedAt ||
    left.exitCode !== right.exitCode ||
    left.lastMessage !== right.lastMessage ||
    left.failureMessage !== right.failureMessage ||
    left.failureCode !== right.failureCode ||
    left.suggestedNodeVersion !== right.suggestedNodeVersion ||
    left.detectedUrl !== right.detectedUrl ||
    left.startupDurationMs !== right.startupDurationMs ||
    left.lastSuccessAt !== right.lastSuccessAt
  ) {
    return false;
  }

  const leftAddresses = left.detectedAddresses ?? [];
  const rightAddresses = right.detectedAddresses ?? [];
  if (leftAddresses.length !== rightAddresses.length) {
    return false;
  }

  for (let index = 0; index < leftAddresses.length; index += 1) {
    const leftAddress = leftAddresses[index];
    const rightAddress = rightAddresses[index];
    if (
      !leftAddress ||
      !rightAddress ||
      leftAddress.url !== rightAddress.url ||
      leftAddress.kind !== rightAddress.kind ||
      leftAddress.label !== rightAddress.label
    ) {
      return false;
    }
  }

  const leftLogs = left.recentLogs ?? [];
  const rightLogs = right.recentLogs ?? [];
  if (leftLogs.length !== rightLogs.length) {
    return false;
  }

  if (leftLogs.length === 0) {
    return true;
  }

  const leftLastLog = leftLogs[leftLogs.length - 1];
  const rightLastLog = rightLogs[rightLogs.length - 1];
  return (
    leftLastLog?.id === rightLastLog?.id &&
    leftLastLog?.message === rightLastLog?.message &&
    leftLastLog?.level === rightLastLog?.level
  );
}

export function areProjectDiagnosesEqual(left?: ProjectDiagnosis, right?: ProjectDiagnosis) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

  if (
    left.projectId !== right.projectId ||
    left.projectName !== right.projectName ||
    left.pathExists !== right.pathExists ||
    left.hasPackageJson !== right.hasPackageJson ||
    left.startCommandAvailable !== right.startCommandAvailable ||
    left.nodeVersion !== right.nodeVersion ||
    left.packageManager !== right.packageManager ||
    left.startCommand !== right.startCommand ||
    left.readiness.canStart !== right.readiness.canStart ||
    left.readiness.nodeInstalled !== right.readiness.nodeInstalled ||
    left.readiness.packageManagerAvailable !== right.readiness.packageManagerAvailable ||
    left.readiness.hasNodeModules !== right.readiness.hasNodeModules ||
    left.readiness.warnings.length !== right.readiness.warnings.length
  ) {
    return false;
  }

  return left.readiness.warnings.every(
    (warning, index) => warning === right.readiness.warnings[index]
  );
}

export function areProjectRuntimeMapsEqual(
  left: Record<string, ProjectRuntime>,
  right: Record<string, ProjectRuntime>
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (!areProjectRuntimesEqual(left[key], right[key])) {
      return false;
    }
  }

  return true;
}

export function areProjectConfigsEqual(left?: ProjectConfig, right?: ProjectConfig) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

  return (
    left.id === right.id &&
    left.name === right.name &&
    left.path === right.path &&
    left.groupId === right.groupId &&
    left.nodeVersion === right.nodeVersion &&
    left.packageManager === right.packageManager &&
    left.startCommand === right.startCommand &&
    left.autoStartOnAppLaunch === right.autoStartOnAppLaunch &&
    left.autoOpenLocalUrlOnStart === right.autoOpenLocalUrlOnStart
  );
}

export function areProjectListsEqual(left: ProjectConfig[], right: ProjectConfig[]) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!areProjectConfigsEqual(left[index], right[index])) {
      return false;
    }
  }

  return true;
}

export function areDesktopEnvironmentsEqual(left: DesktopEnvironment, right: DesktopEnvironment) {
  if (left === right) {
    return true;
  }

  if (
    left.activeNodeVersion !== right.activeNodeVersion ||
    left.rimrafInstalled !== right.rimrafInstalled ||
    left.nodeManager !== right.nodeManager ||
    left.nodeManagerAvailable !== right.nodeManagerAvailable ||
    left.nodeManagerVersion !== right.nodeManagerVersion
  ) {
    return false;
  }

  if (left.installedNodeVersions.length !== right.installedNodeVersions.length) {
    return false;
  }

  for (let index = 0; index < left.installedNodeVersions.length; index += 1) {
    if (left.installedNodeVersions[index] !== right.installedNodeVersions[index]) {
      return false;
    }
  }

  if (left.nvmInstalledNodeVersions.length !== right.nvmInstalledNodeVersions.length) {
    return false;
  }

  for (let index = 0; index < left.nvmInstalledNodeVersions.length; index += 1) {
    if (left.nvmInstalledNodeVersions[index] !== right.nvmInstalledNodeVersions[index]) {
      return false;
    }
  }

  if (left.availablePackageManagers.length !== right.availablePackageManagers.length) {
    return false;
  }

  for (let index = 0; index < left.availablePackageManagers.length; index += 1) {
    if (left.availablePackageManagers[index] !== right.availablePackageManagers[index]) {
      return false;
    }
  }

  return true;
}

export function areAppStartupSettingsEqual(
  left: AppStartupSettings,
  right: AppStartupSettings
) {
  return (
    left.openAtLogin === right.openAtLogin &&
    left.launchMinimizedOnLogin === right.launchMinimizedOnLogin
  );
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
        return (
          event.error?.message ??
          event.message ??
          `${projectName} 的 Node 版本安装失败。`
        );
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

export function getProjectRuntimeErrorMessage(runtime?: ProjectRuntime) {
  if (!runtime) {
    return "启动失败，请查看终端输出。";
  }

  if (runtime.failureMessage?.trim()) {
    return runtime.failureMessage.trim();
  }

  const recentLogMessage = [...(runtime.recentLogs ?? [])]
    .reverse()
    .map((entry) => entry.message.trim())
    .find(Boolean);

  return runtime.lastMessage?.trim() || recentLogMessage || "启动失败，请查看终端输出。";
}

export function isStartupTimingLogMessage(message: string) {
  const trimmedMessage = message.trim();
  return STARTUP_TIMING_LOG_PREFIXES.some((prefix) =>
    trimmedMessage.startsWith(prefix)
  );
}

export function getLatestStartupTimingSummary(logs: ProjectLogEntry[] | undefined) {
  if (!logs?.length) {
    return null;
  }

  return (
    [...logs]
      .reverse()
      .map((entry) => entry.message.trim())
      .find((message) => isStartupTimingLogMessage(message)) ?? null
  );
}

export function getStartupTimingSummaryParts(summary: string | null) {
  if (!summary) {
    return [];
  }

  return summary
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function getProjectTerminalText(logs: ProjectLogEntry[] | undefined) {
  if (!logs?.length) {
    return "";
  }

  return logs
    .map((entry) => entry.message.trimEnd())
    .filter((message) => Boolean(message) && !isStartupTimingLogMessage(message))
    .join("\n");
}

export function getProjectTerminalPreview(logs: ProjectLogEntry[] | undefined) {
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

type SelectProjectCardPanelStateInput = {
  runtime?: ProjectRuntime;
  runtimeFailureMessage?: string;
  operationPanel?: OperationEvent;
  diagnosis?: ProjectDiagnosis;
  isDiagnosisPending?: boolean;
};

export function selectProjectCardPanelState({
  runtime,
  runtimeFailureMessage,
  operationPanel,
  diagnosis,
  isDiagnosisPending,
}: SelectProjectCardPanelStateInput): ProjectCardPanelState {
  if (operationPanel) {
    return { kind: "operation", event: operationPanel };
  }

  if (runtimeFailureMessage || runtime?.status === "error") {
    return {
      kind: "failure",
      message: runtimeFailureMessage ?? getProjectRuntimeErrorMessage(runtime),
    };
  }

  const isBusy = runtime?.status === "running" || runtime?.status === "starting";
  const addresses = runtime?.detectedAddresses ?? [];

  if (isBusy && addresses.length > 0) {
    return { kind: "addresses", addresses };
  }

  if (isBusy) {
    return {
      kind: "terminal",
      lines: getProjectTerminalPreview(runtime?.recentLogs),
    };
  }

  if (diagnosis) {
    return { kind: "diagnosis", diagnosis };
  }

  if (isDiagnosisPending) {
    return { kind: "diagnosing" };
  }

  return { kind: "idle" };
}
