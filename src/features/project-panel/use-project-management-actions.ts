import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { desktopApi } from "@/lib/desktop";
import { isProjectRuntimeActive, getErrorMessage, type Feedback } from "./helpers";
import type { ProjectDraft } from "./project-draft";
import type {
  ProjectConfig,
  ProjectGroup,
  ProjectPackageManager,
  ProjectRuntime,
} from "@/shared/contracts";

type UseProjectManagementActionsOptions = {
  deleteTarget: ProjectConfig | null;
  getProjectById: (projectId: string) => ProjectConfig | undefined;
  clearDraftProjectGroups: () => void;
  handleProjectDialogOpenChange: (open: boolean) => void;
  loadProjectData: () => Promise<void>;
  pendingProjectGroups: { id: string; name: string }[];
  projects: ProjectConfig[];
  refreshProjectDiagnosis: (projectId: string) => void;
  runtimes: Record<string, ProjectRuntime>;
  setActiveGroupTab?: (groupId: string) => void;
  setDeleteTarget: Dispatch<SetStateAction<ProjectConfig | null>>;
  setFeedback: Dispatch<SetStateAction<Feedback | null>>;
  setFormError: Dispatch<SetStateAction<string | null>>;
  setProjectGroups: Dispatch<SetStateAction<ProjectGroup[]>>;
  setTerminalTarget: Dispatch<SetStateAction<ProjectConfig | null>>;
  syncProjects: (projects: ProjectConfig[]) => void;
  terminalTargetId?: string;
};

export function useProjectManagementActions({
  deleteTarget,
  getProjectById,
  clearDraftProjectGroups,
  handleProjectDialogOpenChange,
  loadProjectData,
  pendingProjectGroups,
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
  terminalTargetId,
}: UseProjectManagementActionsOptions) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizeProjectPath = useCallback(
    (projectPath: string) => projectPath.trim().toLowerCase(),
    []
  );

  const handleSaveProject = useCallback(
    async (nextDraft: ProjectDraft) => {
      const currentProject = nextDraft.id ? getProjectById(nextDraft.id) ?? null : null;
      const draft = {
        id: nextDraft.id,
        name: nextDraft.name.trim(),
        path: nextDraft.path.trim(),
        groupId: nextDraft.groupId,
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
        let resolvedGroupId = draft.groupId;
        let createdGroupId: string | null = null;
        let createdGroup: ProjectGroup | null = null;
        
        const pendingGroup = pendingProjectGroups.find((group) => group.id === draft.groupId);
        if (pendingGroup) {
          createdGroup = await desktopApi.createProjectGroup(pendingGroup.name);
          resolvedGroupId = createdGroup.id;
          createdGroupId = createdGroup.id;
          // 立即更新分组列表
          setProjectGroups((current) => [...current, createdGroup!]);
        }

        const nextProject: ProjectConfig = {
          id: draft.id ?? crypto.randomUUID(),
          name: draft.name,
          path: draft.path,
          groupId: resolvedGroupId,
          order: currentProject?.order ?? 0,
          nodeVersion: draft.nodeVersion,
          packageManager: draft.packageManager as ProjectPackageManager,
          startCommand: draft.startCommand,
          autoStartOnAppLaunch: draft.autoStartOnAppLaunch,
          autoOpenLocalUrlOnStart: draft.autoOpenLocalUrlOnStart,
        };

        await desktopApi.saveProject(nextProject);
        
        // 乐观更新: 立即更新项目列表
        if (currentProject) {
          // 更新现有项目
          syncProjects(
            projects.map((p) => (p.id === nextProject.id ? nextProject : p))
          );
        } else {
          // 添加新项目
          syncProjects([...projects, nextProject]);
        }
        
        if (createdGroupId) {
          setActiveGroupTab?.(createdGroupId);
        }
        refreshProjectDiagnosis(nextProject.id);
        clearDraftProjectGroups();
        handleProjectDialogOpenChange(false);
        setFeedback(null);
      } catch (error) {
        setFormError(getErrorMessage(error));
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      clearDraftProjectGroups,
      getProjectById,
      handleProjectDialogOpenChange,
      normalizeProjectPath,
      pendingProjectGroups,
      projects,
      refreshProjectDiagnosis,
      runtimes,
      setActiveGroupTab,
      setFeedback,
      setFormError,
      setProjectGroups,
      syncProjects,
    ]
  );

  const handleDeleteProject = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }

    const deletingProject = deleteTarget;

    setIsSubmitting(true);
    setDeleteTarget(null);
    
    // 乐观更新: 先更新 UI
    const previousProjects = projects;
    syncProjects(projects.filter((project) => project.id !== deletingProject.id));
    if (terminalTargetId === deletingProject.id) {
      setTerminalTarget(null);
    }

    try {
      await desktopApi.deleteProject(deletingProject.id);
      // 删除成功,不需要重新加载
    } catch (error) {
      // 失败时回滚
      syncProjects(previousProjects);
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
    projects,
    setDeleteTarget,
    setFeedback,
    setTerminalTarget,
    syncProjects,
    terminalTargetId,
  ]);

  const handleMoveProjectToGroup = useCallback(
    async (project: ProjectConfig, groupId: string | null) => {
      // 乐观更新: 先更新 UI
      const previousProjects = projects;
      const updatedProject = { ...project, groupId };
      syncProjects(
        projects.map((p) => (p.id === project.id ? updatedProject : p))
      );

      try {
        await desktopApi.saveProject(updatedProject);
        return true;
      } catch (error) {
        // 失败时回滚
        syncProjects(previousProjects);
        setFeedback({
          variant: "destructive",
          title: "切换分组失败",
          message: getErrorMessage(error),
        });
        return false;
      }
    },
    [projects, setFeedback, syncProjects]
  );

  const handleAssignProjectsToGroup = useCallback(
    async (targetGroupId: string, targetProjects: ProjectConfig[]) => {
      if (targetProjects.length === 0) {
        return true;
      }

      setIsSubmitting(true);

      // 乐观更新: 先更新 UI
      const previousProjects = projects;
      const targetProjectIds = new Set(targetProjects.map((p) => p.id));
      syncProjects(
        projects.map((project) =>
          targetProjectIds.has(project.id)
            ? { ...project, groupId: targetGroupId }
            : project
        )
      );

      try {
        await desktopApi.assignProjectsToGroup(
          targetGroupId,
          targetProjects.map((project) => project.id)
        );
        return true;
      } catch (error) {
        // 失败时回滚
        syncProjects(previousProjects);
        
        setFeedback({
          variant: "destructive",
          title: "批量加入分组失败",
          message: getErrorMessage(error),
        });
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [projects, setFeedback, syncProjects]
  );

  return {
    handleAssignProjectsToGroup,
    handleDeleteProject,
    handleMoveProjectToGroup,
    handleSaveProject,
    isSubmitting,
  };
}
