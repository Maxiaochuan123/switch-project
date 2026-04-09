import { useCallback, useEffect, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { desktopApi } from "@/lib/desktop";
import {
  DEFAULT_APP_STARTUP_SETTINGS,
  normalizeNodeVersion,
  type AppCloseRequest,
  type AppStartupSettings,
  type DesktopEnvironment,
  type OperationEvent,
  type OperationStatus,
  type ProjectConfig,
  type ProjectDiagnosis,
  type ProjectDirectoryInspection,
  type ProjectPackageManager,
  type ProjectRuntime,
} from "@/shared/contracts";
import {
  getErrorMessage,
  getOperationPanelMessage,
  getToastContent,
  isDependencyOperationBusy,
  isDependencyOperationEvent,
  isProjectRuntimeActive,
  type Feedback,
} from "./helpers";
import {
  createEmptyProjectDraft,
  createSuggestionSnapshot,
  doesNodeVersionSatisfyRequirement,
  EMPTY_DRAFT_SUGGESTIONS,
  getSuggestedPackageManager,
  getSuggestedStartCommand,
  hasInstalledNodeVersion,
  selectBestAvailableNodeVersion,
  shouldApplySuggestedValue,
  type DraftSuggestionSnapshot,
  type ProjectDraft,
} from "./project-draft";
import { useActionLocks } from "./use-action-locks";

type NodeInstallRequest = {
  project: ProjectConfig;
  version: string;
};

type NodeRetryRequest = {
  project: ProjectConfig;
  suggestedNodeVersion: string;
};

type StartProjectOptions = {
  fallbackRetryNodeVersion?: string;
};

function getRuntimeFailureMessage(runtime: ProjectRuntime) {
  const recentLogMessage = [...(runtime.recentLogs ?? [])]
    .reverse()
    .map((entry) => entry.message.trim())
    .find(Boolean);

  return runtime.lastMessage?.trim() || recentLogMessage || "启动失败，请查看终端输出。";
}

function inferRetryNodeVersionFromFailure(
  project: ProjectConfig,
  runtime: ProjectRuntime,
  installedNodeVersions: string[]
) {
  const selectedNodeVersion = normalizeNodeVersion(project.nodeVersion);
  const selectedMajor = Number(selectedNodeVersion.split(".")[0] || 0);
  const failureText = [
    runtime.lastMessage ?? "",
    ...(runtime.recentLogs ?? []).map((entry) => entry.message),
  ].join("\n");

  const hasClearNode24Signal =
    /ERR_UNSUPPORTED_ESM_URL_SCHEME|Received protocol 'c:'/iu.test(failureText);
  const failedBeforeServing = !runtime.detectedAddresses?.length;

  if (selectedMajor < 22 || (!hasClearNode24Signal && !failedBeforeServing)) {
    return "";
  }

  const normalizedInstalledVersions = installedNodeVersions
    .map((version) => normalizeNodeVersion(version))
    .filter((version) => version !== selectedNodeVersion);

  const preferredMajors = ["20", "18", "16"];
  for (const major of preferredMajors) {
    const matched = normalizedInstalledVersions.find((version) => version.startsWith(`${major}.`));
    if (matched) {
      return matched;
    }
  }

  return normalizedInstalledVersions[0] ?? "";
}

function selectFallbackRetryNodeVersion(
  selectedNodeVersion: string,
  installedNodeVersions: string[]
) {
  const selectedMajor = Number(normalizeNodeVersion(selectedNodeVersion).split(".")[0] || 0);
  if (selectedMajor < 22) {
    return "";
  }

  const normalizedSelectedNodeVersion = normalizeNodeVersion(selectedNodeVersion);
  const normalizedInstalledVersions = installedNodeVersions
    .map((version) => normalizeNodeVersion(version))
    .filter((version) => version !== normalizedSelectedNodeVersion);

  for (const major of ["20", "18", "16"]) {
    const matched = normalizedInstalledVersions.find((version) => version.startsWith(`${major}.`));
    if (matched) {
      return matched;
    }
  }

  return "";
}

export function useProjectPanelController() {
  const { isActionLocked, runLockedAction } = useActionLocks();

  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [runtimes, setRuntimes] = useState<Record<string, ProjectRuntime>>({});
  const [environment, setEnvironment] = useState<DesktopEnvironment>({
    installedNodeVersions: [],
    activeNodeVersion: null,
    availablePackageManagers: [],
    rimrafInstalled: false,
    nvmHome: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [isStartupSettingsDialogOpen, setIsStartupSettingsDialogOpen] = useState(false);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(createEmptyProjectDraft());
  const [startupSettings, setStartupSettings] = useState<AppStartupSettings>(
    DEFAULT_APP_STARTUP_SETTINGS
  );
  const [startupSettingsDraft, setStartupSettingsDraft] = useState<AppStartupSettings>(
    DEFAULT_APP_STARTUP_SETTINGS
  );
  const [deleteTarget, setDeleteTarget] = useState<ProjectConfig | null>(null);
  const [terminalTarget, setTerminalTarget] = useState<ProjectConfig | null>(null);
  const [projectDiagnoses, setProjectDiagnoses] = useState<Record<string, ProjectDiagnosis>>({});
  const [nodeInstallRequest, setNodeInstallRequest] = useState<NodeInstallRequest | null>(null);
  const [nodeRetryTarget, setNodeRetryTarget] = useState<NodeRetryRequest | null>(null);
  const [appCloseRequest, setAppCloseRequest] = useState<AppCloseRequest | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBrowsingPath, setIsBrowsingPath] = useState(false);
  const [isSavingStartupSettings, setIsSavingStartupSettings] = useState(false);
  const [isInstallingNodeVersion, setIsInstallingNodeVersion] = useState(false);
  const [isConfirmingAppClose, setIsConfirmingAppClose] = useState(false);
  const [isMinimizingAppClose, setIsMinimizingAppClose] = useState(false);
  const [pathInspection, setPathInspection] = useState<ProjectDirectoryInspection | null>(null);
  const [isInspectingProject, setIsInspectingProject] = useState(false);
  const [inspectionNotice, setInspectionNotice] = useState<"idle" | "success" | "error">("idle");
  const [dropzoneError, setDropzoneError] = useState("");
  const [dependencyOperations, setDependencyOperations] = useState<Record<string, OperationStatus>>(
    {}
  );
  const [projectStartFailures, setProjectStartFailures] = useState<Record<string, string>>({});
  const [projectOperationPanels, setProjectOperationPanels] = useState<Record<string, OperationEvent>>(
    {}
  );
  const draftSuggestionRef = useRef<DraftSuggestionSnapshot>(EMPTY_DRAFT_SUGGESTIONS);
  const operationPanelTimersRef = useRef<Map<string, number>>(new Map());
  const diagnosingProjectIdsRef = useRef<Set<string>>(new Set());
  const lastToastSignatureRef = useRef<string | null>(null);
  const projectsRef = useRef<ProjectConfig[]>([]);
  const runtimesRef = useRef<Record<string, ProjectRuntime>>({});
  const projectStartFailuresRef = useRef<Record<string, string>>({});
  const environmentRef = useRef<DesktopEnvironment>({
    installedNodeVersions: [],
    activeNodeVersion: null,
    availablePackageManagers: [],
    rimrafInstalled: false,
    nvmHome: null,
  });

  const syncProjects = useCallback((nextProjects: ProjectConfig[]) => {
    setProjects(nextProjects);
    projectsRef.current = nextProjects;

    setRuntimes((current) => {
      const next = { ...current };
      const activeIds = new Set(nextProjects.map((project) => project.id));

      for (const projectId of Object.keys(next)) {
        if (!activeIds.has(projectId)) {
          delete next[projectId];
        }
      }

      return next;
    });

    setProjectDiagnoses((current) => {
      const next = { ...current };
      const activeIds = new Set(nextProjects.map((project) => project.id));

      for (const projectId of Object.keys(next)) {
        if (!activeIds.has(projectId)) {
          delete next[projectId];
        }
      }

      return next;
    });
  }, []);

  const syncRuntimes = useCallback((nextRuntimes: ProjectRuntime[]) => {
    const nextRuntimeMap = Object.fromEntries(
      nextRuntimes.map((runtime) => [runtime.projectId, runtime])
    );
    setRuntimes(nextRuntimeMap);
    runtimesRef.current = nextRuntimeMap;
  }, []);

  const loadProjectData = useCallback(async () => {
    const [nextProjects, nextEnvironment] = await Promise.all([
      desktopApi.listProjects(),
      desktopApi.getEnvironment(),
    ]);

    syncProjects(nextProjects);
    setEnvironment(nextEnvironment);
  }, [syncProjects]);

  useEffect(() => {
    environmentRef.current = environment;
  }, [environment]);

  useEffect(() => {
    projectStartFailuresRef.current = projectStartFailures;
  }, [projectStartFailures]);

  const clearProjectOperationPanel = useCallback((projectId: string) => {
    const existingTimer = operationPanelTimersRef.current.get(projectId);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      operationPanelTimersRef.current.delete(projectId);
    }

    setProjectOperationPanels((current) => {
      if (!current[projectId]) {
        return current;
      }

      const next = { ...current };
      delete next[projectId];
      return next;
    });
  }, []);

  const showProjectOperationPanel = useCallback(
    (event: OperationEvent, clearDelay?: number) => {
      if (!event.projectId) {
        return;
      }

      const existingTimer = operationPanelTimersRef.current.get(event.projectId);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        operationPanelTimersRef.current.delete(event.projectId);
      }

      setProjectOperationPanels((current) => ({
        ...current,
        [event.projectId!]: {
          ...event,
          message: getOperationPanelMessage(event),
        },
      }));

      if (typeof clearDelay === "number" && clearDelay > 0) {
        const timer = window.setTimeout(() => {
          clearProjectOperationPanel(event.projectId!);
        }, clearDelay);

        operationPanelTimersRef.current.set(event.projectId, timer);
      }
    },
    [clearProjectOperationPanel]
  );

  const diagnoseProjectSilently = useCallback(async (project: ProjectConfig) => {
    if (diagnosingProjectIdsRef.current.has(project.id)) {
      return;
    }

    diagnosingProjectIdsRef.current.add(project.id);

    try {
      const diagnosis = await desktopApi.diagnoseProject(project.id);
      setProjectDiagnoses((current) => ({
        ...current,
        [project.id]: diagnosis,
      }));
    } catch {
      // Ignore background diagnosis failures; startup checks still run on action.
    } finally {
      diagnosingProjectIdsRef.current.delete(project.id);
    }
  }, []);

  const applyInspectionSuggestions = useCallback(
    (inspection: ProjectDirectoryInspection | null) => {
      if (!inspection) {
        return;
      }

      const nextSuggestions = createSuggestionSnapshot(inspection);
      const suggestedPackageManager = getSuggestedPackageManager(
        inspection,
        environment.availablePackageManagers
      );
      const suggestedStartCommand = getSuggestedStartCommand(inspection, suggestedPackageManager);
      const suggestedNodeVersion = selectBestAvailableNodeVersion(
        inspection.nodeVersionHint ?? inspection.recommendedNodeVersion,
        environment.installedNodeVersions,
        environment.activeNodeVersion
      );
      nextSuggestions.packageManager = suggestedPackageManager;
      nextSuggestions.startCommand = suggestedStartCommand;
      nextSuggestions.nodeVersion = suggestedNodeVersion;

      setProjectDraft((current) => {
        if (current.id) {
          return current;
        }

        const nextDraft = { ...current };
        let changed = false;

        if (
          shouldApplySuggestedValue(current.name, draftSuggestionRef.current.name) &&
          current.name !== nextSuggestions.name
        ) {
          nextDraft.name = nextSuggestions.name;
          changed = true;
        }

        if (
          shouldApplySuggestedValue(current.nodeVersion, draftSuggestionRef.current.nodeVersion) &&
          current.nodeVersion !== nextSuggestions.nodeVersion
        ) {
          nextDraft.nodeVersion = nextSuggestions.nodeVersion;
          changed = true;
        }

        if (
          shouldApplySuggestedValue(
            current.packageManager,
            draftSuggestionRef.current.packageManager
          ) &&
          current.packageManager !== nextSuggestions.packageManager
        ) {
          nextDraft.packageManager = nextSuggestions.packageManager;
          changed = true;
        }

        if (
          shouldApplySuggestedValue(current.startCommand, draftSuggestionRef.current.startCommand) &&
          current.startCommand !== nextSuggestions.startCommand
        ) {
          nextDraft.startCommand = nextSuggestions.startCommand;
          changed = true;
        }

        return changed ? nextDraft : current;
      });

      draftSuggestionRef.current = nextSuggestions;
    },
    [
      environment.activeNodeVersion,
      environment.availablePackageManagers,
      environment.installedNodeVersions,
    ]
  );

  const openCreateDialog = useCallback(() => {
    draftSuggestionRef.current = EMPTY_DRAFT_SUGGESTIONS;
    setProjectDraft(createEmptyProjectDraft());
    setFormError(null);
    setPathInspection(null);
    setIsInspectingProject(false);
    setInspectionNotice("idle");
    setDropzoneError("");
    setIsProjectDialogOpen(true);
  }, []);

  const openStartupSettingsDialog = useCallback(() => {
    setStartupSettingsDraft(startupSettings);
    setIsStartupSettingsDialogOpen(true);
  }, [startupSettings]);

  const openEditDialog = useCallback((project: ProjectConfig) => {
    draftSuggestionRef.current = EMPTY_DRAFT_SUGGESTIONS;
    setProjectDraft({
      id: project.id,
      name: project.name,
      path: project.path,
      nodeVersion: project.nodeVersion,
      packageManager: project.packageManager,
      startCommand: project.startCommand,
      autoStartOnAppLaunch: project.autoStartOnAppLaunch,
      autoOpenLocalUrlOnStart: project.autoOpenLocalUrlOnStart,
    });
    setFormError(null);
    setPathInspection(null);
    setIsInspectingProject(false);
    setInspectionNotice("idle");
    setDropzoneError("");
    setIsProjectDialogOpen(true);
  }, []);

  const isProjectDependencyOperationLocked = useCallback(
    (projectId: string) => isDependencyOperationBusy(dependencyOperations[projectId]),
    [dependencyOperations]
  );

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const [nextProjects, nextEnvironment, nextStartupSettings, nextRuntimes] =
          await Promise.all([
            desktopApi.listProjects(),
            desktopApi.getEnvironment(),
            desktopApi.getAppStartupSettings(),
            desktopApi.listRuntimes(),
          ]);

        if (!isMounted) {
          return;
        }

        syncProjects(nextProjects);
        syncRuntimes(nextRuntimes);
        setEnvironment(nextEnvironment);
        setStartupSettings(nextStartupSettings);
        setStartupSettingsDraft(nextStartupSettings);
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
        }
      }
    })();

    const unsubscribeRuntime = desktopApi.subscribeRuntime((runtime) => {
      if (!isMounted) {
        return;
      }

      setRuntimes((current) => {
        const next = { ...current, [runtime.projectId]: runtime };
        runtimesRef.current = next;
        return next;
      });

      if (runtime.status === "running" || runtime.status === "starting") {
        clearProjectOperationPanel(runtime.projectId);
        setProjectStartFailures((current) => {
          if (!current[runtime.projectId]) {
            return current;
          }

          const next = { ...current };
          delete next[runtime.projectId];
          return next;
        });
        return;
      }

      if (runtime.status === "stopped") {
        return;
      }

      if (runtime.status !== "error") {
        return;
      }

      const project = projectsRef.current.find((item) => item.id === runtime.projectId);
      if (!project) {
        return;
      }

      const failureMessage = getRuntimeFailureMessage(runtime);

      setProjectStartFailures((current) => {
        const next = {
          ...current,
          [project.id]: failureMessage,
        };
        projectStartFailuresRef.current = next;
        return next;
      });

      showProjectOperationPanel({
        operationId: `project-start-failed:${project.id}:${Date.now()}`,
        type: "project-start-preflight",
        status: "error",
        title: "启动失败",
        projectId: project.id,
        projectName: project.name,
        message: failureMessage,
      });

      const suggestedNodeVersion = inferRetryNodeVersionFromFailure(
        project,
        runtime,
        environmentRef.current.installedNodeVersions
      );

      if (suggestedNodeVersion) {
        setNodeRetryTarget((current) => {
          if (current?.project.id === project.id) {
            return current;
          }

          return {
            project,
            suggestedNodeVersion,
          };
        });
      }
    });

    const unsubscribeAppCloseRequest = desktopApi.subscribeAppCloseRequest((request) => {
      if (isMounted) {
        setAppCloseRequest(request);
      }
    });

    const unsubscribeOperation = desktopApi.subscribeOperation((event) => {
      if (!isMounted || !isDependencyOperationEvent(event.type) || !event.projectId) {
        return;
      }

      if (event.status === "running") {
        setDependencyOperations((current) => ({
          ...current,
          [event.projectId!]: event.status,
        }));
        showProjectOperationPanel(event);
        return;
      }

      setDependencyOperations((current) => {
        if (!current[event.projectId!]) {
          return current;
        }

        const next = { ...current };
        delete next[event.projectId!];
        return next;
      });

      void loadProjectData();
      showProjectOperationPanel(event);

      if (event.status === "success") {
        const project = projectsRef.current.find((item) => item.id === event.projectId);
        if (project) {
          setProjectDiagnoses((current) => {
            const next = { ...current };
            delete next[project.id];
            return next;
          });
          void diagnoseProjectSilently(project);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribeRuntime();
      unsubscribeAppCloseRequest();
      unsubscribeOperation();
    };
  }, [
    diagnoseProjectSilently,
    clearProjectOperationPanel,
      loadProjectData,
      showProjectOperationPanel,
      syncProjects,
      syncRuntimes,
  ]);

  useEffect(() => {
    return () => {
      for (const timer of operationPanelTimersRef.current.values()) {
        window.clearTimeout(timer);
      }

      operationPanelTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const signature = JSON.stringify(feedback);

    if (lastToastSignatureRef.current === signature) {
      setFeedback(null);
      return;
    }

    lastToastSignatureRef.current = signature;
    window.setTimeout(() => {
      if (lastToastSignatureRef.current === signature) {
        lastToastSignatureRef.current = null;
      }
    }, 1200);

    if (feedback.variant === "destructive") {
      toast.error(getToastContent(feedback.title, feedback.message));
    } else {
      toast.success(getToastContent(feedback.title, feedback.message));
    }

    setFeedback(null);
  }, [feedback]);

  useEffect(() => {
    if (!isProjectDialogOpen) {
      setPathInspection(null);
      return;
    }

    const trimmedPath = projectDraft.path.trim();
    if (!trimmedPath) {
      setPathInspection(null);
      return;
    }

    let isMounted = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const inspection = await desktopApi.inspectProjectDirectory(trimmedPath);

          if (isMounted) {
            setPathInspection(inspection);
          }
        } catch {
          if (isMounted) {
            setPathInspection(null);
          }
        }
      })();
    }, 180);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [isProjectDialogOpen, projectDraft.path]);

  useEffect(() => {
    if (!isProjectDialogOpen || projectDraft.id || !pathInspection) {
      return;
    }

    applyInspectionSuggestions(pathInspection);
  }, [
    applyInspectionSuggestions,
    environment.installedNodeVersions,
    isProjectDialogOpen,
    pathInspection,
    projectDraft.id,
  ]);

  useEffect(() => {
    for (const project of projects) {
      const runtime = runtimes[project.id];
      if (isProjectRuntimeActive(runtime?.status)) {
        continue;
      }

      if (projectOperationPanels[project.id]) {
        continue;
      }

      if (projectStartFailures[project.id]) {
        continue;
      }

      if (projectDiagnoses[project.id]) {
        continue;
      }

      void diagnoseProjectSilently(project);
    }
  }, [
    diagnoseProjectSilently,
    projectDiagnoses,
    projectOperationPanels,
    projectStartFailures,
    projects,
    runtimes,
  ]);

  const handleSaveProject = useCallback(
    async (nextDraft: ProjectDraft) => {
      const currentProject = nextDraft.id
        ? projects.find((project) => project.id === nextDraft.id)
        : null;
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

      if (
        currentProject &&
        isProjectRuntimeActive(runtimes[currentProject.id]?.status) &&
        (currentProject.path !== draft.path ||
          currentProject.nodeVersion !== draft.nodeVersion ||
          currentProject.packageManager !== draft.packageManager ||
          currentProject.startCommand !== draft.startCommand)
      ) {
        setFormError("项目正在运行中，请先停止后再修改路径、Node 版本、包管理器或启动命令。");
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
        setProjectDiagnoses((current) => {
          const next = { ...current };
          delete next[nextProject.id];
          return next;
        });
        void diagnoseProjectSilently(nextProject);
        setIsProjectDialogOpen(false);
        setPathInspection(null);
        draftSuggestionRef.current = EMPTY_DRAFT_SUGGESTIONS;
        setFeedback(null);
      } catch (error) {
        setFormError(getErrorMessage(error));
      } finally {
        setIsSubmitting(false);
      }
    },
    [diagnoseProjectSilently, loadProjectData, projects, runtimes]
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

      if (terminalTarget?.id === deleteTarget.id) {
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
  }, [deleteTarget, loadProjectData, terminalTarget?.id]);

  const handleDropzonePath = useCallback(
    async (selectedPath: string) => {
      setProjectDraft((current) => ({ ...current, path: selectedPath }));
      setDropzoneError("");
      setInspectionNotice("idle");
      setFormError(null);
      setIsInspectingProject(true);

      try {
        const inspection = await desktopApi.inspectProjectDirectory(selectedPath);

        if (!inspection.exists || !inspection.isDirectory) {
          setPathInspection(null);
          setDropzoneError("请拖入项目文件夹");
          setInspectionNotice("error");
          return;
        }

        setPathInspection(inspection);
        applyInspectionSuggestions(inspection);
        setInspectionNotice("success");
      } catch (error) {
        setPathInspection(null);
        setInspectionNotice("error");
        setFormError(getErrorMessage(error));
      } finally {
        setIsInspectingProject(false);
      }
    },
    [applyInspectionSuggestions]
  );

  const handleBrowseProjectPath = useCallback(async () => {
    setIsBrowsingPath(true);

    try {
      const selectedPath = await desktopApi.browseProjectDirectory(projectDraft.path);

      if (selectedPath) {
        await handleDropzonePath(selectedPath);
      }
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setIsBrowsingPath(false);
    }
  }, [handleDropzonePath, projectDraft.path]);

  const startProjectDirect = useCallback(
    async (projectId: string, options?: StartProjectOptions) => {
      clearProjectOperationPanel(projectId);
      setProjectStartFailures((current) => {
        if (!current[projectId]) {
          return current;
        }

        const next = { ...current };
        delete next[projectId];
        return next;
      });
      setNodeRetryTarget((current) => (current?.project.id === projectId ? null : current));

      await runLockedAction(`start:${projectId}`, async () => {
        try {
          await desktopApi.startProject(projectId);
          setFeedback(null);

          if (options?.fallbackRetryNodeVersion) {
            const fallbackRetryNodeVersion = normalizeNodeVersion(options.fallbackRetryNodeVersion);

            window.setTimeout(() => {
              const latestRuntime = runtimesRef.current[projectId];
              const latestFailure = projectStartFailuresRef.current[projectId];
              const latestStatus = latestRuntime?.status ?? "stopped";

              if (
                !latestFailure &&
                latestStatus !== "error" &&
                latestStatus !== "stopped"
              ) {
                return;
              }

              const project = projectsRef.current.find((item) => item.id === projectId);
              if (!project) {
                return;
              }

              const failureMessage =
                latestFailure ??
                getRuntimeFailureMessage(latestRuntime) ??
                "启动失败，请尝试切换 Node 版本后重试。";

              setProjectStartFailures((current) => {
                if (current[projectId] === failureMessage) {
                  return current;
                }

                const next = {
                  ...current,
                  [projectId]: failureMessage,
                };
                projectStartFailuresRef.current = next;
                return next;
              });

              showProjectOperationPanel({
                operationId: `project-start-failed:${projectId}:${Date.now()}`,
                type: "project-start-preflight",
                status: "error",
                title: "启动失败",
                projectId,
                projectName: project.name,
                message: failureMessage,
              });

              setNodeRetryTarget((current) => {
                if (current?.project.id === projectId) {
                  return current;
                }

                return {
                  project,
                  suggestedNodeVersion: fallbackRetryNodeVersion,
                };
              });
            }, 2500);
          }
        } catch (error) {
          const message = getErrorMessage(error);
          setProjectStartFailures((current) => ({
            ...current,
            [projectId]: message,
          }));
          showProjectOperationPanel({
            operationId: `project-start-error:${projectId}:${Date.now()}`,
            type: "project-start-preflight",
            status: "error",
            title: "启动失败",
            projectId,
            message,
          });
          setFeedback({
            variant: "destructive",
            title: "启动项目失败",
            message,
          });
        }
      });
    },
    [clearProjectOperationPanel, runLockedAction, showProjectOperationPanel]
  );

  const handleStartProject = useCallback(
    async (projectId: string) => {
      try {
        const project = projects.find((item) => item.id === projectId);
        if (!project) {
          return;
        }

        const inspection = await desktopApi.inspectProjectDirectory(project.path);
        const declaredNodeRequirement =
          inspection.nodeVersionHint ?? inspection.recommendedNodeVersion ?? null;
        const currentNodeVersion = normalizeNodeVersion(project.nodeVersion);

        if (
          declaredNodeRequirement &&
          !doesNodeVersionSatisfyRequirement(currentNodeVersion, declaredNodeRequirement)
        ) {
          const suggestedNodeVersion = selectBestAvailableNodeVersion(
            declaredNodeRequirement,
            environment.installedNodeVersions,
            environment.activeNodeVersion
          );

          if (
            suggestedNodeVersion &&
            normalizeNodeVersion(suggestedNodeVersion) !== currentNodeVersion
          ) {
            setNodeRetryTarget({
              project,
              suggestedNodeVersion,
            });
            return;
          }

          const installVersion =
            inspection.nodeVersionHint ?? inspection.recommendedNodeVersion ?? project.nodeVersion;

          setNodeInstallRequest({
            project,
            version: installVersion,
          });
          return;
        }

        if (!hasInstalledNodeVersion(environment.installedNodeVersions, project.nodeVersion)) {
          setNodeInstallRequest({
            project,
            version: project.nodeVersion,
          });
          return;
        }

        await startProjectDirect(projectId, {
          fallbackRetryNodeVersion: declaredNodeRequirement
            ? undefined
            : selectFallbackRetryNodeVersion(
                currentNodeVersion,
                environment.installedNodeVersions
              ) || undefined,
        });
      } catch (error) {
        setFeedback({
          variant: "destructive",
          title: "启动前检查失败",
          message: getErrorMessage(error),
        });
      }
    },
    [
      environment.activeNodeVersion,
      environment.installedNodeVersions,
      projects,
      startProjectDirect,
    ]
  );

  const installNodeVersion = useCallback(
    async (version: string, project?: ProjectConfig | null) => {
      const normalizedVersion = normalizeNodeVersion(version);
      const toastId = `install-node:${normalizedVersion}`;
      const isProjectScoped = Boolean(project?.id);

      setIsInstallingNodeVersion(true);

      if (project?.id) {
        showProjectOperationPanel({
          operationId: `node-install:${project.id}:${Date.now()}`,
          type: "node-install",
          status: "running",
          title: "正在安装 Node 版本",
          projectId: project.id,
          projectName: project.name,
          message: `正在安装 Node v${normalizedVersion}，请稍后...`,
        });
      } else {
        toast.loading(
          getToastContent("正在安装 Node 版本", `正在安装 Node v${normalizedVersion}，请稍后...`),
          {
            id: toastId,
            duration: Number.POSITIVE_INFINITY,
          }
        );
      }

      try {
        await desktopApi.installNodeVersion(normalizedVersion);
        await loadProjectData();

        if (project?.id) {
          setProjectDiagnoses((current) => {
            const next = { ...current };
            delete next[project.id];
            return next;
          });
          void diagnoseProjectSilently(project);
          showProjectOperationPanel({
            operationId: `node-install:${project.id}:${Date.now()}`,
            type: "node-install",
            status: "success",
            title: "Node 版本已安装",
            projectId: project.id,
            projectName: project.name,
            message: `Node v${normalizedVersion} 已安装完成。`,
          });
        } else {
          toast.success(getToastContent("Node 版本已安装", `Node v${normalizedVersion} 已安装完成。`), {
            id: toastId,
            duration: 3000,
          });
        }

        return true;
      } catch (error) {
        if (project?.id) {
          showProjectOperationPanel({
            operationId: `node-install:${project.id}:${Date.now()}`,
            type: "node-install",
            status: "error",
            title: "安装 Node 版本失败",
            projectId: project.id,
            projectName: project.name,
            message: getErrorMessage(error),
          });
        } else {
          toast.error(getToastContent("安装 Node 版本失败", getErrorMessage(error)), {
            id: toastId,
            duration: 4000,
          });
        }

        return false;
      } finally {
        if (isProjectScoped) {
          toast.dismiss(toastId);
        }
        setIsInstallingNodeVersion(false);
      }
    },
    [diagnoseProjectSilently, loadProjectData, showProjectOperationPanel]
  );

  const handleInstallNodeVersionOnly = useCallback(
    async (version: string) => {
      await installNodeVersion(version);
    },
    [installNodeVersion]
  );

  const handleInstallNodeVersionAndStart = useCallback(async () => {
    if (!nodeInstallRequest) {
      return;
    }

    const project = nodeInstallRequest.project;
    const targetNodeVersion = normalizeNodeVersion(nodeInstallRequest.version);
    const installed = await installNodeVersion(targetNodeVersion, project);
    if (!installed) {
      return;
    }

    const nextProject =
      normalizeNodeVersion(project.nodeVersion) === targetNodeVersion
        ? project
        : {
            ...project,
            nodeVersion: targetNodeVersion,
          };

    if (nextProject !== project) {
      await desktopApi.saveProject(nextProject);
      await loadProjectData();
    }

    setNodeInstallRequest(null);
    await startProjectDirect(nextProject.id);
  }, [installNodeVersion, loadProjectData, nodeInstallRequest, startProjectDirect]);

  const handleRetryProjectWithSuggestedNode = useCallback(async (selectedNodeVersion?: string) => {
    if (!nodeRetryTarget) {
      return;
    }

    const targetNodeVersion = normalizeNodeVersion(
      selectedNodeVersion ?? nodeRetryTarget.suggestedNodeVersion
    );
    const nextProject = {
      ...nodeRetryTarget.project,
      nodeVersion: targetNodeVersion,
    };

    setIsInstallingNodeVersion(true);

    try {
      await desktopApi.saveProject(nextProject);
      await loadProjectData();
      setNodeRetryTarget(null);
      await startProjectDirect(nextProject.id);
    } catch (error) {
      setFeedback({
        variant: "destructive",
        title: "切换 Node 版本失败",
        message: getErrorMessage(error),
      });
    } finally {
      setIsInstallingNodeVersion(false);
    }
  }, [loadProjectData, nodeRetryTarget, startProjectDirect]);

  const handleStopProject = useCallback(
    async (projectId: string) => {
      await runLockedAction(`stop:${projectId}`, async () => {
        try {
          await desktopApi.stopProject(projectId);
          clearProjectOperationPanel(projectId);
          setProjectStartFailures((current) => {
            if (!current[projectId]) {
              return current;
            }

            const next = { ...current };
            delete next[projectId];
            return next;
          });
          setNodeRetryTarget((current) => (current?.project.id === projectId ? null : current));
          setFeedback(null);
        } catch (error) {
          setFeedback({
            variant: "destructive",
            title: "停止项目失败",
            message: getErrorMessage(error),
          });
        }
      });
    },
    [clearProjectOperationPanel, runLockedAction]
  );

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
    [runLockedAction]
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
    [runLockedAction]
  );

  const handleImportProjects = useCallback(async () => {
    await runLockedAction(
      "import-projects",
      async () => {
        const filePath = await open({
          multiple: false,
          filters: [{ name: "JSON", extensions: ["json"] }],
        });

        if (typeof filePath !== "string") {
          return;
        }

        const result = await desktopApi.importProjects(filePath);
        await loadProjectData();

        toast.success(
          getToastContent(
            "项目配置已导入",
            `新增 ${result.added} 个，更新 ${result.updated} 个，跳过 ${result.skipped} 个。`
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
          defaultPath: "switch-project-projects.json",
          filters: [{ name: "JSON", extensions: ["json"] }],
        });

        if (typeof filePath !== "string") {
          return;
        }

        await desktopApi.exportProjects(filePath);
        toast.success(getToastContent("项目配置已导出", "项目列表已经导出到所选文件。"));
      },
      400
    );
  }, [runLockedAction]);

  const handleSaveStartupSettings = useCallback(async () => {
    setIsSavingStartupSettings(true);

    try {
      await desktopApi.saveAppStartupSettings(startupSettingsDraft);
      const nextStartupSettings = await desktopApi.getAppStartupSettings();
      setStartupSettings(nextStartupSettings);
      setStartupSettingsDraft(nextStartupSettings);
      setIsStartupSettingsDialogOpen(false);
      setFeedback(null);
    } catch (error) {
      setFeedback({
        variant: "destructive",
        title: "保存启动设置失败",
        message: getErrorMessage(error),
      });
    } finally {
      setIsSavingStartupSettings(false);
    }
  }, [startupSettingsDraft]);

  const handleConfirmAppClose = useCallback(async () => {
    setIsConfirmingAppClose(true);

    try {
      await desktopApi.confirmAppClose();
    } finally {
      setIsConfirmingAppClose(false);
    }
  }, []);

  const handleMinimizeAppClose = useCallback(async () => {
    setIsMinimizingAppClose(true);
    setAppCloseRequest(null);

    try {
      await desktopApi.minimizeAppToTray();
    } finally {
      setIsMinimizingAppClose(false);
    }
  }, []);

  const handleCancelAppClose = useCallback(async () => {
    setAppCloseRequest(null);
    await desktopApi.cancelAppClose();
  }, []);

  const handlePackageManagerChange = useCallback(
    (packageManager: ProjectPackageManager) => {
      setProjectDraft((current) => {
        const nextDraft = { ...current, packageManager };
        if (
          shouldApplySuggestedValue(current.startCommand, draftSuggestionRef.current.startCommand)
        ) {
          nextDraft.startCommand = getSuggestedStartCommand(pathInspection, packageManager);
        }
        return nextDraft;
      });

      draftSuggestionRef.current = {
        ...draftSuggestionRef.current,
        packageManager,
        startCommand: getSuggestedStartCommand(pathInspection, packageManager),
      };
    },
    [pathInspection]
  );

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

  const handleProjectDialogOpenChange = useCallback((nextOpen: boolean) => {
    setIsProjectDialogOpen(nextOpen);
    if (!nextOpen) {
      setFormError(null);
      setPathInspection(null);
      setIsInspectingProject(false);
      setInspectionNotice("idle");
      setDropzoneError("");
      draftSuggestionRef.current = EMPTY_DRAFT_SUGGESTIONS;
    }
  }, []);

  const handleStartupSettingsOpenChange = useCallback(
    (nextOpen: boolean) => {
      setIsStartupSettingsDialogOpen(nextOpen);
      if (!nextOpen) {
        setStartupSettingsDraft(startupSettings);
      }
    },
    [startupSettings]
  );

  const handleDeleteDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setDeleteTarget(null);
    }
  }, []);

  const handleLogsDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setTerminalTarget(null);
    }
  }, []);

  const handleNodeInstallDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setNodeInstallRequest(null);
    }
  }, []);

  const handleNodeRetryDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setNodeRetryTarget(null);
    }
  }, []);

  const handleExitDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        void handleCancelAppClose();
      }
    },
    [handleCancelAppClose]
  );

  return {
    appCloseRequest,
    deleteTarget,
    environment,
    formError,
    isActionLocked,
    isBrowsingPath,
    isConfirmingAppClose,
    isInstallingNodeVersion,
    isInspectingProject,
    inspectionNotice,
    dropzoneError,
    isLoading,
    isMinimizingAppClose,
    isProjectDependencyOperationLocked,
    isProjectDialogOpen,
    isSavingStartupSettings,
    isStartupSettingsDialogOpen,
    isSubmitting,
    nodeInstallRequest,
    nodeRetryTarget,
    pathInspection,
    projectDiagnoses,
    projectDraft,
    projectStartFailures,
    projectOperationPanels,
    projects,
    runLockedAction,
    runtimes,
    startupSettings,
    startupSettingsDraft,
    terminalTarget,
    handleBrowseProjectPath,
    handleCancelAppClose,
    handleConfirmAppClose,
    handleDeleteDialogOpenChange,
    handleDeleteProject,
    handleDeleteProjectDependencies,
    handleDropzonePath,
    handleExitDialogOpenChange,
    handleExportProjects,
    handleImportProjects,
    handleInstallNodeVersionAndStart,
    handleInstallNodeVersionOnly,
    handleLogsDialogOpenChange,
    handleMinimizeAppClose,
    handleNodeInstallDialogOpenChange,
    handleNodeRetryDialogOpenChange,
    handleOpenExternal,
    handleOpenProjectDirectory,
    handlePackageManagerChange,
    handleProjectDialogOpenChange,
    handleReinstallProjectDependenciesToast,
    handleRetryProjectWithSuggestedNode,
    handleSaveProject,
    handleSaveStartupSettings,
    handleStartProject,
    handleStartupSettingsOpenChange,
    handleStopProject,
    openCreateDialog,
    openEditDialog,
    openStartupSettingsDialog,
    setDeleteTarget,
    setProjectDraft,
    setStartupSettingsDraft,
    setTerminalTarget,
  };
}
