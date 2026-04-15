import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { desktopApi } from "@/lib/desktop";
import {
  normalizeNodeVersion,
  type OperationEvent,
  type ProjectConfig,
} from "@/shared/contracts";
import { getErrorMessage, getToastContent, type Feedback } from "./helpers";
import type {
  NodeInstallProgress,
  NodeInstallRequest,
  NodeRetryRequest,
} from "./use-project-dialog-state";
import type { StartProjectDirect } from "./use-project-start-actions";

type UseProjectNodeActionsOptions = {
  loadProjectData: () => Promise<void>;
  nodeInstallRequest: NodeInstallRequest | null;
  nodeRetryTarget: NodeRetryRequest | null;
  refreshProjectDiagnosis: (projectId: string) => void;
  setFeedback: Dispatch<SetStateAction<Feedback | null>>;
  setIsInstallingNodeVersion: Dispatch<SetStateAction<boolean>>;
  setNodeInstallProgress: Dispatch<SetStateAction<NodeInstallProgress | null>>;
  setNodeInstallRequest: Dispatch<SetStateAction<NodeInstallRequest | null>>;
  setNodeRetryTarget: Dispatch<SetStateAction<NodeRetryRequest | null>>;
  showProjectOperationPanel: (event: OperationEvent, clearDelay?: number) => void;
  startProjectDirect: StartProjectDirect;
};

export function useProjectNodeActions({
  loadProjectData,
  nodeInstallRequest,
  nodeRetryTarget,
  refreshProjectDiagnosis,
  setFeedback,
  setIsInstallingNodeVersion,
  setNodeInstallProgress,
  setNodeInstallRequest,
  setNodeRetryTarget,
  showProjectOperationPanel,
  startProjectDirect,
}: UseProjectNodeActionsOptions) {
  const installNodeVersion = useCallback(
    async (
      version: string,
      project?: ProjectConfig | null,
      progress?: NodeInstallProgress
    ) => {
      const normalizedVersion = normalizeNodeVersion(version);
      const toastId = `install-node:${normalizedVersion}`;
      const isProjectScoped = Boolean(project?.id);
      const isSyncProgress = progress?.kind === "sync";

      if (!isSyncProgress) {
        setIsInstallingNodeVersion(true);
      }
      setNodeInstallProgress(
        progress ?? {
          kind: "single",
          currentVersion: normalizedVersion,
          completedCount: 0,
          totalCount: 1,
        }
      );

      if (project?.id) {
        showProjectOperationPanel({
          operationId: `node-install:${project.id}:${Date.now()}`,
          type: "node-install",
          status: "running",
          title: "正在安装 Node 版本",
          projectId: project.id,
          projectName: project.name,
          message: `正在安装 Node v${normalizedVersion}，请稍后...`,
        });
      } else {
        toast.loading(
          getToastContent(
            "正在安装 Node 版本",
            `正在安装 Node v${normalizedVersion}，请稍后...`
          ),
          {
            id: toastId,
            duration: Number.POSITIVE_INFINITY,
          }
        );
      }

      try {
        await desktopApi.installNodeVersion(normalizedVersion);
        await loadProjectData();

        if (project?.id) {
          refreshProjectDiagnosis(project.id);
          showProjectOperationPanel({
            operationId: `node-install:${project.id}:${Date.now()}`,
            type: "node-install",
            status: "success",
            title: "Node 版本安装完成",
            projectId: project.id,
            projectName: project.name,
            message: `Node v${normalizedVersion} 已安装完成。`,
          });
        } else {
          toast.success(
            getToastContent(
              "Node 版本安装完成",
              `Node v${normalizedVersion} 已安装完成。`
            ),
            {
              id: toastId,
              duration: 3000,
            }
          );
        }

        return true;
      } catch (error) {
        if (project?.id) {
          showProjectOperationPanel({
            operationId: `node-install:${project.id}:${Date.now()}`,
            type: "node-install",
            status: "error",
            title: "安装 Node 版本失败",
            projectId: project.id,
            projectName: project.name,
            message: getErrorMessage(error),
          });
        } else {
          toast.error(
            getToastContent("安装 Node 版本失败", getErrorMessage(error)),
            {
              id: toastId,
              duration: 4000,
            }
          );
        }

        return false;
      } finally {
        if (!isProjectScoped) {
          toast.dismiss(toastId);
        }
        if (!isSyncProgress) {
          setNodeInstallProgress(null);
          setIsInstallingNodeVersion(false);
        }
      }
    },
    [
      loadProjectData,
      refreshProjectDiagnosis,
      setIsInstallingNodeVersion,
      setNodeInstallProgress,
      showProjectOperationPanel,
    ]
  );

  const handleInstallNodeVersionOnly = useCallback(
    async (version: string) => {
      await installNodeVersion(version);
    },
    [installNodeVersion]
  );

  const handleSyncNodeVersionsFromNvm = useCallback(
    async (versions: string[]) => {
      const normalizedVersions = versions.map((version) => normalizeNodeVersion(version));
      const totalCount = normalizedVersions.length;

      if (totalCount === 0) {
        return;
      }

      setIsInstallingNodeVersion(true);

      try {
        for (const [index, version] of normalizedVersions.entries()) {
          const installed = await installNodeVersion(version, null, {
            kind: "sync",
            currentVersion: version,
            completedCount: index,
            totalCount,
          });

          if (!installed) {
            setFeedback({
              variant: "destructive",
              title: "同步 fnm 失败",
              message: `同步 Node v${version} 时中断，请检查安装日志或稍后重试。`,
            });
            return;
          }
        }

        setFeedback({
          variant: "default",
          title: "fnm 已同步",
          message:
            totalCount === 1
              ? `已把 Node v${normalizedVersions[0]} 同步安装到 fnm。`
              : `已把 ${totalCount} 个 Node 版本同步安装到 fnm。`,
        });
      } finally {
        setNodeInstallProgress(null);
        setIsInstallingNodeVersion(false);
      }
    },
    [installNodeVersion, setFeedback, setIsInstallingNodeVersion, setNodeInstallProgress]
  );

  const handleInstallNodeVersionAndStart = useCallback(async () => {
    if (!nodeInstallRequest) {
      return;
    }

    const project = nodeInstallRequest.project;
    const targetNodeVersion = normalizeNodeVersion(nodeInstallRequest.version);
    const installed = await installNodeVersion(targetNodeVersion, project);
    if (!installed) {
      return;
    }

    const nextProject =
      normalizeNodeVersion(project.nodeVersion) === targetNodeVersion
        ? project
        : {
            ...project,
            nodeVersion: targetNodeVersion,
          };

    if (nextProject !== project) {
      await desktopApi.saveProject(nextProject);
      await loadProjectData();
    }

    setNodeInstallRequest(null);
    await startProjectDirect(nextProject.id);
  }, [
    installNodeVersion,
    loadProjectData,
    nodeInstallRequest,
    setNodeInstallRequest,
    startProjectDirect,
  ]);

  const handleRetryProjectWithSuggestedNode = useCallback(
    async (selectedNodeVersion?: string) => {
      if (!nodeRetryTarget) {
        return;
      }

      const targetNodeVersion = normalizeNodeVersion(
        selectedNodeVersion ?? nodeRetryTarget.suggestedNodeVersion
      );
      const nextProject = {
        ...nodeRetryTarget.project,
        nodeVersion: targetNodeVersion,
      };

      setIsInstallingNodeVersion(true);

      try {
        await desktopApi.saveProject(nextProject);
        await loadProjectData();
        setNodeRetryTarget(null);
        await startProjectDirect(nextProject.id);
      } catch (error) {
        setFeedback({
          variant: "destructive",
          title: "切换 Node 版本失败",
          message: getErrorMessage(error),
        });
      } finally {
        setIsInstallingNodeVersion(false);
      }
    },
    [
      loadProjectData,
      nodeRetryTarget,
      setFeedback,
      setIsInstallingNodeVersion,
      setNodeRetryTarget,
      startProjectDirect,
    ]
  );

  return {
    handleInstallNodeVersionAndStart,
    handleInstallNodeVersionOnly,
    handleRetryProjectWithSuggestedNode,
    handleSyncNodeVersionsFromNvm,
  };
}
