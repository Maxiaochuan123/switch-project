import type { Dispatch, SetStateAction } from "react";
import type {
  OperationEvent,
  ProjectConfig,
  ProjectRuntime,
} from "@/shared/contracts";
import type { Feedback } from "./helpers";
import { useProjectNodeActions } from "./use-project-node-actions";
import { useProjectStartActions } from "./use-project-start-actions";
import type {
  NodeInstallProgress,
  NodeInstallRequest,
  NodeRetryRequest,
} from "./use-project-dialog-state";

type UseProjectRunActionsOptions = {
  clearProjectOperationPanel: (projectId: string) => void;
  clearProjectStartFailure: (projectId: string) => void;
  getProjectById: (projectId: string) => ProjectConfig | undefined;
  loadProjectData: () => Promise<void>;
  nodeInstallRequest: NodeInstallRequest | null;
  nodeRetryTarget: NodeRetryRequest | null;
  refreshProjectDiagnosis: (projectId: string) => void;
  runLockedAction: (
    key: string,
    action: () => Promise<void> | void,
    cooldownMs?: number
  ) => Promise<void>;
  setFeedback: Dispatch<SetStateAction<Feedback | null>>;
  setIsInstallingNodeVersion: Dispatch<SetStateAction<boolean>>;
  setNodeInstallProgress: Dispatch<SetStateAction<NodeInstallProgress | null>>;
  setNodeInstallRequest: Dispatch<SetStateAction<NodeInstallRequest | null>>;
  setNodeRetryTarget: Dispatch<SetStateAction<NodeRetryRequest | null>>;
  setProjectStartFailure: (projectId: string, message: string) => void;
  showProjectOperationPanel: (event: OperationEvent, clearDelay?: number) => void;
  syncRuntimes: (runtimes: ProjectRuntime[]) => void;
};

export function useProjectRunActions({
  clearProjectOperationPanel,
  clearProjectStartFailure,
  getProjectById,
  loadProjectData,
  nodeInstallRequest,
  nodeRetryTarget,
  refreshProjectDiagnosis,
  runLockedAction,
  setFeedback,
  setIsInstallingNodeVersion,
  setNodeInstallProgress,
  setNodeInstallRequest,
  setNodeRetryTarget,
  setProjectStartFailure,
  showProjectOperationPanel,
  syncRuntimes,
}: UseProjectRunActionsOptions) {
  const { handleStartProject, handleStopProject, startProjectDirect } =
    useProjectStartActions({
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
    });

  const {
    handleInstallNodeVersionAndStart,
    handleInstallNodeVersionOnly,
    handleRetryProjectWithSuggestedNode,
    handleSyncNodeVersionsFromNvm,
  } = useProjectNodeActions({
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
  });

  return {
    handleInstallNodeVersionAndStart,
    handleInstallNodeVersionOnly,
    handleRetryProjectWithSuggestedNode,
    handleSyncNodeVersionsFromNvm,
    handleStartProject,
    handleStopProject,
  };
}
