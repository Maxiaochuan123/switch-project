import { useCallback, type Dispatch, type SetStateAction } from "react";
import { desktopApi } from "@/lib/desktop";
import {
  normalizeNodeVersion,
  type OperationEvent,
  type ProjectConfig,
  type ProjectRuntime,
} from "@/shared/contracts";
import { getErrorMessage, type Feedback } from "./helpers";
import type {
  NodeInstallRequest,
  NodeRetryRequest,
} from "./use-project-dialog-state";

type UseProjectStartActionsOptions = {
  clearProjectOperationPanel: (projectId: string) => void;
  clearProjectStartFailure: (projectId: string) => void;
  getProjectById: (projectId: string) => ProjectConfig | undefined;
  runLockedAction: (
    key: string,
    action: () => Promise<void> | void,
    cooldownMs?: number
  ) => Promise<void>;
  setFeedback: Dispatch<SetStateAction<Feedback | null>>;
  setNodeInstallRequest: Dispatch<SetStateAction<NodeInstallRequest | null>>;
  setNodeRetryTarget: Dispatch<SetStateAction<NodeRetryRequest | null>>;
  setProjectStartFailure: (projectId: string, message: string) => void;
  showProjectOperationPanel: (event: OperationEvent, clearDelay?: number) => void;
  syncRuntimes: (runtimes: ProjectRuntime[]) => void;
};

export type StartProjectDirect = (projectId: string) => Promise<void>;

export function useProjectStartActions({
  clearProjectOperationPanel,
  clearProjectStartFailure,
  getProjectById,
  runLockedAction,
  setFeedback,
  setNodeInstallRequest,
  setNodeRetryTarget,
  setProjectStartFailure,
  showProjectOperationPanel,
  syncRuntimes,
}: UseProjectStartActionsOptions) {
  const startProject = useCallback(
    async (projectId: string) => {
      try {
        await desktopApi.startProject(projectId);
        setFeedback(null);
      } catch (error) {
        const message = getErrorMessage(error);
        setProjectStartFailure(projectId, message);
        showProjectOperationPanel({
          operationId: `project-start-error:${projectId}:${Date.now()}`,
          type: "project-start-preflight",
          status: "error",
          title: "启动失败",
          projectId,
          message,
        });
        setFeedback({
          variant: "destructive",
          title: "启动项目失败",
          message,
        });
      }
    },
    [setFeedback, setProjectStartFailure, showProjectOperationPanel]
  );

  const startProjectDirect = useCallback<StartProjectDirect>(
    async (projectId: string) => {
      const project = getProjectById(projectId);
      if (!project) {
        return;
      }

      clearProjectOperationPanel(projectId);
      clearProjectStartFailure(projectId);
      setNodeRetryTarget((current) =>
        current?.project.id === projectId ? null : current
      );

      await runLockedAction(`start:${projectId}`, async () => {
        showProjectOperationPanel({
          operationId: `project-start-running:${projectId}:${Date.now()}`,
          type: "project-start-preflight",
          status: "running",
          title: "正在启动项目",
          projectId,
          projectName: project.name,
          message: `正在启动 ${project.name}...`,
        });

        await startProject(projectId);
      });
    },
    [
      clearProjectOperationPanel,
      clearProjectStartFailure,
      getProjectById,
      runLockedAction,
      setNodeRetryTarget,
      showProjectOperationPanel,
      startProject,
    ]
  );

  const handleStartProject = useCallback(
    async (projectId: string) => {
      const project = getProjectById(projectId);
      if (!project) {
        return;
      }

      clearProjectOperationPanel(projectId);
      clearProjectStartFailure(projectId);
      setNodeRetryTarget((current) =>
        current?.project.id === projectId ? null : current
      );

      await runLockedAction(`start:${projectId}`, async () => {
        showProjectOperationPanel({
          operationId: `project-start-preflight:${projectId}:${Date.now()}`,
          type: "project-start-preflight",
          status: "running",
          title: "正在启动项目",
          projectId,
          projectName: project.name,
          message: `正在准备并启动 ${project.name}...`,
        });

        try {
          const preflight = await desktopApi.preflightProjectStart(projectId);
          const currentNodeVersion = normalizeNodeVersion(
            preflight.selectedNodeVersion
          );
          const suggestedNodeVersion = preflight.suggestedNodeVersion
            ? normalizeNodeVersion(preflight.suggestedNodeVersion)
            : null;
          const installNodeVersion = preflight.installNodeVersion
            ? normalizeNodeVersion(preflight.installNodeVersion)
            : null;

          if (
            suggestedNodeVersion &&
            suggestedNodeVersion !== currentNodeVersion
          ) {
            clearProjectOperationPanel(projectId);
            setNodeRetryTarget({
              project: {
                ...project,
                nodeVersion: currentNodeVersion,
              },
              suggestedNodeVersion,
            });
            return;
          }

          if (installNodeVersion) {
            clearProjectOperationPanel(projectId);
            setNodeInstallRequest({
              project: {
                ...project,
                nodeVersion: currentNodeVersion,
              },
              version: installNodeVersion,
            });
            return;
          }

          if (!preflight.canStart) {
            const message = preflight.reasonMessage?.trim() || "启动前检查未通过。";
            setProjectStartFailure(projectId, message);
            showProjectOperationPanel({
              operationId: `project-start-preflight:${projectId}:${Date.now()}`,
              type: "project-start-preflight",
              status: "error",
              title: "启动失败",
              projectId,
              projectName: project.name,
              message,
            });
            setFeedback({
              variant: "destructive",
              title: "启动前检查失败",
              message,
            });
            return;
          }

          await startProject(projectId);
        } catch (error) {
          const message = getErrorMessage(error);
          setProjectStartFailure(projectId, message);
          showProjectOperationPanel({
            operationId: `project-start-preflight:${projectId}:${Date.now()}`,
            type: "project-start-preflight",
            status: "error",
            title: "启动失败",
            projectId,
            projectName: project.name,
            message,
          });
          setFeedback({
            variant: "destructive",
            title: "启动失败",
            message,
          });
        }
      });
    },
    [
      clearProjectOperationPanel,
      clearProjectStartFailure,
      getProjectById,
      runLockedAction,
      setFeedback,
      setNodeInstallRequest,
      setNodeRetryTarget,
      setProjectStartFailure,
      showProjectOperationPanel,
      startProject,
    ]
  );

  const handleStopProject = useCallback(
    async (projectId: string) => {
      await runLockedAction(`stop:${projectId}`, async () => {
        try {
          await desktopApi.stopProject(projectId);
          syncRuntimes(await desktopApi.listRuntimes());
          clearProjectOperationPanel(projectId);
          clearProjectStartFailure(projectId);
          setNodeRetryTarget((current) =>
            current?.project.id === projectId ? null : current
          );
          setFeedback(null);
        } catch (error) {
          setFeedback({
            variant: "destructive",
            title: "停止项目失败",
            message: getErrorMessage(error),
          });
        }
      });
    },
    [
      clearProjectOperationPanel,
      clearProjectStartFailure,
      runLockedAction,
      setFeedback,
      setNodeRetryTarget,
      syncRuntimes,
    ]
  );

  return {
    handleStartProject,
    handleStopProject,
    startProjectDirect,
  };
}
