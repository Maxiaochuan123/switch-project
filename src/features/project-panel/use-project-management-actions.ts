import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { desktopApi } from "@/lib/desktop";
import { isProjectRuntimeActive, getErrorMessage, type Feedback } from "./helpers";
import type { ProjectDraft } from "./project-draft";
import type {
  ProjectConfig,
  ProjectPackageManager,
  ProjectRuntime,
} from "@/shared/contracts";

type UseProjectManagementActionsOptions = {
  deleteTarget: ProjectConfig | null;
  getProjectById: (projectId: string) => ProjectConfig | undefined;
  handleProjectDialogOpenChange: (open: boolean) => void;
  loadProjectData: () => Promise<void>;
  projects: ProjectConfig[];
  refreshProjectDiagnosis: (projectId: string) => void;
  runtimes: Record<string, ProjectRuntime>;
  setDeleteTarget: Dispatch<SetStateAction<ProjectConfig | null>>;
  setFeedback: Dispatch<SetStateAction<Feedback | null>>;
  setFormError: Dispatch<SetStateAction<string | null>>;
  setTerminalTarget: Dispatch<SetStateAction<ProjectConfig | null>>;
  terminalTargetId?: string;
};

export function useProjectManagementActions({
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
  terminalTargetId,
}: UseProjectManagementActionsOptions) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizeProjectPath = useCallback((projectPath: string) => projectPath.trim().toLowerCase(), []);

  const handleSaveProject = useCallback(
    async (nextDraft: ProjectDraft) => {
      const currentProject = nextDraft.id ? getProjectById(nextDraft.id) ?? null : null;
      const draft = {
        id: nextDraft.id,
        name: nextDraft.name.trim(),
        path: nextDraft.path.trim(),
        nodeVersion: nextDraft.nodeVersion.trim(),
        packageManager: nextDraft.packageManager,
        startCommand: nextDraft.startCommand.trim(),
        autoStartOnAppLaunch: nextDraft.autoStartOnAppLaunch,
        autoOpenLocalUrlOnStart: nextDraft.autoOpenLocalUrlOnStart,
      };
      const duplicateProject = projects.find((project) => {
        if (project.id === draft.id) {
          return false;
        }

        return normalizeProjectPath(project.path) === normalizeProjectPath(draft.path);
      });

      if (duplicateProject) {
        setFormError("项目已存在");
        setFeedback({
          variant: "destructive",
          title: "项目已存在",
          message: "这个项目已经添加过了，请不要重复添加。",
        });
        return;
      }

      if (
        currentProject &&
        isProjectRuntimeActive(runtimes[currentProject.id]?.status) &&
        (currentProject.path !== draft.path ||
          currentProject.nodeVersion !== draft.nodeVersion ||
          currentProject.packageManager !== draft.packageManager ||
          currentProject.startCommand !== draft.startCommand)
      ) {
        setFormError(
          "项目正在运行中，请先停止后再修改路径、Node 版本、包管理器或启动命令。"
        );
        return;
      }

      setIsSubmitting(true);
      setFormError(null);

      try {
        const nextProject: ProjectConfig = {
          id: draft.id ?? crypto.randomUUID(),
          name: draft.name,
          path: draft.path,
          nodeVersion: draft.nodeVersion,
          packageManager: draft.packageManager as ProjectPackageManager,
          startCommand: draft.startCommand,
          autoStartOnAppLaunch: draft.autoStartOnAppLaunch,
          autoOpenLocalUrlOnStart: draft.autoOpenLocalUrlOnStart,
        };

        await desktopApi.saveProject(nextProject);
        await loadProjectData();
        refreshProjectDiagnosis(nextProject.id);
        handleProjectDialogOpenChange(false);
        setFeedback(null);
      } catch (error) {
        setFormError(getErrorMessage(error));
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      getProjectById,
      handleProjectDialogOpenChange,
      loadProjectData,
      normalizeProjectPath,
      projects,
      refreshProjectDiagnosis,
      runtimes,
      setFeedback,
      setFormError,
    ]
  );

  const handleDeleteProject = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }

    setIsSubmitting(true);

    try {
      await desktopApi.deleteProject(deleteTarget.id);
      await loadProjectData();
      setDeleteTarget(null);

      if (terminalTargetId === deleteTarget.id) {
        setTerminalTarget(null);
      }
    } catch (error) {
      setFeedback({
        variant: "destructive",
        title: "移除项目失败",
        message: getErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    deleteTarget,
    loadProjectData,
    setDeleteTarget,
    setFeedback,
    setTerminalTarget,
    terminalTargetId,
  ]);

  return {
    handleDeleteProject,
    handleSaveProject,
    isSubmitting,
  };
}
