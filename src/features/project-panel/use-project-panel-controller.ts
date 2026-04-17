import { useCallback, useEffect, useMemo, useState } from "react";
import { desktopApi } from "@/lib/desktop";
import {
  type ProjectConfig,
  type ProjectGroup,
} from "@/shared/contracts";
import { getMissingNodeVersions } from "./project-draft";
import {
  ALL_GROUP_TAB_KEY,
  buildAssignProjectsDialogSections,
  buildGroupTabs,
  buildVisibleProjectCards,
  countProjectsByGroup,
  findSelectedManagedGroup,
  type GroupTabViewModel,
  type PendingProjectGroupReassign,
  type ProjectGroupBatchAssignTarget,
  type VisibleProjectCardViewModel,
} from "./project-panel-view-models";
import { useActionLocks } from "./use-action-locks";
import { useProjectAppActions } from "./use-project-app-actions";
import { useProjectBootstrap } from "./use-project-bootstrap";
import { useProjectCardViewModels } from "./use-project-card-view-models";
import { useProjectCoreState } from "./use-project-core-state";
import { useProjectDialogState } from "./use-project-dialog-state";
import { useProjectFeedback } from "./use-project-feedback";
import { useProjectFormState } from "./use-project-form-state";
import { useProjectGroupActions } from "./use-project-group-actions";
import { useProjectManagementActions } from "./use-project-management-actions";
import { useProjectNodeManagerActions } from "./use-project-node-manager-actions";
import { useProjectNodeVersionManagerState } from "./use-project-node-version-manager-state";
import { useProjectRunActions } from "./use-project-run-actions";
import { useProjectRuntimeState } from "./use-project-runtime-state";
import { useProjectUtilityActions } from "./use-project-utility-actions";
import { getErrorMessage } from "./helpers";

type PageViewModel = {
  isLoading: boolean;
  loadingProjectCount: number;
  hasProjects: boolean;
  hasProjectGroups: boolean;
  groupTabs: GroupTabViewModel[];
  activeGroupTab: string;
  visibleProjectCards: VisibleProjectCardViewModel[];
  selectedManagedGroup: ProjectGroup | null;
  isActionLocked: (key: string) => boolean;
  runLockedAction: (
    key: string,
    action: () => Promise<void> | void,
    cooldownMs?: number
  ) => Promise<void>;
  handleImportProjects: () => Promise<void>;
  handleExportProjects: () => Promise<void>;
  setActiveGroupTab: (value: string) => void;
  handleCreateGroup: () => void;
  handleOpenAssignProjectsDialog: () => void;
  handleRenameActiveGroup: () => void;
  handleDeleteActiveGroup: () => void;
  handleReorderProjectGroups: (groupIds: string[]) => Promise<void>;
  handleReorderProjectsInSelectedGroup: (projectIds: string[]) => Promise<void>;
  openStartupSettingsDialog: () => void;
  openNodeVersionManagerDialog: () => void;
  openCreateDialog: () => void;
};

export function useProjectPanelController() {
  const [projectGroupMoveTarget, setProjectGroupMoveTarget] = useState<{
    id: string;
    name: string;
    currentGroupId: string | null;
  } | null>(null);
  const [projectGroupBatchAssignTarget, setProjectGroupBatchAssignTarget] =
    useState<ProjectGroupBatchAssignTarget | null>(null);
  const [pendingProjectGroupReassign, setPendingProjectGroupReassign] =
    useState<PendingProjectGroupReassign | null>(null);

  const { isActionLocked, runLockedAction } = useActionLocks();
  const { setFeedback } = useProjectFeedback();
  const {
    environment,
    formError,
    getProjectById,
    projects,
    projectGroups,
    setEnvironment,
    setFormError,
    setProjectGroups,
    setStartupSettings,
    startupSettings,
    syncProjects,
  } = useProjectCoreState();

  const {
    appCloseRequest,
    deleteTarget,
    deleteProjectGroupTarget,
    handleDeleteDialogOpenChange,
    handleDeleteProjectGroupDialogOpenChange,
    handleLogsDialogOpenChange,
    handleNodeManagerInstallLogsOpenChange,
    handleNodeInstallDialogOpenChange,
    handleNodeRetryDialogOpenChange,
    handleProjectGroupDialogOpenChange,
    handleStartupSettingsOpenChange,
    isConfirmingAppClose,
    isInstallingNodeManager,
    isNodeManagerInstallLogsOpen,
    isInstallingNodeVersion,
    isMinimizingAppClose,
    isSavingStartupSettings,
    isStartupSettingsDialogOpen,
    isSubmittingProjectGroup,
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
    setIsMinimizingAppClose,
    setIsSavingStartupSettings,
    setIsStartupSettingsDialogOpen,
    setIsSubmittingProjectGroup,
    setNodeInstallProgress,
    setNodeManagerInstallResult,
    setNodeInstallRequest,
    setNodeRetryTarget,
    setProjectGroupDraft,
    setStartupSettingsDraft,
    setTerminalTarget,
    startupSettingsDraft,
    terminalTarget,
  } = useProjectDialogState({ startupSettings });

  const {
    dropzoneError,
    handleBrowseProjectPath,
    handleDropzonePath,
    handlePackageManagerChange,
    handleProjectDialogOpenChange,
    inspectionNotice,
    isInspectingProject,
    isProjectDialogOpen,
    openCreateDialog,
    openEditDialog,
    pathInspection,
    projectDraft,
    setProjectDraft,
  } = useProjectFormState({
    environment,
    projectGroups,
    onFormError: setFormError,
  });

  const handleSuggestNodeRetry = useCallback((suggestion: {
    project: ProjectConfig;
    suggestedNodeVersion: string;
  }) => {
    setNodeRetryTarget((current) => {
      if (
        current?.project.id === suggestion.project.id &&
        current.suggestedNodeVersion === suggestion.suggestedNodeVersion
      ) {
        return current;
      }

      return suggestion;
    });
  }, [setNodeRetryTarget]);

  const handleClearNodeRetrySuggestion = useCallback((projectId: string) => {
    setNodeRetryTarget((current) => (current?.project.id === projectId ? null : current));
  }, [setNodeRetryTarget]);

  const {
    clearProjectStartFailure,
    clearProjectOperationPanel,
    isProjectDiagnosisPending,
    isProjectDependencyOperationLocked,
    projectDiagnoses,
    projectOperationPanels,
    projectStartFailures,
    refreshProjectDiagnosis,
    runtimes,
    setProjectStartFailure,
    showProjectOperationPanel,
    syncRuntimes,
  } = useProjectRuntimeState({
    projects,
    onSuggestRetry: handleSuggestNodeRetry,
    onClearRetrySuggestion: handleClearNodeRetrySuggestion,
  });

  const { isLoading, loadingProjectCount, loadProjectData } = useProjectBootstrap({
    setAppCloseRequest,
    setEnvironment,
    setFeedback,
    setProjectGroups,
    setStartupSettings,
    setStartupSettingsDraft,
    syncProjects,
    syncRuntimes,
  });

  const {
    handleInstallNodeManager,
    handleOpenNodeManagerGuide,
    handleRefreshEnvironment,
  } = useProjectNodeManagerActions({
    loadProjectData,
    runLockedAction,
    setFeedback,
    setIsInstallingNodeManager,
    setIsNodeManagerInstallLogsOpen,
    setNodeManagerInstallResult,
  });

  const [isNodeVersionSyncDismissed, setIsNodeVersionSyncDismissed] = useState(false);
  const [activeGroupTab, setActiveGroupTab] = useState(ALL_GROUP_TAB_KEY);

  const projectCountsByGroupId = useMemo(
    () => countProjectsByGroup(projects),
    [projects]
  );

  const {
    clearDraftProjectGroups,
    draftProjectGroups,
    handleDeleteProjectGroup,
    handleProjectGroupDialogOpenChange: handleProjectGroupDialogOpenChangeInternal,
    handleSaveProjectGroup,
    openCreateProjectGroupDialog,
    openRenameProjectGroupDialog,
    projectGroupDialogError,
  } = useProjectGroupActions({
    loadProjectData,
    projects,
    projectGroups,
    setDeleteProjectGroupTarget,
    setFeedback,
    setIsSubmittingProjectGroup,
    setProjectDraft,
    setProjectGroupDraft,
    setProjectGroups,
    syncProjects,
  });

  const {
    handleAssignProjectsToGroup,
    handleDeleteProject,
    handleMoveProjectToGroup,
    handleSaveProject,
    isSubmitting,
  } = useProjectManagementActions({
    clearDraftProjectGroups,
    deleteTarget,
    getProjectById,
    handleProjectDialogOpenChange,
    loadProjectData,
    pendingProjectGroups: draftProjectGroups,
    projects,
    refreshProjectDiagnosis,
    runtimes,
    setActiveGroupTab,
    setDeleteTarget,
    setFeedback,
    setFormError,
    setProjectGroups,
    setTerminalTarget,
    syncProjects,
    terminalTargetId: terminalTarget?.id,
  });

  const {
    handleDeleteProjectDependencies,
    handleExportProjects,
    handleImportProjects,
    handleOpenExternal,
    handleOpenProjectDirectory,
    handleReinstallProjectDependenciesToast,
  } = useProjectUtilityActions({
    loadProjectData,
    runLockedAction,
    setFeedback,
    showProjectOperationPanel,
  });

  const {
    handleInstallNodeVersionAndStart,
    handleInstallNodeVersionOnly,
    handleRetryProjectWithSuggestedNode,
    handleSyncNodeVersionsFromNvm,
    handleStartProject,
    handleStopProject,
  } = useProjectRunActions({
    clearProjectOperationPanel,
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
    clearProjectStartFailure,
    setProjectStartFailure,
    showProjectOperationPanel,
    syncRuntimes,
  });

  const missingNvmNodeVersions = useMemo(
    () =>
      getMissingNodeVersions(
        environment.installedNodeVersions,
        environment.nvmInstalledNodeVersions
      ),
    [environment.installedNodeVersions, environment.nvmInstalledNodeVersions]
  );
  const missingNvmNodeVersionsKey = missingNvmNodeVersions.join("|");

  useEffect(() => {
    setIsNodeVersionSyncDismissed(false);
  }, [missingNvmNodeVersionsKey]);

  useEffect(() => {
    if (
      activeGroupTab !== ALL_GROUP_TAB_KEY &&
      !projectGroups.some((group) => group.id === activeGroupTab)
    ) {
      setActiveGroupTab(ALL_GROUP_TAB_KEY);
    }
  }, [activeGroupTab, projectGroups]);

  const {
    handleConfirmAppClose,
    handleExitDialogOpenChange,
    handleMinimizeAppClose,
    handleSaveStartupSettings,
  } = useProjectAppActions({
    setAppCloseRequest,
    setFeedback,
    setIsConfirmingAppClose,
    setIsMinimizingAppClose,
    setIsSavingStartupSettings,
    setIsStartupSettingsDialogOpen,
    setStartupSettings,
    setStartupSettingsDraft,
    startupSettingsDraft,
  });
  const { nodeVersionManagerDialog, openNodeVersionManagerDialog } =
    useProjectNodeVersionManagerState({
      loadProjectData,
      runLockedAction,
      setFeedback,
    });

  const projectGroupNameMap = useMemo(
    () => Object.fromEntries(projectGroups.map((group) => [group.id, group.name])),
    [projectGroups]
  );

  const projectCards = useProjectCardViewModels({
    handleDeleteProjectDependencies,
    handleOpenExternal,
    handleOpenProjectDirectory,
    handleReinstallProjectDependenciesToast,
    handleStartProject,
    handleStopProject,
    isActionLocked,
    isProjectDependencyOperationLocked,
    isProjectDiagnosisPending,
    openEditDialog,
    projectDiagnoses,
    projectGroups,
    projectOperationPanels,
    projectStartFailures,
    projects,
    runLockedAction,
    runtimes,
    setDeleteTarget,
    setProjectGroupMoveTarget,
    setTerminalTarget,
  });

  const groupTabs = useMemo(
    () => buildGroupTabs(projects, projectGroups, projectCountsByGroupId),
    [projectCountsByGroupId, projectGroups, projects]
  );

  const visibleProjectCards = useMemo(
    () =>
      buildVisibleProjectCards(
        activeGroupTab,
        projectCards,
        projectGroupNameMap,
        projectGroups
      ),
    [activeGroupTab, projectCards, projectGroupNameMap, projectGroups]
  );

  const selectedManagedGroup = useMemo(
    () => findSelectedManagedGroup(activeGroupTab, projectGroups),
    [activeGroupTab, projectGroups]
  );

  const assignProjectsDialogSections = useMemo(
    () =>
      buildAssignProjectsDialogSections(
        projectGroupBatchAssignTarget,
        projectGroups,
        projects
      ),
    [projectGroupBatchAssignTarget, projectGroups, projects]
  );

  const handleAssignProjectsSubmit = useCallback(
    async (projectIds: string[]) => {
      if (!projectGroupBatchAssignTarget || projectIds.length === 0) {
        return;
      }

      const selectedProjects = projectIds
        .map((projectId) => getProjectById(projectId))
        .filter((project): project is ProjectConfig => Boolean(project));

      const projectsInOtherGroups = selectedProjects.filter(
        (project) =>
          (project.groupId ?? null) !== null &&
          (project.groupId ?? null) !== projectGroupBatchAssignTarget.id
      );

      if (projectsInOtherGroups.length > 0) {
        setPendingProjectGroupReassign({
          targetGroupId: projectGroupBatchAssignTarget.id,
          targetGroupName: projectGroupBatchAssignTarget.name,
          projects: selectedProjects,
        });
        return;
      }

      const wasSuccessful = await handleAssignProjectsToGroup(
        projectGroupBatchAssignTarget.id,
        selectedProjects
      );
      if (wasSuccessful) {
        setProjectGroupBatchAssignTarget(null);
      }
    },
    [getProjectById, handleAssignProjectsToGroup, projectGroupBatchAssignTarget]
  );

  const handleConfirmProjectGroupReassign = useCallback(async () => {
    if (!pendingProjectGroupReassign) {
      return;
    }

    const wasSuccessful = await handleAssignProjectsToGroup(
      pendingProjectGroupReassign.targetGroupId,
      pendingProjectGroupReassign.projects
    );
    if (wasSuccessful) {
      setPendingProjectGroupReassign(null);
      setProjectGroupBatchAssignTarget(null);
    }
  }, [handleAssignProjectsToGroup, pendingProjectGroupReassign]);

  const handleReorderProjectGroups = useCallback(
    async (groupIds: string[]) => {
      if (groupIds.length !== projectGroups.length) {
        setFeedback({
          variant: "destructive",
          title: "调整分组顺序失败",
          message: "分组数量不匹配，请刷新页面后重试。",
        });
        return;
      }

      const nextGroups = groupIds
        .map((groupId, index) => {
          const group = projectGroups.find((currentGroup) => currentGroup.id === groupId);
          return group ? { ...group, order: index } : null;
        })
        .filter((group): group is ProjectGroup => Boolean(group));

      if (nextGroups.length !== projectGroups.length) {
        setFeedback({
          variant: "destructive",
          title: "调整分组顺序失败",
          message: "部分分组未找到，请刷新页面后重试。",
        });
        return;
      }

      const previousGroups = projectGroups;
      setProjectGroups(nextGroups);

      try {
        const reorderedGroups = await desktopApi.reorderProjectGroups(groupIds);
        setProjectGroups(reorderedGroups);
      } catch (error) {
        setProjectGroups(previousGroups);
        setFeedback({
          variant: "destructive",
          title: "调整分组顺序失败",
          message: getErrorMessage(error),
        });
      }
    },
    [projectGroups, setFeedback, setProjectGroups]
  );

  const handleReorderProjectsInSelectedGroup = useCallback(
    async (projectIds: string[]) => {
      if (!selectedManagedGroup) {
        return;
      }

      const currentGroupId = selectedManagedGroup.id;
      const currentGroupProjects = projects.filter(
        (project) => (project.groupId ?? null) === currentGroupId
      );

      if (currentGroupProjects.length !== projectIds.length) {
        setFeedback({
          variant: "destructive",
          title: "调整项目顺序失败",
          message: "项目数量不匹配，请刷新页面后重试。",
        });
        return;
      }

      const nextOrderMap = Object.fromEntries(
        projectIds.map((projectId, index) => [projectId, index])
      );
      const previousProjects = projects;
      const nextProjects = projects.map((project) => {
        if ((project.groupId ?? null) !== currentGroupId) {
          return project;
        }

        const nextOrder = nextOrderMap[project.id];
        return typeof nextOrder === "number" ? { ...project, order: nextOrder } : project;
      });

      syncProjects(nextProjects);

      try {
        await desktopApi.reorderProjectsInGroup(currentGroupId, projectIds);
      } catch (error) {
        syncProjects(previousProjects);
        setFeedback({
          variant: "destructive",
          title: "调整项目顺序失败",
          message: getErrorMessage(error),
        });
      }
    },
    [projects, selectedManagedGroup, setFeedback, syncProjects]
  );

  const page = useMemo(
    (): PageViewModel => ({
      isLoading,
      loadingProjectCount,
      hasProjects: projects.length > 0,
      hasProjectGroups: projectGroups.length > 0,
      groupTabs,
      activeGroupTab,
      visibleProjectCards,
      selectedManagedGroup,
      isActionLocked,
      runLockedAction,
      handleImportProjects,
      handleExportProjects,
      setActiveGroupTab,
      handleCreateGroup: (): void => openCreateProjectGroupDialog(false),
      handleOpenAssignProjectsDialog: (): void => {
        if (selectedManagedGroup) {
          setProjectGroupBatchAssignTarget({
            id: selectedManagedGroup.id,
            name: selectedManagedGroup.name,
          });
        }
      },
      handleRenameActiveGroup: (): void => {
        if (selectedManagedGroup) {
          openRenameProjectGroupDialog(selectedManagedGroup);
        }
      },
      handleDeleteActiveGroup: (): void => {
        if (selectedManagedGroup) {
          setDeleteProjectGroupTarget(selectedManagedGroup);
        }
      },
      handleReorderProjectGroups,
      handleReorderProjectsInSelectedGroup,
      openStartupSettingsDialog,
      openNodeVersionManagerDialog,
      openCreateDialog,
    }),
    [
      activeGroupTab,
      groupTabs,
      handleExportProjects,
      handleImportProjects,
      handleReorderProjectGroups,
      handleReorderProjectsInSelectedGroup,
      isActionLocked,
      isLoading,
      loadingProjectCount,
      openCreateDialog,
      openCreateProjectGroupDialog,
      openNodeVersionManagerDialog,
      openRenameProjectGroupDialog,
      openStartupSettingsDialog,
      projectGroups.length,
      projects.length,
      runLockedAction,
      selectedManagedGroup,
      setDeleteProjectGroupTarget,
      visibleProjectCards,
    ]
  );

  const projectFormDialog = useMemo(
    () => ({
      open: isProjectDialogOpen,
      draft: projectDraft,
      projectGroups: [...projectGroups, ...draftProjectGroups],
      submitErrorMessage: formError,
      installedNodeVersions: environment.installedNodeVersions,
      nvmInstalledNodeVersions: environment.nvmInstalledNodeVersions,
      activeNodeVersion: environment.activeNodeVersion,
      defaultNodeVersion: environment.defaultNodeVersion,
      installedPackageManagers: environment.availablePackageManagers,
      isSubmitting,
      isInspectingProject,
      inspectionNotice,
      dropzoneError,
      pathInspection,
      isInstallingNodeVersion,
      nodeInstallProgress,
      onPackageManagerChange: handlePackageManagerChange,
      onInstallNodeVersion: handleInstallNodeVersionOnly,
      onBrowsePath: handleBrowseProjectPath,
      onOpenCreateGroup: (): void => openCreateProjectGroupDialog(true),
      onPathSelected: handleDropzonePath,
      onOpenChange: (open: boolean): void => {
        if (!open) {
          clearDraftProjectGroups();
        }
        handleProjectDialogOpenChange(open);
      },
      onSubmit: handleSaveProject,
    }),
    [
      clearDraftProjectGroups,
      draftProjectGroups,
      dropzoneError,
      environment.activeNodeVersion,
      environment.availablePackageManagers,
      environment.defaultNodeVersion,
      environment.installedNodeVersions,
      environment.nvmInstalledNodeVersions,
      formError,
      handleBrowseProjectPath,
      handleDropzonePath,
      handleInstallNodeVersionOnly,
      handlePackageManagerChange,
      handleProjectDialogOpenChange,
      handleSaveProject,
      inspectionNotice,
      isInspectingProject,
      isInstallingNodeVersion,
      isProjectDialogOpen,
      isSubmitting,
      nodeInstallProgress,
      openCreateProjectGroupDialog,
      pathInspection,
      projectDraft,
      projectGroups,
    ]
  );

  const nodeInstallDialog = useMemo(
    () => ({
      open: Boolean(nodeInstallRequest),
      projectName: nodeInstallRequest?.project.name ?? "",
      nodeVersion: nodeInstallRequest?.version ?? "",
      isInstalling: isInstallingNodeVersion,
      progress: nodeInstallProgress,
      onConfirm: handleInstallNodeVersionAndStart,
      onOpenChange: handleNodeInstallDialogOpenChange,
    }),
    [
      handleInstallNodeVersionAndStart,
      handleNodeInstallDialogOpenChange,
      isInstallingNodeVersion,
      nodeInstallProgress,
      nodeInstallRequest,
    ]
  );

  const nodeVersionSyncCard = useMemo(
    () => ({
      open:
        !isLoading &&
        environment.nodeManagerAvailable &&
        missingNvmNodeVersions.length > 0 &&
        !isNodeVersionSyncDismissed,
      missingVersions: missingNvmNodeVersions,
      isSyncing: isInstallingNodeVersion && nodeInstallProgress?.kind === "sync",
      progress: nodeInstallProgress?.kind === "sync" ? nodeInstallProgress : null,
      onDismiss: (): void => setIsNodeVersionSyncDismissed(true),
      onSync: (): Promise<void> =>
        runLockedAction("sync-node-versions-from-nvm", async () => {
          await handleSyncNodeVersionsFromNvm(missingNvmNodeVersions);
        }),
    }),
    [
      environment.nodeManagerAvailable,
      handleSyncNodeVersionsFromNvm,
      isInstallingNodeVersion,
      isLoading,
      isNodeVersionSyncDismissed,
      missingNvmNodeVersions,
      nodeInstallProgress,
      runLockedAction,
    ]
  );

  const nodeRetryDialog = useMemo(
    () => ({
      open: Boolean(nodeRetryTarget),
      projectName: nodeRetryTarget?.project.name ?? "",
      currentNodeVersion: nodeRetryTarget?.project.nodeVersion ?? "",
      suggestedNodeVersion: nodeRetryTarget?.suggestedNodeVersion ?? "",
      availableNodeVersions: environment.installedNodeVersions,
      isProcessing: isInstallingNodeVersion,
      onConfirm: handleRetryProjectWithSuggestedNode,
      onOpenChange: handleNodeRetryDialogOpenChange,
    }),
    [
      environment.installedNodeVersions,
      handleNodeRetryDialogOpenChange,
      handleRetryProjectWithSuggestedNode,
      isInstallingNodeVersion,
      nodeRetryTarget,
    ]
  );

  const startupSettingsDialog = useMemo(
    () => ({
      open: isStartupSettingsDialogOpen,
      settings: startupSettingsDraft,
      isSaving: isSavingStartupSettings,
      onSettingsChange: setStartupSettingsDraft,
      onOpenChange: handleStartupSettingsOpenChange,
      onSubmit: handleSaveStartupSettings,
    }),
    [
      handleSaveStartupSettings,
      handleStartupSettingsOpenChange,
      isSavingStartupSettings,
      isStartupSettingsDialogOpen,
      setStartupSettingsDraft,
      startupSettingsDraft,
    ]
  );

  const fnmSetupDialog = useMemo(
    () => ({
      open: !isLoading && !environment.nodeManagerAvailable,
      isInstalling: isInstallingNodeManager,
      installResult: nodeManagerInstallResult,
      isLogsOpen: isNodeManagerInstallLogsOpen,
      onInstall: handleInstallNodeManager,
      onLogsOpenChange: handleNodeManagerInstallLogsOpenChange,
      onOpenGuide: handleOpenNodeManagerGuide,
      onOpenLogs: () => setIsNodeManagerInstallLogsOpen(true),
      onRefresh: handleRefreshEnvironment,
    }),
    [
      environment.nodeManagerAvailable,
      handleInstallNodeManager,
      handleNodeManagerInstallLogsOpenChange,
      handleOpenNodeManagerGuide,
      handleRefreshEnvironment,
      isInstallingNodeManager,
      isNodeManagerInstallLogsOpen,
      isLoading,
      nodeManagerInstallResult,
      setIsNodeManagerInstallLogsOpen,
    ]
  );

  const deleteDialog = useMemo(
    () => ({
      project: deleteTarget,
      isDeleting: isSubmitting,
      onConfirm: handleDeleteProject,
      onOpenChange: handleDeleteDialogOpenChange,
    }),
    [deleteTarget, handleDeleteDialogOpenChange, handleDeleteProject, isSubmitting]
  );

  const projectGroupDialog = useMemo(
    () => ({
      open: Boolean(projectGroupDraft),
      draft: projectGroupDraft,
      errorMessage: projectGroupDialogError,
      isSubmitting: isSubmittingProjectGroup,
      onOpenChange: (open: boolean): void => {
        handleProjectGroupDialogOpenChange(open);
        handleProjectGroupDialogOpenChangeInternal(open);
      },
      onSubmit: (name: string): void =>
        void handleSaveProjectGroup(name, projectGroupDraft),
    }),
    [
      handleProjectGroupDialogOpenChange,
      handleProjectGroupDialogOpenChangeInternal,
      handleSaveProjectGroup,
      isSubmittingProjectGroup,
      projectGroupDialogError,
      projectGroupDraft,
    ]
  );

  const deleteProjectGroupDialog = useMemo(
    () => ({
      group: deleteProjectGroupTarget,
      affectedProjectCount: deleteProjectGroupTarget
        ? projectCountsByGroupId[deleteProjectGroupTarget.id] ?? 0
        : 0,
      isDeleting: isSubmittingProjectGroup,
      onConfirm: (): void => void handleDeleteProjectGroup(deleteProjectGroupTarget),
      onOpenChange: handleDeleteProjectGroupDialogOpenChange,
    }),
    [
      deleteProjectGroupTarget,
      handleDeleteProjectGroup,
      handleDeleteProjectGroupDialogOpenChange,
      isSubmittingProjectGroup,
      projectCountsByGroupId,
    ]
  );

  const assignProjectsToGroupDialog = useMemo(
    () => ({
      open: Boolean(projectGroupBatchAssignTarget),
      targetGroupName: projectGroupBatchAssignTarget?.name ?? "",
      sections: assignProjectsDialogSections,
      isSubmitting,
      onOpenChange: (open: boolean): void => {
        if (!open) {
          setProjectGroupBatchAssignTarget(null);
        }
      },
      onSubmit: (projectIds: string[]): void =>
        void handleAssignProjectsSubmit(projectIds),
    }),
    [assignProjectsDialogSections, handleAssignProjectsSubmit, isSubmitting, projectGroupBatchAssignTarget]
  );

  const confirmProjectGroupReassignDialog = useMemo(
    () => ({
      open: Boolean(pendingProjectGroupReassign),
      targetGroupName: pendingProjectGroupReassign?.targetGroupName ?? "",
      projectNames: pendingProjectGroupReassign?.projects.map((project) => project.name) ?? [],
      isSubmitting,
      onOpenChange: (open: boolean): void => {
        if (!open) {
          setPendingProjectGroupReassign(null);
        }
      },
      onConfirm: (): void => void handleConfirmProjectGroupReassign(),
    }),
    [handleConfirmProjectGroupReassign, isSubmitting, pendingProjectGroupReassign]
  );

  const logsDialog = useMemo(
    () => ({
      open: Boolean(terminalTarget),
      project: terminalTarget,
      runtime: terminalTarget ? runtimes[terminalTarget.id] : undefined,
      onOpenChange: handleLogsDialogOpenChange,
    }),
    [handleLogsDialogOpenChange, runtimes, terminalTarget]
  );

  const exitDialog = useMemo(
    () => ({
      request: appCloseRequest,
      isConfirming: isConfirmingAppClose,
      isMinimizing: isMinimizingAppClose,
      onConfirm: handleConfirmAppClose,
      onMinimize: handleMinimizeAppClose,
      onOpenChange: handleExitDialogOpenChange,
    }),
    [
      appCloseRequest,
      handleConfirmAppClose,
      handleExitDialogOpenChange,
      handleMinimizeAppClose,
      isConfirmingAppClose,
      isMinimizingAppClose,
    ]
  );

  const moveProjectGroupDialog = useMemo(
    () => ({
      open: Boolean(projectGroupMoveTarget),
      projectName: projectGroupMoveTarget?.name ?? "",
      currentGroupId: projectGroupMoveTarget?.currentGroupId ?? null,
      projectGroups,
      isSubmitting: projectGroupMoveTarget
        ? isActionLocked(`group:${projectGroupMoveTarget.id}`)
        : false,
      onOpenChange: (open: boolean): void => {
        if (!open) {
          setProjectGroupMoveTarget(null);
        }
      },
      onSubmit: async (groupId: string | null): Promise<void> => {
        if (!projectGroupMoveTarget) {
          return;
        }

        const project = getProjectById(projectGroupMoveTarget.id);
        if (!project) {
          setProjectGroupMoveTarget(null);
          return;
        }

        let wasSuccessful = false;
        await runLockedAction(
          `group:${project.id}`,
          async () => {
            wasSuccessful = await handleMoveProjectToGroup(project, groupId);
          },
          400
        );
        if (wasSuccessful) {
          setProjectGroupMoveTarget(null);
        }
      },
    }),
    [
      getProjectById,
      handleMoveProjectToGroup,
      isActionLocked,
      projectGroupMoveTarget,
      projectGroups,
      runLockedAction,
    ]
  );

  return {
    page,
    nodeVersionSyncCard,
    fnmSetupDialog,
    nodeVersionManagerDialog,
    projectFormDialog,
    nodeInstallDialog,
    nodeRetryDialog,
    startupSettingsDialog,
    deleteDialog,
    projectGroupDialog,
    deleteProjectGroupDialog,
    assignProjectsToGroupDialog,
    confirmProjectGroupReassignDialog,
    moveProjectGroupDialog,
    logsDialog,
    exitDialog,
  };
}
