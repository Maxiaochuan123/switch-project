import { useCallback, type Dispatch, type SetStateAction } from "react";
import { desktopApi } from "@/lib/desktop";
import type { NodeManagerInstallResult } from "@/shared/contracts";
import { getErrorMessage, type Feedback } from "./helpers";

const FNM_INSTALL_GUIDE_URL = "https://www.fnmnode.com/guide/install.html";

type UseProjectNodeManagerActionsOptions = {
  loadProjectData: () => Promise<void>;
  runLockedAction: (
    key: string,
    action: () => Promise<void> | void,
    cooldownMs?: number
  ) => Promise<void>;
  setFeedback: Dispatch<SetStateAction<Feedback | null>>;
  setIsInstallingNodeManager: Dispatch<SetStateAction<boolean>>;
  setIsNodeManagerInstallLogsOpen: Dispatch<SetStateAction<boolean>>;
  setNodeManagerInstallResult: Dispatch<SetStateAction<NodeManagerInstallResult | null>>;
};

export function useProjectNodeManagerActions({
  loadProjectData,
  runLockedAction,
  setFeedback,
  setIsInstallingNodeManager,
  setIsNodeManagerInstallLogsOpen,
  setNodeManagerInstallResult,
}: UseProjectNodeManagerActionsOptions) {
  const handleInstallNodeManager = useCallback(async () => {
    await runLockedAction("install-node-manager", async () => {
      setIsInstallingNodeManager(true);
      setNodeManagerInstallResult(null);
      setIsNodeManagerInstallLogsOpen(false);

      try {
        const result = await desktopApi.installNodeManager();

        if (!result.success) {
          setNodeManagerInstallResult(result);
          setIsNodeManagerInstallLogsOpen(result.attempts.length > 0);
          setFeedback({
            variant: "destructive",
            title: "安装 fnm 失败",
            message: result.message,
          });
          return;
        }

        setNodeManagerInstallResult(null);
        await loadProjectData();
        setFeedback({
          variant: "default",
          title: "fnm 已安装",
          message: result.message,
        });
      } catch (error) {
        setNodeManagerInstallResult(null);
        setIsNodeManagerInstallLogsOpen(false);
        setFeedback({
          variant: "destructive",
          title: "安装 fnm 失败",
          message: getErrorMessage(error),
        });
      } finally {
        setIsInstallingNodeManager(false);
      }
    });
  }, [
    loadProjectData,
    runLockedAction,
    setFeedback,
    setIsInstallingNodeManager,
    setIsNodeManagerInstallLogsOpen,
    setNodeManagerInstallResult,
  ]);

  const handleOpenNodeManagerGuide = useCallback(async () => {
    await runLockedAction("open-node-manager-guide", async () => {
      try {
        await desktopApi.openExternal(FNM_INSTALL_GUIDE_URL);
      } catch (error) {
        setFeedback({
          variant: "destructive",
          title: "打开安装说明失败",
          message: getErrorMessage(error),
        });
      }
    });
  }, [runLockedAction, setFeedback]);

  const handleRefreshEnvironment = useCallback(async () => {
    await runLockedAction("refresh-node-manager-environment", async () => {
      try {
        await loadProjectData();
      } catch (error) {
        setFeedback({
          variant: "destructive",
          title: "重新检测失败",
          message: getErrorMessage(error),
        });
      }
    });
  }, [loadProjectData, runLockedAction, setFeedback]);

  return {
    handleInstallNodeManager,
    handleOpenNodeManagerGuide,
    handleRefreshEnvironment,
  };
}
