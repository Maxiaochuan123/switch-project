import type {
  AppCloseRequest,
  AppStartupSettings,
  DesktopEnvironment,
  ImportProjectsResult,
  NodeManagerInstallResult,
  OperationEvent,
  ProjectConfig,
  ProjectDiagnosis,
  ProjectDirectoryInspection,
  ProjectPackageManager,
  ProjectPanelSnapshot,
  ProjectRuntime,
  ProjectStartPreflight,
} from "./contracts.generated";

export * from "./contracts.generated";

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
  getProjectPanelSnapshot: () => Promise<ProjectPanelSnapshot>;
  listRuntimes: () => Promise<ProjectRuntime[]>;
  diagnoseProject: (projectId: string) => Promise<ProjectDiagnosis>;
  diagnoseProjects: (projectIds: string[]) => Promise<ProjectDiagnosis[]>;
  preflightProjectStart: (projectId: string) => Promise<ProjectStartPreflight>;
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
  installNodeManager: () => Promise<NodeManagerInstallResult>;
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
