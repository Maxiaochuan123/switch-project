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
  nvmHome: string | null;
};

export type ProjectNodeVersionSource =
  | "nvmrc"
  | "node-version"
  | "volta"
  | "package-engines"
  | null;

export type ProjectPackageManager = "npm" | "pnpm" | "yarn" | null;

export type ProjectCommandSuggestion = {
  scriptName: string;
  command: string;
  recommended: boolean;
};

export type ProjectDirectoryInspection = {
  exists: boolean;
  isDirectory: boolean;
  hasPackageJson: boolean;
  suggestedName: string | null;
  recommendedNodeVersion: string | null;
  nodeVersionHint: string | null;
  nodeVersionSource: ProjectNodeVersionSource;
  packageManager: ProjectPackageManager;
  recommendedStartCommand: string | null;
  availableStartCommands: ProjectCommandSuggestion[];
};

export type AppStartupSettings = {
  openAtLogin: boolean;
  launchMinimizedOnLogin: boolean;
};

export type AppCloseRequest = {
  activeProjectCount: number;
  activeProjectNames: string[];
};

export const DEFAULT_APP_STARTUP_SETTINGS: AppStartupSettings = {
  openAtLogin: false,
  launchMinimizedOnLogin: false,
};

export function normalizeNodeVersion(version: string) {
  return version.trim().replace(/^v/i, "");
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
  copyText: (value: string) => void;
  subscribeRuntime: (listener: (runtime: ProjectRuntime) => void) => () => void;
  subscribeAppCloseRequest: (listener: (request: AppCloseRequest) => void) => () => void;
  confirmAppClose: () => Promise<void>;
  cancelAppClose: () => Promise<void>;
};
