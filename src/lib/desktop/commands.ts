import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open } from "@tauri-apps/plugin-dialog";
import {
  normalizeAppStartupSettings,
  type AppStartupSettings,
  type DesktopApi,
  type DesktopEnvironment,
  type ImportProjectsResult,
  type ProjectConfig,
  type ProjectDiagnosis,
  type ProjectDirectoryInspection,
  type ProjectPanelSnapshot,
  type ProjectStartPreflight,
  type ProjectRuntime,
} from "@/shared/contracts";
import { invokeCommand } from "./invoke";

export const desktopCommands: Omit<
  DesktopApi,
  "subscribeRuntime" | "subscribeAppCloseRequest" | "subscribeOperation"
> = {
  listProjects: () => invokeCommand<ProjectConfig[]>("list_projects"),
  getProjectPanelSnapshot: () =>
    invokeCommand<ProjectPanelSnapshot>("get_project_panel_snapshot"),
  saveProject: (project) => invokeCommand("save_project", { project }),
  deleteProject: (projectId) => invokeCommand("delete_project", { projectId }),
  listRuntimes: () => invokeCommand<ProjectRuntime[]>("list_runtimes"),
  diagnoseProject: (projectId) =>
    invokeCommand<ProjectDiagnosis>("diagnose_project", { projectId }),
  diagnoseProjects: (projectIds) =>
    invokeCommand<ProjectDiagnosis[]>("diagnose_projects", { projectIds }),
  preflightProjectStart: (projectId) =>
    invokeCommand<ProjectStartPreflight>("preflight_project_start", { projectId }),
  inspectProjectDirectory: (projectPath) =>
    invokeCommand<ProjectDirectoryInspection>("inspect_project_directory", { projectPath }),
  getAppStartupSettings: async () => {
    const [storedSettings, openAtLogin] = await Promise.all([
      invokeCommand<AppStartupSettings>("get_app_startup_settings"),
      isEnabled(),
    ]);

    return normalizeAppStartupSettings({
      ...storedSettings,
      openAtLogin,
    });
  },
  saveAppStartupSettings: async (settings) => {
    const normalizedSettings = normalizeAppStartupSettings(settings);

    // Try to update autostart status, but don't block the rest of the settings if it fails
    try {
      if (normalizedSettings.openAtLogin) {
        await enable();
      } else {
        await disable();
      }
    } catch (error) {
      console.error("Failed to update autostart status:", error);
    }

    await invokeCommand("save_app_startup_settings", { settings: normalizedSettings });
  },
  startProject: (projectId) => invokeCommand("start_project", { projectId }),
  stopProject: (projectId) => invokeCommand("stop_project", { projectId }),
  openProjectDirectory: (projectPath) => invokeCommand("open_project_directory", { projectPath }),
  openProjectTerminal: (projectPath, nodeVersion) =>
    invokeCommand("open_project_terminal", { projectPath, nodeVersion }),
  openExternal: (url) => invokeCommand("open_external", { url }),
  getEnvironment: () => invokeCommand<DesktopEnvironment>("get_environment"),
  browseProjectDirectory: async (initialPath) => {
    const selectedPath = await open({
      directory: true,
      multiple: false,
      defaultPath: initialPath?.trim() || undefined,
    });

    return typeof selectedPath === "string" ? selectedPath : null;
  },
  importProjects: (filePath) => invokeCommand<ImportProjectsResult>("import_projects", { filePath }),
  exportProjects: (filePath) => invokeCommand("export_projects", { filePath }),
  installNodeVersion: (version) => invokeCommand("install_node_version", { version }),
  minimizeAppToTray: () => invokeCommand("minimize_app_to_tray"),
  ensureDeleteTool: () => invokeCommand<boolean>("ensure_delete_tool"),
  deleteProjectNodeModules: (projectId) =>
    invokeCommand("delete_project_node_modules", { projectId }),
  reinstallProjectNodeModules: (projectId) =>
    invokeCommand("reinstall_project_node_modules", { projectId }),
  copyText: (value) => {
    void navigator.clipboard.writeText(value);
  },
  confirmAppClose: () => invokeCommand("confirm_app_close"),
  cancelAppClose: () => invokeCommand("cancel_app_close"),
};
