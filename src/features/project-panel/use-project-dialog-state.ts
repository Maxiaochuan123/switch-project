import { useCallback, useState } from "react";
import type {
  AppCloseRequest,
  AppStartupSettings,
  ProjectConfig,
} from "@/shared/contracts";

export type NodeInstallRequest = {
  project: ProjectConfig;
  version: string;
};

export type NodeRetryRequest = {
  project: ProjectConfig;
  suggestedNodeVersion: string;
};

type UseProjectDialogStateOptions = {
  startupSettings: AppStartupSettings;
};

export function useProjectDialogState({ startupSettings }: UseProjectDialogStateOptions) {
  const [isStartupSettingsDialogOpen, setIsStartupSettingsDialogOpen] = useState(false);
  const [startupSettingsDraft, setStartupSettingsDraft] =
    useState<AppStartupSettings>(startupSettings);
  const [deleteTarget, setDeleteTarget] = useState<ProjectConfig | null>(null);
  const [terminalTarget, setTerminalTarget] = useState<ProjectConfig | null>(null);
  const [nodeInstallRequest, setNodeInstallRequest] = useState<NodeInstallRequest | null>(null);
  const [nodeRetryTarget, setNodeRetryTarget] = useState<NodeRetryRequest | null>(null);
  const [appCloseRequest, setAppCloseRequest] = useState<AppCloseRequest | null>(null);
  const [isSavingStartupSettings, setIsSavingStartupSettings] = useState(false);
  const [isInstallingNodeVersion, setIsInstallingNodeVersion] = useState(false);
  const [isConfirmingAppClose, setIsConfirmingAppClose] = useState(false);
  const [isMinimizingAppClose, setIsMinimizingAppClose] = useState(false);

  const handleStartupSettingsOpenChange = useCallback(
    (nextOpen: boolean) => {
      setIsStartupSettingsDialogOpen(nextOpen);
      if (!nextOpen) {
        setStartupSettingsDraft(startupSettings);
      }
    },
    [startupSettings]
  );

  const handleDeleteDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setDeleteTarget(null);
    }
  }, []);

  const handleLogsDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setTerminalTarget(null);
    }
  }, []);

  const handleNodeInstallDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setNodeInstallRequest(null);
    }
  }, []);

  const handleNodeRetryDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setNodeRetryTarget(null);
    }
  }, []);

  const openStartupSettingsDialog = useCallback(() => {
    setStartupSettingsDraft(startupSettings);
    setIsStartupSettingsDialogOpen(true);
  }, [startupSettings]);

  return {
    appCloseRequest,
    deleteTarget,
    handleDeleteDialogOpenChange,
    handleLogsDialogOpenChange,
    handleNodeInstallDialogOpenChange,
    handleNodeRetryDialogOpenChange,
    handleStartupSettingsOpenChange,
    isConfirmingAppClose,
    isInstallingNodeVersion,
    isMinimizingAppClose,
    isSavingStartupSettings,
    isStartupSettingsDialogOpen,
    nodeInstallRequest,
    nodeRetryTarget,
    openStartupSettingsDialog,
    setAppCloseRequest,
    setDeleteTarget,
    setIsConfirmingAppClose,
    setIsInstallingNodeVersion,
    setIsMinimizingAppClose,
    setIsSavingStartupSettings,
    setIsStartupSettingsDialogOpen,
    setNodeInstallRequest,
    setNodeRetryTarget,
    setStartupSettingsDraft,
    setTerminalTarget,
    startupSettingsDraft,
    terminalTarget,
  };
}
