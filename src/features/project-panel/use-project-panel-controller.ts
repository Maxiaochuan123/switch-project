import { useMemo } from "react";
import { useActionLocks } from "./use-action-locks";
import { useProjectAppActions } from "./use-project-app-actions";
import { useProjectBootstrap } from "./use-project-bootstrap";
import { useProjectCoreState } from "./use-project-core-state";
import { useProjectDialogState } from "./use-project-dialog-state";
import { useProjectFeedback } from "./use-project-feedback";
import { useProjectFormState } from "./use-project-form-state";
import { useProjectManagementActions } from "./use-project-management-actions";
import { useProjectRunActions } from "./use-project-run-actions";
import { useProjectRuntimeState } from "./use-project-runtime-state";
import { useProjectUtilityActions } from "./use-project-utility-actions";

export function useProjectPanelController() {
  const { isActionLocked, runLockedAction } = useActionLocks();
  const { setFeedback } = useProjectFeedback();
  const {
    environment,
    formError,
    getProjectById,
    projects,
    setEnvironment,
    setFormError,
    setStartupSettings,
    startupSettings,
    syncProjects,
  } = useProjectCoreState();

  const {
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
  } = useProjectFormState({
    environment,
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
    setStartupSettings,
    setStartupSettingsDraft,
    syncProjects,
    syncRuntimes,
  });

  const { handleDeleteProject, handleSaveProject, isSubmitting } =
    useProjectManagementActions({
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
    setNodeInstallRequest,
    setNodeRetryTarget,
    clearProjectStartFailure,
    setProjectStartFailure,
    showProjectOperationPanel,
    syncRuntimes,
  });

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
        onEdit: () =>
          void runLockedAction(
            `edit:${project.id}`,
            () => {
              openEditDialog(project);
            },
            400
          ),
        onDelete: () =>
          void runLockedAction(
            `delete:${project.id}`,
            () => {
              setDeleteTarget(project);
            },
            400
          ),
        onDeleteNodeModules: () => void handleDeleteProjectDependencies(project),
        onReinstallNodeModules: () =>
          void handleReinstallProjectDependenciesToast(project),
        onOpenTerminalOutput: () =>
          void runLockedAction(
            `terminal:${project.id}`,
            () => {
              setTerminalTarget(project);
            },
            400
          ),
        onStart: () => void handleStartProject(project.id),
        onStop: () => void handleStopProject(project.id),
        onOpenDirectory: () => void handleOpenProjectDirectory(project),
        onOpenUrl: (url: string) => void handleOpenExternal(project.id, url),
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
      projectOperationPanels,
      projectStartFailures,
      projects,
      runLockedAction,
      runtimes,
      setDeleteTarget,
      setTerminalTarget,
      ]
  );

  const page = useMemo(
    () => ({
      isLoading,
      loadingProjectCount,
      hasProjects: projects.length > 0,
      projectsCount: projects.length,
      projectCards,
      isActionLocked,
      runLockedAction,
      handleImportProjects,
      handleExportProjects,
      openStartupSettingsDialog,
      openCreateDialog,
    }),
    [
      handleExportProjects,
      handleImportProjects,
      isActionLocked,
      isLoading,
      loadingProjectCount,
      openCreateDialog,
      openStartupSettingsDialog,
      projectCards,
      projects.length,
      runLockedAction,
    ]
  );

  const projectFormDialog = useMemo(
    () => ({
      open: isProjectDialogOpen,
      draft: projectDraft,
      submitErrorMessage: formError,
      installedNodeVersions: environment.installedNodeVersions,
      activeNodeVersion: environment.activeNodeVersion,
      installedPackageManagers: environment.availablePackageManagers,
      isSubmitting,
      isInspectingProject,
      inspectionNotice,
      dropzoneError,
      pathInspection,
      isInstallingNodeVersion,
      onPackageManagerChange: handlePackageManagerChange,
      onInstallNodeVersion: handleInstallNodeVersionOnly,
      onBrowsePath: handleBrowseProjectPath,
      onPathSelected: handleDropzonePath,
      onOpenChange: handleProjectDialogOpenChange,
      onSubmit: handleSaveProject,
    }),
    [
      dropzoneError,
      environment.activeNodeVersion,
      environment.availablePackageManagers,
      environment.installedNodeVersions,
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
      pathInspection,
      projectDraft,
    ]
  );

  const nodeInstallDialog = useMemo(
    () => ({
      open: Boolean(nodeInstallRequest),
      projectName: nodeInstallRequest?.project.name ?? "",
      nodeVersion: nodeInstallRequest?.version ?? "",
      isInstalling: isInstallingNodeVersion,
      onConfirm: handleInstallNodeVersionAndStart,
      onOpenChange: handleNodeInstallDialogOpenChange,
    }),
    [
      handleInstallNodeVersionAndStart,
      handleNodeInstallDialogOpenChange,
      isInstallingNodeVersion,
      nodeInstallRequest,
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

  const deleteDialog = useMemo(
    () => ({
      project: deleteTarget,
      isDeleting: isSubmitting,
      onConfirm: handleDeleteProject,
      onOpenChange: handleDeleteDialogOpenChange,
    }),
    [
      deleteTarget,
      handleDeleteDialogOpenChange,
      handleDeleteProject,
      isSubmitting,
    ]
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

  return {
    page,
    projectFormDialog,
    nodeInstallDialog,
    nodeRetryDialog,
    startupSettingsDialog,
    deleteDialog,
    logsDialog,
    exitDialog,
  };
}
