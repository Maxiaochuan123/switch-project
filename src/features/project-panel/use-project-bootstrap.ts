import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { desktopApi } from "@/lib/desktop";
import {
  areAppStartupSettingsEqual,
  areDesktopEnvironmentsEqual,
  getErrorMessage,
  type Feedback,
} from "./helpers";
import { loadingStore } from "@/lib/loading-store";
import type {
  AppCloseRequest,
  AppStartupSettings,
  DesktopEnvironment,
  ProjectConfig,
  ProjectGroup,
  ProjectRuntime,
} from "@/shared/contracts";

const LAST_PROJECT_COUNT_STORAGE_KEY = "switch-project-panel:last-project-count";

function readLastProjectCount() {
  if (typeof window === "undefined") {
    return 0;
  }

  try {
    const rawValue = window.localStorage.getItem(LAST_PROJECT_COUNT_STORAGE_KEY);
    if (!rawValue) {
      return 0;
    }

    const parsedValue = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
  } catch {
    return 0;
  }
}

function persistProjectCount(projectCount: number) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      LAST_PROJECT_COUNT_STORAGE_KEY,
      String(Math.max(projectCount, 0))
    );
  } catch {
    // Ignore storage failures; bootstrap should remain resilient.
  }
}

type UseProjectBootstrapOptions = {
  setAppCloseRequest: Dispatch<SetStateAction<AppCloseRequest | null>>;
  setEnvironment: Dispatch<SetStateAction<DesktopEnvironment>>;
  setFeedback: Dispatch<SetStateAction<Feedback | null>>;
  setProjectGroups: Dispatch<SetStateAction<ProjectGroup[]>>;
  setStartupSettings: Dispatch<SetStateAction<AppStartupSettings>>;
  setStartupSettingsDraft: Dispatch<SetStateAction<AppStartupSettings>>;
  syncProjects: (projects: ProjectConfig[]) => void;
  syncRuntimes: (runtimes: ProjectRuntime[]) => void;
};

export function useProjectBootstrap({
  setAppCloseRequest,
  setEnvironment,
  setFeedback,
  setProjectGroups,
  setStartupSettings,
  setStartupSettingsDraft,
  syncProjects,
  syncRuntimes,
}: UseProjectBootstrapOptions) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProjectCount, setLoadingProjectCount] = useState(readLastProjectCount);

  const applySnapshot = useCallback(
    async () => {
      const snapshot = await desktopApi.getProjectPanelSnapshot();
      const nextProjectCount = snapshot.projects.length;

      setLoadingProjectCount(nextProjectCount);
      persistProjectCount(nextProjectCount);
      syncProjects(snapshot.projects);
      setProjectGroups(snapshot.projectGroups);
      syncRuntimes(snapshot.runtimes);
      setEnvironment((current) =>
        areDesktopEnvironmentsEqual(current, snapshot.environment)
          ? current
          : snapshot.environment
      );
      setStartupSettings((current) =>
        areAppStartupSettingsEqual(current, snapshot.startupSettings)
          ? current
          : snapshot.startupSettings
      );
      setStartupSettingsDraft((current) =>
        areAppStartupSettingsEqual(current, snapshot.startupSettings)
          ? current
          : snapshot.startupSettings
      );
    },
    [
      setEnvironment,
      setStartupSettings,
      setStartupSettingsDraft,
      setProjectGroups,
      syncProjects,
      syncRuntimes,
    ]
  );

  const loadProjectData = useCallback(async () => {
    await applySnapshot();
  }, [applySnapshot]);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        await applySnapshot();
      } catch (error) {
        if (isMounted) {
          setFeedback({
            variant: "destructive",
            title: "加载面板失败",
            message: getErrorMessage(error),
          });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          loadingStore.setLoading(false);
        }
      }
    })();

    const unsubscribeAppCloseRequest = desktopApi.subscribeAppCloseRequest(
      (request) => {
        if (isMounted) {
          setAppCloseRequest(request);
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribeAppCloseRequest();
    };
  }, [applySnapshot, setAppCloseRequest, setFeedback]);

  return {
    isLoading,
    loadingProjectCount,
    loadProjectData,
  };
}
