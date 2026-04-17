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
  const [draftProjectGroups, setDraftProjectGroups] = useState<ProjectGroup[]>([]);

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
        if (assignCreatedGroupToDraft && !draft?.id) {
          const nextDraftGroup: ProjectGroup = {
            id: `draft-group:${crypto.randomUUID()}`,
            name: trimmedName,
            order: projectGroups.length + draftProjectGroups.length,
          };

          setDraftProjectGroups((current) => [...current, nextDraftGroup]);
          setProjectDraft((current) => ({
            ...current,
            groupId: nextDraftGroup.id,
          }));
          setProjectGroupDraft(null);
          setAssignCreatedGroupToDraft(false);
          setFeedback(null);
          return;
        }

        const nextGroup = draft?.id
          ? await desktopApi.updateProjectGroup({
              id: draft.id,
              name: trimmedName,
              order:
                projectGroups.find((group) => group.id === draft.id)?.order ?? 0,
            })
          : await desktopApi.createProjectGroup(trimmedName);

        // 只更新分组列表,不需要重新加载所有数据
        if (draft?.id) {
          // 更新现有分组
          setProjectGroups((current) =>
            current.map((group) =>
              group.id === nextGroup.id ? nextGroup : group
            )
          );
        } else {
          // 添加新分组
          setProjectGroups((current) => [...current, nextGroup]);
        }

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
      draftProjectGroups.length,
      loadProjectData,
      projectGroups,
      setDraftProjectGroups,
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

      // 乐观更新: 先更新 UI
      const previousGroups = projectGroups;
      const reorderedGroups = await desktopApi.reorderProjectGroups(nextGroupIds);
      setProjectGroups(reorderedGroups);

      try {
        // API 调用已经在上面完成,这里只是为了保持结构
      } catch (error) {
        // 失败时回滚
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

  return {
    clearDraftProjectGroups: (): void => setDraftProjectGroups([]),
    draftProjectGroups,
    handleDeleteProjectGroup,
    handleMoveProjectGroup,
    handleProjectGroupDialogOpenChange,
    handleSaveProjectGroup,
    openCreateProjectGroupDialog,
    openRenameProjectGroupDialog,
    projectGroupDialogError,
  };
}
