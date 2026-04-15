import { useCallback, useRef, useState } from "react";
import {
  DEFAULT_APP_STARTUP_SETTINGS,
  type AppStartupSettings,
  type DesktopEnvironment,
  type ProjectConfig,
} from "@/shared/contracts";
import { areProjectListsEqual } from "./helpers";

const DEFAULT_ENVIRONMENT: DesktopEnvironment = {
  installedNodeVersions: [],
  nvmInstalledNodeVersions: [],
  activeNodeVersion: null,
  availablePackageManagers: [],
  rimrafInstalled: false,
  nodeManager: "fnm",
  nodeManagerAvailable: false,
  nodeManagerVersion: null,
};

export function useProjectCoreState() {
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [environment, setEnvironment] = useState<DesktopEnvironment>(DEFAULT_ENVIRONMENT);
  const [startupSettings, setStartupSettings] = useState<AppStartupSettings>(
    DEFAULT_APP_STARTUP_SETTINGS
  );
  const [formError, setFormError] = useState<string | null>(null);
  const projectsByIdRef = useRef<Record<string, ProjectConfig>>({});

  const syncProjects = useCallback((nextProjects: ProjectConfig[]) => {
    setProjects((current) => {
      const stableProjects = areProjectListsEqual(current, nextProjects)
        ? current
        : nextProjects;

      projectsByIdRef.current = Object.fromEntries(
        stableProjects.map((project) => [project.id, project])
      );

      return stableProjects;
    });
  }, []);

  const getProjectById = useCallback(
    (projectId: string) => projectsByIdRef.current[projectId],
    []
  );

  return {
    environment,
    formError,
    getProjectById,
    projects,
    setEnvironment,
    setFormError,
    setStartupSettings,
    startupSettings,
    syncProjects,
  };
}
