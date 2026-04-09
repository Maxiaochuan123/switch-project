export const IPC_CHANNELS = {
  listProjects: "projects:list",
  saveProject: "projects:save",
  deleteProject: "projects:delete",
  listRuntimes: "runtimes:list",
  inspectProjectDirectory: "project-directory:inspect",
  getAppStartupSettings: "app-startup:get",
  saveAppStartupSettings: "app-startup:save",
  startProject: "projects:start",
  stopProject: "projects:stop",
  openProjectDirectory: "project-directory:open",
  openProjectTerminal: "project-terminal:open",
  openExternal: "external:open",
  getEnvironment: "environment:get",
  browseProjectDirectory: "project-directory:browse",
  runtimeUpdate: "runtime:update",
  appCloseRequested: "app-close:requested",
  confirmAppClose: "app-close:confirm",
  cancelAppClose: "app-close:cancel",
} as const;

export type ProjectStatus = "stopped" | "starting" | "running" | "error";

export type ProjectConfig = {
  id: string;
  name: string;
  path: string;
  nodeVersion: string;
  packageManager: ProjectPackageManager;
  startCommand: string;
  autoStartOnAppLaunch: boolean;
  autoOpenLocalUrlOnStart: boolean;
};

export type ProjectAddressKind = "local" | "network" | "other";

export type ProjectAddress = {
  url: string;
  kind: ProjectAddressKind;
  label: string;
  discoveredAt: string;
};

export type ProjectLogLevel = "stdout" | "stderr" | "system";

export type ProjectLogEntry = {
  id: string;
  at: string;
  level: ProjectLogLevel;
  message: string;
};

export type ProjectRuntime = {
  projectId: string;
  status: ProjectStatus;
  pid?: number;
  startedAt?: string;
  exitCode?: number;
  lastMessage?: string;
  detectedUrl?: string;
  detectedAddresses?: ProjectAddress[];
  startupDurationMs?: number;
  lastSuccessAt?: string;
  recentLogs?: ProjectLogEntry[];
};

export type DesktopEnvironment = {
  installedNodeVersions: string[];
  activeNodeVersion: string | null;
  availablePackageManagers: ProjectPackageManager[];
  rimrafInstalled: boolean;
  nvmHome: string | null;
};

export type BackendErrorCode =
  | "unknown"
  | "invalid-project"
  | "project-not-found"
  | "project-running"
  | "project-path-missing"
  | "node-version-missing"
  | "package-manager-missing"
  | "start-command-missing"
  | "nvm-missing"
  | "store-read-failed"
  | "store-write-failed"
  | "import-failed"
  | "export-failed";

export type BackendError = {
  code: BackendErrorCode;
  message: string;
  detail?: string;
};

export type ProjectNodeVersionSource =
  | "nvmrc"
  | "node-version"
  | "volta"
  | "package-engines"
  | null;

export type ProjectPackageManager = "npm" | "pnpm" | "cnpm" | "yarn";

export type ProjectCommandSuggestion = {
  scriptName: string;
  command: string;
  recommended: boolean;
};

export type ProjectDirectoryInspection = {
  exists: boolean;
  isDirectory: boolean;
  hasPackageJson: boolean;
  hasNodeModules: boolean;
  suggestedName: string | null;
  recommendedNodeVersion: string | null;
  nodeVersionHint: string | null;
  nodeVersionSource: ProjectNodeVersionSource;
  packageManager: ProjectPackageManager | null;
  recommendedStartCommand: string | null;
  availableStartCommands: ProjectCommandSuggestion[];
  readiness: ProjectReadiness;
};

export type ProjectReadiness = {
  nodeInstalled: boolean;
  packageManagerAvailable: boolean;
  hasNodeModules: boolean;
  canStart: boolean;
  warnings: string[];
};

export type ProjectDiagnosis = {
  projectId: string;
  projectName: string;
  readiness: ProjectReadiness;
  pathExists: boolean;
  hasPackageJson: boolean;
  startCommandAvailable: boolean;
  nodeVersion: string;
  packageManager: ProjectPackageManager;
  startCommand: string;
};

export type AppStartupSettings = {
  openAtLogin: boolean;
  launchMinimizedOnLogin: boolean;
};

export type AppCloseRequest = {
  activeProjectCount: number;
  activeProjectNames: string[];
};

export type DependencyOperation = "delete" | "reinstall";

export type OperationType =
  | "dependency-delete"
  | "dependency-reinstall"
  | "node-install"
  | "project-start-preflight"
  | "project-diagnose";

export type OperationStatus = "queued" | "running" | "success" | "error";

export type OperationEvent = {
  operationId: string;
  type: OperationType;
  status: OperationStatus;
  title: string;
  projectId?: string;
  projectName?: string;
  message?: string;
  error?: BackendError;
};

export type ImportProjectsResult = {
  added: number;
  updated: number;
  skipped: number;
};

export const PACKAGE_MANAGERS: ProjectPackageManager[] = [
  "npm",
  "pnpm",
  "cnpm",
  "yarn",
];

export const DEFAULT_APP_STARTUP_SETTINGS: AppStartupSettings = {
  openAtLogin: false,
  launchMinimizedOnLogin: false,
};

export function normalizeNodeVersion(version: string) {
  return version.trim().replace(/^v/i, "");
}

export function buildRunCommand(packageManager: ProjectPackageManager, scriptName: string) {
  return packageManager === "npm" || packageManager === "cnpm"
    ? `${packageManager} run ${scriptName}`
    : `${packageManager} ${scriptName}`;
}

export function buildInstallCommand(packageManager: ProjectPackageManager) {
  return packageManager === "npm" || packageManager === "cnpm"
    ? `${packageManager} install`
    : `${packageManager} install`;
}

export function getPackageManagerLabel(packageManager: ProjectPackageManager) {
  return packageManager;
}

export function normalizeAppStartupSettings(
  settings?: Partial<AppStartupSettings> | null
): AppStartupSettings {
  return {
    openAtLogin: settings?.openAtLogin === true,
    launchMinimizedOnLogin: settings?.launchMinimizedOnLogin === true,
  };
}

export type DesktopApi = {
  listProjects: () => Promise<ProjectConfig[]>;
  saveProject: (project: ProjectConfig) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  listRuntimes: () => Promise<ProjectRuntime[]>;
  diagnoseProject: (projectId: string) => Promise<ProjectDiagnosis>;
  inspectProjectDirectory: (
    projectPath: string
  ) => Promise<ProjectDirectoryInspection>;
  getAppStartupSettings: () => Promise<AppStartupSettings>;
  saveAppStartupSettings: (settings: AppStartupSettings) => Promise<void>;
  startProject: (projectId: string) => Promise<void>;
  stopProject: (projectId: string) => Promise<void>;
  openProjectDirectory: (projectPath: string) => Promise<void>;
  openProjectTerminal: (projectPath: string, nodeVersion: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  getEnvironment: () => Promise<DesktopEnvironment>;
  browseProjectDirectory: (initialPath?: string) => Promise<string | null>;
  importProjects: (filePath: string) => Promise<ImportProjectsResult>;
  exportProjects: (filePath: string) => Promise<void>;
  installNodeVersion: (version: string) => Promise<void>;
  minimizeAppToTray: () => Promise<void>;
  ensureDeleteTool: () => Promise<boolean>;
  deleteProjectNodeModules: (projectId: string) => Promise<void>;
  reinstallProjectNodeModules: (projectId: string) => Promise<void>;
  copyText: (value: string) => void;
  subscribeRuntime: (listener: (runtime: ProjectRuntime) => void) => () => void;
  subscribeAppCloseRequest: (listener: (request: AppCloseRequest) => void) => () => void;
  confirmAppClose: () => Promise<void>;
  cancelAppClose: () => Promise<void>;
  subscribeOperation: (
    listener: (event: OperationEvent) => void
  ) => () => void;
};
