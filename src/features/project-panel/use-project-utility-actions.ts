import { useCallback, type Dispatch, type SetStateAction } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { desktopApi } from "@/lib/desktop";
import type { OperationEvent, ProjectConfig } from "@/shared/contracts";
import { getErrorMessage, getToastContent, type Feedback } from "./helpers";

type UseProjectUtilityActionsOptions = {
  loadProjectData: () => Promise<void>;
  runLockedAction: (
    key: string,
    action: () => Promise<void> | void,
    cooldownMs?: number
  ) => Promise<void>;
  setFeedback: Dispatch<SetStateAction<Feedback | null>>;
  showProjectOperationPanel: (event: OperationEvent, clearDelay?: number) => void;
};

export function useProjectUtilityActions({
  loadProjectData,
  runLockedAction,
  setFeedback,
  showProjectOperationPanel,
}: UseProjectUtilityActionsOptions) {
  const handleOpenProjectDirectory = useCallback(
    async (project: ProjectConfig) => {
      await runLockedAction(
        `directory:${project.id}`,
        async () => {
          try {
            await desktopApi.openProjectDirectory(project.path);
          } catch (error) {
            setFeedback({
              variant: "destructive",
              title: "打开项目目录失败",
              message: getErrorMessage(error),
            });
          }
        },
        500
      );
    },
    [runLockedAction, setFeedback]
  );

  const handleOpenExternal = useCallback(
    async (projectId: string, url: string) => {
      await runLockedAction(
        `url:${projectId}`,
        async () => {
          try {
            await desktopApi.openExternal(url);
          } catch (error) {
            setFeedback({
              variant: "destructive",
              title: "打开地址失败",
              message: getErrorMessage(error),
            });
          }
        },
        500
      );
    },
    [runLockedAction, setFeedback]
  );

  const handleImportProjects = useCallback(async () => {
    await runLockedAction(
      "import-projects",
      async () => {
        const filePath = await open({
          multiple: false,
          filters: [{ name: "备份文件", extensions: ["json"] }],
        });

        if (typeof filePath !== "string") {
          return;
        }

        const result = await desktopApi.importProjects(filePath);
        await loadProjectData();

        toast.success(
          getToastContent(
            "备份恢复完成",
            `新增 ${result.added} 个项目，更新 ${result.updated} 个项目，跳过 ${result.skipped} 个项目。`
          )
        );
      },
      400
    );
  }, [loadProjectData, runLockedAction]);

  const handleExportProjects = useCallback(async () => {
    await runLockedAction(
      "export-projects",
      async () => {
        const filePath = await save({
          defaultPath: "switch-project-backup.json",
          filters: [{ name: "备份文件", extensions: ["json"] }],
        });

        if (typeof filePath !== "string") {
          return;
        }

        await desktopApi.exportProjects(filePath);
        toast.success(
          getToastContent("备份已创建", "当前项目和分组已经保存到所选备份文件。")
        );
      },
      400
    );
  }, [runLockedAction]);

  const handleDeleteProjectDependenciesToast = useCallback(
    async (project: ProjectConfig) => {
      await runLockedAction(`delete-node-modules:${project.id}`, async () => {
        try {
          await desktopApi.deleteProjectNodeModules(project.id);
        } catch (error) {
          showProjectOperationPanel({
            operationId: `dependency-delete:${project.id}:${Date.now()}`,
            type: "dependency-delete",
            status: "error",
            title: "删除依赖失败",
            projectId: project.id,
            projectName: project.name,
            message: getErrorMessage(error),
          });
        }
      });
    },
    [runLockedAction, showProjectOperationPanel]
  );

  const handleDeleteProjectDependencies = useCallback(
    async (project: ProjectConfig) => {
      const inspection = await desktopApi.inspectProjectDirectory(project.path);

      if (!inspection.hasNodeModules) {
        showProjectOperationPanel({
          operationId: `dependency-delete:missing:${project.id}:${Date.now()}`,
          type: "dependency-delete",
          status: "queued",
          title: "当前项目还没有安装依赖",
          projectId: project.id,
          projectName: project.name,
          message: "当前没有 node_modules，启动项目时会自动安装依赖。",
        });
        return;
      }

      await handleDeleteProjectDependenciesToast(project);
    },
    [handleDeleteProjectDependenciesToast, showProjectOperationPanel]
  );

  const handleReinstallProjectDependenciesToast = useCallback(
    async (project: ProjectConfig) => {
      await runLockedAction(`reinstall-node-modules:${project.id}`, async () => {
        try {
          await desktopApi.reinstallProjectNodeModules(project.id);
        } catch (error) {
          showProjectOperationPanel({
            operationId: `dependency-reinstall:${project.id}:${Date.now()}`,
            type: "dependency-reinstall",
            status: "error",
            title: "重装依赖失败",
            projectId: project.id,
            projectName: project.name,
            message: getErrorMessage(error),
          });
        }
      });
    },
    [runLockedAction, showProjectOperationPanel]
  );

  return {
    handleDeleteProjectDependencies,
    handleExportProjects,
    handleImportProjects,
    handleOpenExternal,
    handleOpenProjectDirectory,
    handleReinstallProjectDependenciesToast,
  };
}
