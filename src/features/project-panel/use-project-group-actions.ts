import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { desktopApi } from "@/lib/desktop";
import { getErrorMessage, type Feedback } from "./helpers";
import type { ProjectConfig, ProjectGroup } from "@/shared/contracts";
import type { ProjectDraft } from "./project-draft";
import type { ProjectGroupDraft } from "./use-project-dialog-state";

type UseProjectGroupActionsOptions = {
  loadProjectData: () => Promise<void>;
  projects: ProjectConfig[];
  projectGroups: ProjectGroup[];
  setDeleteProjectGroupTarget: Dispatch<SetStateAction<ProjectGroup | null>>;
  setFeedback: Dispatch<SetStateAction<Feedback | null>>;
  setIsSubmittingProjectGroup: Dispatch<SetStateAction<boolean>>;
  setProjectDraft: Dispatch<SetStateAction<ProjectDraft>>;
  setProjectGroupDraft: Dispatch<SetStateAction<ProjectGroupDraft | null>>;
  setProjectGroups: Dispatch<SetStateAction<ProjectGroup[]>>;
  syncProjects: (nextProjects: ProjectConfig[]) => void;
};

export function useProjectGroupActions({
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
}: UseProjectGroupActionsOptions) {
  const [projectGroupDialogError, setProjectGroupDialogError] = useState<string | null>(null);
  const [assignCreatedGroupToDraft, setAssignCreatedGroupToDraft] = useState(false);

  const openCreateProjectGroupDialog = useCallback((assignToDraft = false) => {
    setAssignCreatedGroupToDraft(assignToDraft);
    setProjectGroupDialogError(null);
    setProjectGroupDraft({ name: "" });
  }, [setProjectGroupDraft]);

  const openRenameProjectGroupDialog = useCallback((group: ProjectGroup) => {
    setAssignCreatedGroupToDraft(false);
    setProjectGroupDialogError(null);
    setProjectGroupDraft({
      id: group.id,
      name: group.name,
    });
  }, [setProjectGroupDraft]);

  const handleProjectGroupDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setAssignCreatedGroupToDraft(false);
      setProjectGroupDialogError(null);
      setProjectGroupDraft(null);
    }
  }, [setProjectGroupDraft]);

  const handleSaveProjectGroup = useCallback(
    async (name: string, draft: ProjectGroupDraft | null) => {
      setIsSubmittingProjectGroup(true);
      setProjectGroupDialogError(null);

      try {
        const trimmedName = name.trim();
        const nextGroup = draft?.id
          ? await desktopApi.updateProjectGroup({
              id: draft.id,
              name: trimmedName,
              order:
                projectGroups.find((group) => group.id === draft.id)?.order ?? 0,
            })
          : await desktopApi.createProjectGroup(trimmedName);

        await loadProjectData();

        if (assignCreatedGroupToDraft && !draft?.id) {
          setProjectDraft((current) => ({
            ...current,
            groupId: nextGroup.id,
          }));
        }

        setProjectGroupDraft(null);
        setAssignCreatedGroupToDraft(false);
        setFeedback(null);
      } catch (error) {
        setProjectGroupDialogError(getErrorMessage(error));
      } finally {
        setIsSubmittingProjectGroup(false);
      }
    },
    [
      assignCreatedGroupToDraft,
      loadProjectData,
      projectGroups,
      setFeedback,
      setIsSubmittingProjectGroup,
      setProjectDraft,
      setProjectGroupDraft,
    ]
  );

  const handleDeleteProjectGroup = useCallback(
    async (group: ProjectGroup | null) => {
      if (!group) {
        return;
      }

      setIsSubmittingProjectGroup(true);
      setDeleteProjectGroupTarget(null);
      setProjectGroups((current) => current.filter((item) => item.id !== group.id));
      syncProjects(
        projects.map((project) =>
          project.groupId === group.id ? { ...project, groupId: null } : project
        )
      );
      setProjectDraft((current) =>
        current.groupId === group.id ? { ...current, groupId: null } : current
      );

      try {
        await desktopApi.deleteProjectGroup(group.id);
      } catch (error) {
        setFeedback({
          variant: "destructive",
          title: "删除分组失败",
          message: getErrorMessage(error),
        });
        await loadProjectData();
      } finally {
        setIsSubmittingProjectGroup(false);
      }
    },
    [
      loadProjectData,
      projects,
      setDeleteProjectGroupTarget,
      setFeedback,
      setIsSubmittingProjectGroup,
      setProjectDraft,
      setProjectGroups,
      syncProjects,
    ]
  );

  const handleMoveProjectGroup = useCallback(
    async (groupId: string, direction: "up" | "down") => {
      const currentIndex = projectGroups.findIndex((group) => group.id === groupId);
      if (currentIndex < 0) {
        return;
      }

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= projectGroups.length) {
        return;
      }

      const nextGroupIds = projectGroups.map((group) => group.id);
      const [movedGroupId] = nextGroupIds.splice(currentIndex, 1);
      nextGroupIds.splice(targetIndex, 0, movedGroupId!);

      try {
        await desktopApi.reorderProjectGroups(nextGroupIds);
        await loadProjectData();
      } catch (error) {
        setFeedback({
          variant: "destructive",
          title: "调整分组顺序失败",
          message: getErrorMessage(error),
        });
      }
    },
    [loadProjectData, projectGroups, setFeedback]
  );

  return {
    handleDeleteProjectGroup,
    handleMoveProjectGroup,
    handleProjectGroupDialogOpenChange,
    handleSaveProjectGroup,
    openCreateProjectGroupDialog,
    openRenameProjectGroupDialog,
    projectGroupDialogError,
  };
}
