import { useCallback, useState } from "react";
import type {
  AppCloseRequest,
  AppStartupSettings,
  NodeManagerInstallResult,
  ProjectConfig,
  ProjectGroup,
} from "@/shared/contracts";

export type NodeInstallRequest = {
  project: ProjectConfig;
  version: string;
};

export type NodeRetryRequest = {
  project: ProjectConfig;
  suggestedNodeVersion: string;
};

export type ProjectGroupDraft = {
  id?: string;
  name: string;
};

export type NodeInstallProgress = {
  kind: "single" | "sync";
  currentVersion: string;
  completedCount: number;
  totalCount: number;
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
  const [projectGroupDraft, setProjectGroupDraft] = useState<ProjectGroupDraft | null>(null);
  const [deleteProjectGroupTarget, setDeleteProjectGroupTarget] =
    useState<ProjectGroup | null>(null);
  const [nodeInstallRequest, setNodeInstallRequest] = useState<NodeInstallRequest | null>(null);
  const [nodeRetryTarget, setNodeRetryTarget] = useState<NodeRetryRequest | null>(null);
  const [nodeInstallProgress, setNodeInstallProgress] =
    useState<NodeInstallProgress | null>(null);
  const [appCloseRequest, setAppCloseRequest] = useState<AppCloseRequest | null>(null);
  const [nodeManagerInstallResult, setNodeManagerInstallResult] =
    useState<NodeManagerInstallResult | null>(null);
  const [isSavingStartupSettings, setIsSavingStartupSettings] = useState(false);
  const [isInstallingNodeManager, setIsInstallingNodeManager] = useState(false);
  const [isNodeManagerInstallLogsOpen, setIsNodeManagerInstallLogsOpen] = useState(false);
  const [isInstallingNodeVersion, setIsInstallingNodeVersion] = useState(false);
  const [isSubmittingProjectGroup, setIsSubmittingProjectGroup] = useState(false);
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

  const handleNodeManagerInstallLogsOpenChange = useCallback((nextOpen: boolean) => {
    setIsNodeManagerInstallLogsOpen(nextOpen);
  }, []);

  const handleProjectGroupDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setProjectGroupDraft(null);
    }
  }, []);

  const handleDeleteProjectGroupDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setDeleteProjectGroupTarget(null);
    }
  }, []);

  const openStartupSettingsDialog = useCallback(() => {
    setStartupSettingsDraft(startupSettings);
    setIsStartupSettingsDialogOpen(true);
  }, [startupSettings]);

  return {
    appCloseRequest,
    deleteTarget,
    deleteProjectGroupTarget,
    handleDeleteDialogOpenChange,
    handleDeleteProjectGroupDialogOpenChange,
    handleLogsDialogOpenChange,
    handleNodeManagerInstallLogsOpenChange,
    handleNodeInstallDialogOpenChange,
    handleNodeRetryDialogOpenChange,
    handleStartupSettingsOpenChange,
    handleProjectGroupDialogOpenChange,
    isConfirmingAppClose,
    isInstallingNodeManager,
    isNodeManagerInstallLogsOpen,
    isInstallingNodeVersion,
    isSubmittingProjectGroup,
    isMinimizingAppClose,
    isSavingStartupSettings,
    isStartupSettingsDialogOpen,
    nodeInstallProgress,
    nodeInstallRequest,
    nodeManagerInstallResult,
    nodeRetryTarget,
    openStartupSettingsDialog,
    projectGroupDraft,
    setAppCloseRequest,
    setDeleteTarget,
    setDeleteProjectGroupTarget,
    setIsConfirmingAppClose,
    setIsInstallingNodeManager,
    setIsNodeManagerInstallLogsOpen,
    setIsInstallingNodeVersion,
    setIsSubmittingProjectGroup,
    setIsMinimizingAppClose,
    setIsSavingStartupSettings,
    setIsStartupSettingsDialogOpen,
    setNodeInstallProgress,
    setNodeManagerInstallResult,
    setNodeInstallRequest,
    setNodeRetryTarget,
    setProjectGroupDraft,
    setStartupSettingsDraft,
    setTerminalTarget,
    startupSettingsDraft,
    terminalTarget,
  };
}
