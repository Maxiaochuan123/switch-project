import { useMemo } from "react";
import type {
  OperationEvent,
  ProjectConfig,
  ProjectDiagnosis,
  ProjectGroup,
  ProjectRuntime,
} from "@/shared/contracts";
import type { ProjectCardViewModel } from "./project-panel-view-models";

type UseProjectCardViewModelsOptions = {
  handleDeleteProjectDependencies: (project: ProjectConfig) => Promise<void>;
  handleOpenExternal: (projectId: string, url: string) => Promise<void>;
  handleOpenProjectDirectory: (project: ProjectConfig) => Promise<void>;
  handleReinstallProjectDependenciesToast: (project: ProjectConfig) => Promise<void>;
  handleStartProject: (projectId: string) => Promise<void>;
  handleStopProject: (projectId: string) => Promise<void>;
  isActionLocked: (key: string) => boolean;
  isProjectDependencyOperationLocked: (projectId: string) => boolean;
  isProjectDiagnosisPending: (projectId: string) => boolean;
  openEditDialog: (project: ProjectConfig) => void;
  projectDiagnoses: Record<string, ProjectDiagnosis>;
  projectGroups: Pick<ProjectGroup, "id" | "name">[];
  projectOperationPanels: Record<string, OperationEvent>;
  projectStartFailures: Record<string, string>;
  projects: ProjectConfig[];
  runLockedAction: (
    key: string,
    action: () => Promise<void> | void,
    cooldownMs?: number
  ) => Promise<void>;
  runtimes: Record<string, ProjectRuntime>;
  setDeleteTarget: (project: ProjectConfig) => void;
  setProjectGroupMoveTarget: (
    target: { id: string; name: string; currentGroupId: string | null }
  ) => void;
  setTerminalTarget: (project: ProjectConfig) => void;
};

export function useProjectCardViewModels({
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
}: UseProjectCardViewModelsOptions) {
  return useMemo<ProjectCardViewModel[]>(
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
    ]
  );
}
