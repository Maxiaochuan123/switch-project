import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
} from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import {
  listInstalledNodeVersions,
  resolveNvmHome,
} from "./main/node-versions";
import { ProjectStore } from "./main/project-store";
import { ProjectRuntimeManager } from "./main/runtime-manager";
import {
  IPC_CHANNELS,
  type ProjectConfig,
  type ProjectRuntime,
} from "./shared/contracts";

if (started) {
  app.quit();
}

const projectStore = new ProjectStore();
let runtimeManager: ProjectRuntimeManager | null = null;
let mainWindow: BrowserWindow | null = null;

function sendRuntimeUpdate(runtime: ProjectRuntime) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(IPC_CHANNELS.runtimeUpdate, runtime);
}

function registerIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.listProjects, () => projectStore.listProjects());
  ipcMain.handle(
    IPC_CHANNELS.saveProject,
    (_event: IpcMainInvokeEvent, project: ProjectConfig) => {
    projectStore.saveProject(project);
    }
  );
  ipcMain.handle(
    IPC_CHANNELS.deleteProject,
    async (_event: IpcMainInvokeEvent, projectId: string) => {
      await runtimeManager?.stopProject(projectId);
      projectStore.deleteProject(projectId);
    }
  );
  ipcMain.handle(
    IPC_CHANNELS.startProject,
    async (_event: IpcMainInvokeEvent, projectId: string) => {
      const project = projectStore.getProject(projectId);

      if (!project) {
        throw new Error("项目不存在。");
      }

      await runtimeManager?.startProject(project);
    }
  );
  ipcMain.handle(
    IPC_CHANNELS.stopProject,
    async (_event: IpcMainInvokeEvent, projectId: string) => {
      await runtimeManager?.stopProject(projectId);
    }
  );
  ipcMain.handle(IPC_CHANNELS.getEnvironment, () => ({
    installedNodeVersions: listInstalledNodeVersions(),
    nvmHome: resolveNvmHome(),
  }));
  ipcMain.handle(
    IPC_CHANNELS.browseProjectDirectory,
    async (_event: IpcMainInvokeEvent, initialPath?: string) => {
      const browserWindow = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
      const result = await dialog.showOpenDialog(browserWindow, {
        properties: ["openDirectory"],
        defaultPath: initialPath?.trim() || undefined,
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    }
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: "#0b1020",
    title: "项目切换面板",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  runtimeManager = new ProjectRuntimeManager(sendRuntimeUpdate);
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  runtimeManager?.stopAllSync();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
