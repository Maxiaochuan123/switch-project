export const IPC_CHANNELS = {
  listProjects: "projects:list",
  saveProject: "projects:save",
  deleteProject: "projects:delete",
  startProject: "projects:start",
  stopProject: "projects:stop",
  getEnvironment: "environment:get",
  browseProjectDirectory: "project-directory:browse",
  runtimeUpdate: "runtime:update",
} as const;

export type ProjectStatus = "stopped" | "starting" | "running" | "error";

export type ProjectConfig = {
  id: string;
  name: string;
  path: string;
  nodeVersion: string;
  startCommand: string;
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
  recentLogs?: ProjectLogEntry[];
};

export type DesktopEnvironment = {
  installedNodeVersions: string[];
  nvmHome: string | null;
};

export function normalizeNodeVersion(version: string) {
  return version.trim().replace(/^v/i, "");
}

export type DesktopApi = {
  listProjects: () => Promise<ProjectConfig[]>;
  saveProject: (project: ProjectConfig) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  startProject: (projectId: string) => Promise<void>;
  stopProject: (projectId: string) => Promise<void>;
  getEnvironment: () => Promise<DesktopEnvironment>;
  browseProjectDirectory: (initialPath?: string) => Promise<string | null>;
  copyText: (value: string) => void;
  subscribeRuntime: (listener: (runtime: ProjectRuntime) => void) => () => void;
};
