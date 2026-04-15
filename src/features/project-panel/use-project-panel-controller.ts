import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectConfig } from "@/shared/contracts";
import { getMissingNodeVersions } from "./project-draft";
import { useActionLocks } from "./use-action-locks";
import { useProjectAppActions } from "./use-project-app-actions";
import { useProjectBootstrap } from "./use-project-bootstrap";
import { useProjectCoreState } from "./use-project-core-state";
import { useProjectDialogState } from "./use-project-dialog-state";
import { useProjectFeedback } from "./use-project-feedback";
import { useProjectFormState } from "./use-project-form-state";
import { useProjectGroupActions } from "./use-project-group-actions";
import { useProjectManagementActions } from "./use-project-management-actions";
import { useProjectNodeManagerActions } from "./use-project-node-manager-actions";
import { useProjectRunActions } from "./use-project-run-actions";
import { useProjectRuntimeState } from "./use-project-runtime-state";
import { useProjectUtilityActions } from "./use-project-utility-actions";

const ALL_GROUP_TAB_KEY = "__all__";
const UNGROUPED_SECTION_KEY = "__ungrouped__";

type ProjectGroupBatchAssignTarget = {
  id: string;
  name: string;
};

type PendingProjectGroupReassign = {
  targetGroupId: string;
  targetGroupName: string;
  projects: ProjectConfig[];
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
    onSuggestRetry: (suggestion) => {
      setNodeRetryTarget((current) => {
        if (
          current?.project.id === suggestion.project.id &&
          current.suggestedNodeVersion === suggestion.suggestedNodeVersion
        ) {
          return current;
        }

        return suggestion;
      });
    },
    onClearRetrySuggestion: (projectId) => {
      setNodeRetryTarget((current) => (current?.project.id === projectId ? null : current));
    },
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

  const {
    handleAssignProjectsToGroup,
    handleDeleteProject,
    handleMoveProjectToGroup,
    handleSaveProject,
    isSubmitting,
  } = useProjectManagementActions({
    deleteTarget,
    getProjectById,
    handleProjectDialogOpenChange,
    loadProjectData,
    projects,
    refreshProjectDiagnosis,
    runtimes,
    setDeleteTarget,
    setFeedback,
    setFormError,
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

  const [isNodeVersionSyncDismissed, setIsNodeVersionSyncDismissed] = useState(false);
  const [activeGroupTab, setActiveGroupTab] = useState(ALL_GROUP_TAB_KEY);

  const projectCountsByGroupId = useMemo(
    () =>
      projects.reduce<Record<string, number>>((counts, project) => {
        const key = project.groupId ?? UNGROUPED_SECTION_KEY;
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
    [projects]
  );

  const {
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

  const projectGroupNameMap = useMemo(
    () => Object.fromEntries(projectGroups.map((group) => [group.id, group.name])),
    [projectGroups]
  );

  const projectCards = useMemo(
    () =>
      projects.map((project) => ({
        key: project.id,
        project,
        runtime: runtimes[project.id],
        runtimeFailureMessage: projectStartFailures[project.id],
        operationPanel: projectOperationPanels[project.id],
        diagnosis: projectDiagnoses[project.id],
        isDiagnosisPending: isProjectDiagnosisPending(project.id),
        isStartPending:
          isActionLocked(`start:${project.id}`) || runtimes[project.id]?.status === "starting",
        isStartLocked:
          isActionLocked(`start:${project.id}`) ||
          isProjectDiagnosisPending(project.id) ||
          isProjectDependencyOperationLocked(project.id),
        isStopPending: isActionLocked(`stop:${project.id}`),
        isStopLocked: isActionLocked(`stop:${project.id}`),
        isEditLocked: isActionLocked(`edit:${project.id}`),
        isDeleteLocked: isActionLocked(`delete:${project.id}`),
        isDeleteNodeModulesLocked:
          isActionLocked(`delete-node-modules:${project.id}`) ||
          isProjectDependencyOperationLocked(project.id),
        isReinstallNodeModulesLocked:
          isActionLocked(`reinstall-node-modules:${project.id}`) ||
          isProjectDependencyOperationLocked(project.id),
        isTerminalLocked: isActionLocked(`terminal:${project.id}`),
        isDirectoryLocked: isActionLocked(`directory:${project.id}`),
        isAddressLocked: isActionLocked(`url:${project.id}`),
        isMoveGroupLocked: isActionLocked(`group:${project.id}`),
        availableGroups: projectGroups,
        onEdit: (): void =>
          void runLockedAction(
            `edit:${project.id}`,
            () => {
              openEditDialog(project);
            },
            400
          ),
        onDelete: (): void =>
          void runLockedAction(
            `delete:${project.id}`,
            () => {
              setDeleteTarget(project);
            },
            400
          ),
        onDeleteNodeModules: (): void => void handleDeleteProjectDependencies(project),
        onReinstallNodeModules: (): void =>
          void handleReinstallProjectDependenciesToast(project),
        onOpenTerminalOutput: (): void =>
          void runLockedAction(
            `terminal:${project.id}`,
            () => {
              setTerminalTarget(project);
            },
            400
          ),
        onStart: (): void => void handleStartProject(project.id),
        onStop: (): void => void handleStopProject(project.id),
        onOpenDirectory: (): void => void handleOpenProjectDirectory(project),
        onOpenUrl: (url: string): void => void handleOpenExternal(project.id, url),
        onOpenMoveGroupDialog: (): void =>
          setProjectGroupMoveTarget({
            id: project.id,
            name: project.name,
            currentGroupId: project.groupId ?? null,
          }),
      })),
    [
      handleDeleteProjectDependencies,
      handleOpenExternal,
      handleOpenProjectDirectory,
      handleReinstallProjectDependenciesToast,
      handleStartProject,
      handleStopProject,
      isActionLocked,
      isProjectDiagnosisPending,
      isProjectDependencyOperationLocked,
      openEditDialog,
      projectDiagnoses,
      projectGroups,
      projectOperationPanels,
      projectStartFailures,
      projects,
      runLockedAction,
      runtimes,
      setDeleteTarget,
      setTerminalTarget,
    ]
  );

  const groupTabs = useMemo(
    () => [
      {
        key: ALL_GROUP_TAB_KEY,
        name: "全部",
        count: projects.length,
      },
      ...projectGroups.map((group) => ({
        key: group.id,
        name: group.name,
        count: projectCountsByGroupId[group.id] ?? 0,
      })),
    ],
    [projectCountsByGroupId, projectGroups, projects.length]
  );

  const visibleProjectCards = useMemo(() => {
    if (activeGroupTab === ALL_GROUP_TAB_KEY) {
      return projectCards.map((card) => ({
        ...card,
        groupBadgeLabel: (card.project.groupId ?? null)
          ? projectGroupNameMap[card.project.groupId ?? ""] ?? null
          : null,
      }));
    }

    return projectCards
      .filter((card) => (card.project.groupId ?? null) === activeGroupTab)
      .map((card) => ({
        ...card,
        groupBadgeLabel: null,
      }));
  }, [activeGroupTab, projectCards, projectGroupNameMap]);

  const selectedManagedGroup = useMemo(
    () => projectGroups.find((group) => group.id === activeGroupTab) ?? null,
    [activeGroupTab, projectGroups]
  );

  const assignProjectsDialogSections = useMemo(() => {
    if (!projectGroupBatchAssignTarget) {
      return [];
    }

    const sections = [
      {
        key: UNGROUPED_SECTION_KEY,
        name: "未分组",
        projects: projects
          .filter((project) => (project.groupId ?? null) === null)
          .map((project) => ({
            id: project.id,
            name: project.name,
            isCurrentGroup: false,
          })),
      },
      ...projectGroups.map((group) => ({
        key: group.id,
        name: group.name,
        projects: projects
          .filter((project) => (project.groupId ?? null) === group.id)
          .map((project) => ({
            id: project.id,
            name: project.name,
            isCurrentGroup: group.id === projectGroupBatchAssignTarget.id,
          })),
      })),
    ];

    return sections;
  }, [projectGroupBatchAssignTarget, projectGroups, projects]);

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

  const page = useMemo(
    () => ({
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
      openStartupSettingsDialog,
      openCreateDialog,
    }),
    [
      activeGroupTab,
      groupTabs,
      handleExportProjects,
      handleImportProjects,
      isActionLocked,
      isLoading,
      loadingProjectCount,
      openCreateDialog,
      openCreateProjectGroupDialog,
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
      projectGroups,
      submitErrorMessage: formError,
      installedNodeVersions: environment.installedNodeVersions,
      nvmInstalledNodeVersions: environment.nvmInstalledNodeVersions,
      activeNodeVersion: environment.activeNodeVersion,
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
      onOpenChange: handleProjectDialogOpenChange,
      onSubmit: handleSaveProject,
    }),
    [
      dropzoneError,
      environment.activeNodeVersion,
      environment.availablePackageManagers,
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
