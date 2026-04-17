import { useCallback, useMemo, useState } from "react";
import { desktopApi } from "@/lib/desktop";
import { normalizeNodeVersion, type NodeVersionUsageProject } from "@/shared/contracts";
import { getErrorMessage, type Feedback } from "./helpers";

type NodeVersionDeleteRequest = {
  version: string;
  projects: NodeVersionUsageProject[];
};

export type NodeVersionManagerDialogViewModel = {
  open: boolean;
  isLoading: boolean;
  installedVersions: string[];
  latestLtsVersions: string[];
  latestLtsError: string | null;
  activeNodeVersion: string | null;
  defaultNodeVersion: string | null;
  usageByVersion: Record<string, NodeVersionUsageProject[]>;
  installingVersion: string | null;
  deletingVersion: string | null;
  switchingVersion: string | null;
  pendingDeleteVersion: string | null;
  pendingDeleteProjects: NodeVersionUsageProject[];
  onOpenChange: (open: boolean) => void;
  onInstall: (version: string) => void;
  onSwitchDefault: (version: string) => void;
  onRequestDelete: (version: string) => void;
  onConfirmDelete: () => void;
  onPendingDeleteOpenChange: (open: boolean) => void;
};

type UseProjectNodeVersionManagerStateOptions = {
  loadProjectData: () => Promise<void>;
  runLockedAction: (
    key: string,
    action: () => Promise<void> | void,
    cooldownMs?: number
  ) => Promise<void>;
  setFeedback: (feedback: Feedback | null) => void;
};

export function useProjectNodeVersionManagerState({
  loadProjectData,
  runLockedAction,
  setFeedback,
}: UseProjectNodeVersionManagerStateOptions) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<Awaited<
    ReturnType<typeof desktopApi.getNodeVersionManagerSnapshot>
  > | null>(null);
  const [installingVersion, setInstallingVersion] = useState<string | null>(null);
  const [deletingVersion, setDeletingVersion] = useState<string | null>(null);
  const [switchingVersion, setSwitchingVersion] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NodeVersionDeleteRequest | null>(null);

  const loadSnapshot = useCallback(async () => {
    setIsLoading(true);

    try {
      setSnapshot(await desktopApi.getNodeVersionManagerSnapshot());
    } catch (error) {
      setFeedback({
        variant: "destructive",
        title: "读取 Node 版本信息失败",
        message: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, [setFeedback]);

  const refreshNodeVersionManagerData = useCallback(async () => {
    await Promise.all([loadProjectData(), loadSnapshot()]);
  }, [loadProjectData, loadSnapshot]);

  const openNodeVersionManagerDialog = useCallback(() => {
    setIsDialogOpen(true);
    void loadSnapshot();
  }, [loadSnapshot]);

  const handleInstallManagedNodeVersion = useCallback(
    async (version: string) => {
      const normalizedVersion = normalizeNodeVersion(version);

      await runLockedAction("node-version-manager-install", async () => {
        setInstallingVersion(normalizedVersion);

        try {
          await desktopApi.installNodeVersion(normalizedVersion);
          await refreshNodeVersionManagerData();
          setFeedback({
            variant: "default",
            title: `Node v${normalizedVersion} 已安装`,
            message: "现在可以把它设为默认版本，或在项目里直接使用。",
          });
        } catch (error) {
          setFeedback({
            variant: "destructive",
            title: "安装 Node 版本失败",
            message: getErrorMessage(error),
          });
        } finally {
          setInstallingVersion(null);
        }
      });
    },
    [refreshNodeVersionManagerData, runLockedAction, setFeedback]
  );

  const handleSetManagedDefaultNodeVersion = useCallback(
    async (version: string) => {
      const normalizedVersion = normalizeNodeVersion(version);

      await runLockedAction("node-version-manager-default", async () => {
        setSwitchingVersion(normalizedVersion);

        try {
          await desktopApi.setDefaultNodeVersion(normalizedVersion);
          await refreshNodeVersionManagerData();
          setFeedback({
            variant: "default",
            title: `默认 Node 已切换到 v${normalizedVersion}`,
            message: "面板后续会优先使用这个 fnm 默认版本。",
          });
        } catch (error) {
          setFeedback({
            variant: "destructive",
            title: "切换默认 Node 版本失败",
            message: getErrorMessage(error),
          });
        } finally {
          setSwitchingVersion(null);
        }
      });
    },
    [refreshNodeVersionManagerData, runLockedAction, setFeedback]
  );

  const handleDeleteManagedNodeVersion = useCallback(
    async (version: string) => {
      const normalizedVersion = normalizeNodeVersion(version);

      await runLockedAction("node-version-manager-delete", async () => {
        setDeletingVersion(normalizedVersion);

        try {
          await desktopApi.deleteNodeVersion(normalizedVersion);
          setPendingDelete(null);
          await refreshNodeVersionManagerData();
          setFeedback({
            variant: "default",
            title: `Node v${normalizedVersion} 已删除`,
            message: "相关版本列表已经刷新。",
          });
        } catch (error) {
          setFeedback({
            variant: "destructive",
            title: "删除 Node 版本失败",
            message: getErrorMessage(error),
          });
        } finally {
          setDeletingVersion(null);
        }
      });
    },
    [refreshNodeVersionManagerData, runLockedAction, setFeedback]
  );

  const handleRequestDeleteManagedNodeVersion = useCallback(
    (version: string) => {
      const normalizedVersion = normalizeNodeVersion(version);
      const usageProjects = snapshot?.usageByVersion[normalizedVersion] ?? [];

      if (usageProjects.length > 0) {
        setPendingDelete({
          version: normalizedVersion,
          projects: usageProjects,
        });
        return;
      }

      void handleDeleteManagedNodeVersion(normalizedVersion);
    },
    [handleDeleteManagedNodeVersion, snapshot]
  );

  const handleConfirmDeleteManagedNodeVersion = useCallback(async () => {
    if (!pendingDelete) {
      return;
    }

    await handleDeleteManagedNodeVersion(pendingDelete.version);
  }, [handleDeleteManagedNodeVersion, pendingDelete]);

  const nodeVersionManagerDialog = useMemo<NodeVersionManagerDialogViewModel>(
    () => ({
      open: isDialogOpen,
      isLoading,
      installedVersions: snapshot?.installedVersions ?? [],
      latestLtsVersions: snapshot?.latestLtsVersions ?? [],
      latestLtsError: snapshot?.latestLtsError ?? null,
      activeNodeVersion: snapshot?.activeNodeVersion ?? null,
      defaultNodeVersion: snapshot?.defaultNodeVersion ?? null,
      usageByVersion: snapshot?.usageByVersion ?? {},
      installingVersion,
      deletingVersion,
      switchingVersion,
      pendingDeleteVersion: pendingDelete?.version ?? null,
      pendingDeleteProjects: pendingDelete?.projects ?? [],
      onOpenChange: (open: boolean): void => {
        setIsDialogOpen(open);
        if (!open) {
          setPendingDelete(null);
        }
      },
      onInstall: (version: string): void => {
        void handleInstallManagedNodeVersion(version);
      },
      onSwitchDefault: (version: string): void => {
        void handleSetManagedDefaultNodeVersion(version);
      },
      onRequestDelete: (version: string): void => {
        handleRequestDeleteManagedNodeVersion(version);
      },
      onConfirmDelete: (): void => {
        void handleConfirmDeleteManagedNodeVersion();
      },
      onPendingDeleteOpenChange: (open: boolean): void => {
        if (!open && !deletingVersion) {
          setPendingDelete(null);
        }
      },
    }),
    [
      deletingVersion,
      handleConfirmDeleteManagedNodeVersion,
      handleInstallManagedNodeVersion,
      handleRequestDeleteManagedNodeVersion,
      handleSetManagedDefaultNodeVersion,
      installingVersion,
      isDialogOpen,
      isLoading,
      pendingDelete,
      snapshot,
      switchingVersion,
    ]
  );

  return {
    nodeVersionManagerDialog,
    openNodeVersionManagerDialog,
  };
}
