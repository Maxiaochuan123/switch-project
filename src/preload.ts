import {
  clipboard,
  contextBridge,
  ipcRenderer,
  type IpcRendererEvent,
} from "electron";
import {
  IPC_CHANNELS,
  type DesktopApi,
  type ProjectRuntime,
} from "./shared/contracts";

const desktopApi: DesktopApi = {
  listProjects: () => ipcRenderer.invoke(IPC_CHANNELS.listProjects),
  saveProject: (project) => ipcRenderer.invoke(IPC_CHANNELS.saveProject, project),
  deleteProject: (projectId) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteProject, projectId),
  startProject: (projectId) =>
    ipcRenderer.invoke(IPC_CHANNELS.startProject, projectId),
  stopProject: (projectId) =>
    ipcRenderer.invoke(IPC_CHANNELS.stopProject, projectId),
  getEnvironment: () => ipcRenderer.invoke(IPC_CHANNELS.getEnvironment),
  browseProjectDirectory: (initialPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.browseProjectDirectory, initialPath),
  copyText: (value) => clipboard.writeText(value),
  subscribeRuntime: (listener) => {
    const handler = (_event: IpcRendererEvent, runtime: ProjectRuntime) =>
      listener(runtime);

    ipcRenderer.on(IPC_CHANNELS.runtimeUpdate, handler);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.runtimeUpdate, handler);
    };
  },
};

contextBridge.exposeInMainWorld("switchProjectApi", desktopApi);
