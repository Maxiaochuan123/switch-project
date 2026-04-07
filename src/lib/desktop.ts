import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open } from "@tauri-apps/plugin-dialog";
import {
  type DependencyOperationEvent,
  normalizeAppStartupSettings,
  type AppCloseRequest,
  type AppStartupSettings,
  type DesktopApi,
  type DesktopEnvironment,
  type ProjectConfig,
  type ProjectDirectoryInspection,
  type ProjectRuntime,
} from "@/shared/contracts";

const EVENTS = {
  runtimeUpdate: "runtime-update",
  appCloseRequested: "app-close-requested",
  dependencyOperation: "dependency-operation",
} as const;

async function invokeCommand<T>(command: string, payload?: Record<string, unknown>) {
  return invoke<T>(command, payload);
}

export const desktopApi: DesktopApi = {
  listProjects: () => invokeCommand<ProjectConfig[]>("list_projects"),
  saveProject: (project) => invokeCommand("save_project", { project }),
  deleteProject: (projectId) => invokeCommand("delete_project", { projectId }),
  listRuntimes: () => invokeCommand<ProjectRuntime[]>("list_runtimes"),
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

    if (normalizedSettings.openAtLogin) {
      await enable();
    } else {
      await disable();
    }

    await invokeCommand("save_app_startup_settings", { settings: normalizedSettings });
  },
  startProject: (projectId) => invokeCommand("start_project", { projectId }),
  stopProject: (projectId) => invokeCommand("stop_project", { projectId }),
  openProjectDirectory: (projectPath) =>
    invokeCommand("open_project_directory", { projectPath }),
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
  minimizeAppToTray: () => invokeCommand("minimize_app_to_tray"),
  ensureDeleteTool: () => invokeCommand<boolean>("ensure_delete_tool"),
  deleteProjectNodeModules: (projectId) =>
    invokeCommand("delete_project_node_modules", { projectId }),
  reinstallProjectNodeModules: (projectId) =>
    invokeCommand("reinstall_project_node_modules", { projectId }),
  copyText: (value) => {
    void navigator.clipboard.writeText(value);
  },
  subscribeRuntime: (listener) => {
    let disposed = false;
    const unlistenPromise = listen<ProjectRuntime>(EVENTS.runtimeUpdate, (event) => {
      if (!disposed) {
        listener(event.payload);
      }
    });

    return () => {
      disposed = true;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  },
  subscribeAppCloseRequest: (listener) => {
    let disposed = false;
    const unlistenPromise = listen<AppCloseRequest>(EVENTS.appCloseRequested, (event) => {
      if (!disposed) {
        listener(event.payload);
      }
    });

    return () => {
      disposed = true;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  },
  subscribeDependencyOperation: (listener) => {
    let disposed = false;
    const unlistenPromise = listen<DependencyOperationEvent>(
      EVENTS.dependencyOperation,
      (event) => {
        if (!disposed) {
          listener(event.payload);
        }
      }
    );

    return () => {
      disposed = true;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  },
  confirmAppClose: () => invokeCommand("confirm_app_close"),
  cancelAppClose: () => invokeCommand("cancel_app_close"),
};
