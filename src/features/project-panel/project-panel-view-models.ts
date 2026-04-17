import type {
  OperationEvent,
  ProjectConfig,
  ProjectDiagnosis,
  ProjectGroup,
  ProjectRuntime,
} from "@/shared/contracts";

export const ALL_GROUP_TAB_KEY = "__all__";
export const UNGROUPED_SECTION_KEY = "__ungrouped__";

export type ProjectGroupBatchAssignTarget = {
  id: string;
  name: string;
};

export type PendingProjectGroupReassign = {
  targetGroupId: string;
  targetGroupName: string;
  projects: ProjectConfig[];
};

export type GroupTabViewModel = {
  key: string;
  name: string;
  count: number;
};

export type ProjectCardViewModel = {
  key: string;
  project: ProjectConfig;
  runtime?: ProjectRuntime;
  runtimeFailureMessage?: string;
  operationPanel?: OperationEvent;
  diagnosis?: ProjectDiagnosis;
  isDiagnosisPending: boolean;
  isStartPending: boolean;
  isStopPending: boolean;
  isStartLocked: boolean;
  isStopLocked: boolean;
  isEditLocked: boolean;
  isDeleteLocked: boolean;
  isDeleteNodeModulesLocked: boolean;
  isReinstallNodeModulesLocked: boolean;
  isTerminalLocked: boolean;
  isDirectoryLocked: boolean;
  isAddressLocked: boolean;
  isMoveGroupLocked: boolean;
  availableGroups: Pick<ProjectGroup, "id" | "name">[];
  onEdit: () => void;
  onDelete: () => void;
  onDeleteNodeModules: () => void;
  onReinstallNodeModules: () => void;
  onOpenTerminalOutput: () => void;
  onStart: () => void;
  onStop: () => void;
  onOpenDirectory: () => void;
  onOpenUrl: (url: string) => void;
  onOpenMoveGroupDialog: () => void;
};

export type VisibleProjectCardViewModel = ProjectCardViewModel & {
  groupBadgeLabel: string | null;
};

/**
 * 统计每个分组中的项目数量
 * @param projects - 项目列表
 * @returns 分组ID到项目数量的映射，未分组的项目使用 UNGROUPED_SECTION_KEY
 */
export function countProjectsByGroup(projects: ProjectConfig[]) {
  return projects.reduce<Record<string, number>>((counts, project) => {
    const key = project.groupId ?? UNGROUPED_SECTION_KEY;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

/**
 * 构建分组标签视图模型列表
 * @param projects - 项目列表
 * @param projectGroups - 分组列表
 * @param projectCountsByGroupId - 分组ID到项目数量的映射
 * @returns 包含"全部"标签和各分组标签的视图模型数组
 */
export function buildGroupTabs(
  projects: ProjectConfig[],
  projectGroups: ProjectGroup[],
  projectCountsByGroupId: Record<string, number>
): GroupTabViewModel[] {
  return [
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
  ];
}

/**
 * 构建可见的项目卡片视图模型列表，根据当前激活的分组标签进行过滤和排序
 * @param activeGroupTab - 当前激活的分组标签ID
 * @param projectCards - 项目卡片视图模型列表
 * @param projectGroupNameMap - 分组ID到分组名称的映射
 * @param projectGroups - 分组列表
 * @returns 过滤和排序后的可见项目卡片列表
 */
export function buildVisibleProjectCards(
  activeGroupTab: string,
  projectCards: ProjectCardViewModel[],
  projectGroupNameMap: Record<string, string>,
  projectGroups: ProjectGroup[]
): VisibleProjectCardViewModel[] {
  const groupOrderMap = Object.fromEntries(
    projectGroups.map((group) => [group.id, group.order])
  );

  const sortCards = (cards: ProjectCardViewModel[]) =>
    [...cards].sort((left, right) => {
      const leftGroupOrder =
        left.project.groupId === null
          ? -1
          : (groupOrderMap[left.project.groupId] ?? Number.MAX_SAFE_INTEGER);
      const rightGroupOrder =
        right.project.groupId === null
          ? -1
          : (groupOrderMap[right.project.groupId] ?? Number.MAX_SAFE_INTEGER);

      return (
        leftGroupOrder - rightGroupOrder ||
        left.project.order - right.project.order ||
        left.project.name.localeCompare(right.project.name, "zh-CN")
      );
    });

  if (activeGroupTab === ALL_GROUP_TAB_KEY) {
    return sortCards(projectCards).map((card): VisibleProjectCardViewModel => ({
      ...card,
      groupBadgeLabel: card.project.groupId
        ? projectGroupNameMap[card.project.groupId] ?? null
        : null,
    }));
  }

  return sortCards(projectCards)
    .filter((card) => (card.project.groupId ?? null) === activeGroupTab)
    .map((card): VisibleProjectCardViewModel => ({
      ...card,
      groupBadgeLabel: null,
    }));
}

/**
 * 查找当前选中的管理分组
 * @param activeGroupTab - 当前激活的分组标签ID
 * @param projectGroups - 分组列表
 * @returns 找到的分组对象，如果未找到则返回 null
 */
export function findSelectedManagedGroup(
  activeGroupTab: string,
  projectGroups: ProjectGroup[]
) {
  return projectGroups.find((group) => group.id === activeGroupTab) ?? null;
}

/**
 * 构建分配项目对话框的分组区域列表
 * @param targetGroup - 目标分组信息
 * @param projectGroups - 分组列表
 * @param projects - 项目列表
 * @returns 包含未分组和各分组的项目列表，如果目标分组为空则返回空数组
 */
export function buildAssignProjectsDialogSections(
  targetGroup: ProjectGroupBatchAssignTarget | null,
  projectGroups: ProjectGroup[],
  projects: ProjectConfig[]
) {
  if (!targetGroup) {
    return [];
  }

  return [
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
          isCurrentGroup: group.id === targetGroup.id,
        })),
    })),
  ];
}
