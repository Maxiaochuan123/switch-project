import { useEffect, useRef, useState } from "react";
import { FolderTree, Plus, Settings2 } from "lucide-react";
import { DeleteProjectDialog } from "@/components/delete-project-dialog";
import { ExitRunningProjectsDialog } from "@/components/exit-running-projects-dialog";
import { ProjectCard } from "@/components/project-card";
import { ProjectFormDialog, type ProjectDraft } from "@/components/project-form-dialog";
import { ProjectLogsDialog } from "@/components/project-logs-dialog";
import { StartupSettingsDialog } from "@/components/startup-settings-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { desktopApi } from "@/lib/desktop";
import { getDefaultErrorMessage } from "@/lib/ui-copy";
import {
  type AppCloseRequest,
  DEFAULT_APP_STARTUP_SETTINGS,
  normalizeNodeVersion,
  type AppStartupSettings,
  type DesktopEnvironment,
  type ProjectConfig,
  type ProjectDirectoryInspection,
  type ProjectRuntime,
} from "@/shared/contracts";

type Feedback = {
  variant: "default" | "destructive";
  title: string;
  message: string;
};

type DraftSuggestionSnapshot = {
  name: string;
  startCommand: string;
};

const EMPTY_DRAFT_SUGGESTIONS: DraftSuggestionSnapshot = {
  name: "",
  startCommand: "",
};

function createEmptyProjectDraft(): ProjectDraft {
  return {
    name: "",
    path: "",
    nodeVersion: "",
    startCommand: "",
    autoStartOnAppLaunch: false,
    autoOpenLocalUrlOnStart: false,
  };
}

function shouldApplySuggestedValue(currentValue: string, lastAppliedValue: string) {
  const trimmedCurrentValue = currentValue.trim();
  return trimmedCurrentValue.length === 0 || trimmedCurrentValue === lastAppliedValue.trim();
}

function createSuggestionSnapshot(
  inspection: ProjectDirectoryInspection | null
): DraftSuggestionSnapshot {
  return {
    name: inspection?.suggestedName ?? "",
    startCommand: inspection?.recommendedStartCommand ?? "",
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : getDefaultErrorMessage();
}

function isProjectRuntimeActive(status?: ProjectRuntime["status"]) {
  return status === "running" || status === "starting";
}

export function App() {
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [runtimes, setRuntimes] = useState<Record<string, ProjectRuntime>>({});
  const [environment, setEnvironment] = useState<DesktopEnvironment>({
    installedNodeVersions: [],
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
  const [appCloseRequest, setAppCloseRequest] = useState<AppCloseRequest | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBrowsingPath, setIsBrowsingPath] = useState(false);
  const [isSavingStartupSettings, setIsSavingStartupSettings] = useState(false);
  const [isConfirmingAppClose, setIsConfirmingAppClose] = useState(false);
  const [pathInspection, setPathInspection] = useState<ProjectDirectoryInspection | null>(
    null
  );
  const [, setActionLocks] = useState<Record<string, boolean>>({});
  const draftSuggestionRef = useRef<DraftSuggestionSnapshot>(EMPTY_DRAFT_SUGGESTIONS);
  const cooldownTimersRef = useRef<Map<string, number>>(new Map());
  const actionLocksRef = useRef<Set<string>>(new Set());

  function hasInstalledNodeVersion(nodeVersion: string) {
    return environment.installedNodeVersions.includes(normalizeNodeVersion(nodeVersion));
  }

  function isActionLocked(key: string) {
    return actionLocksRef.current.has(key);
  }

  function setActionLock(key: string, locked: boolean) {
    if (locked) {
      actionLocksRef.current.add(key);
    } else {
      actionLocksRef.current.delete(key);
    }

    setActionLocks((current) => {
      if (locked) {
        if (current[key]) {
          return current;
        }

        return { ...current, [key]: true };
      }

      if (!current[key]) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function runLockedAction(
    key: string,
    action: () => Promise<void> | void,
    cooldownMs = 0
  ) {
    if (isActionLocked(key)) {
      return;
    }

    const existingTimer = cooldownTimersRef.current.get(key);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      cooldownTimersRef.current.delete(key);
    }

    setActionLock(key, true);

    try {
      await action();
    } finally {
      if (cooldownMs > 0) {
        const timer = window.setTimeout(() => {
          cooldownTimersRef.current.delete(key);
          setActionLock(key, false);
        }, cooldownMs);

        cooldownTimersRef.current.set(key, timer);
      } else {
        setActionLock(key, false);
      }
    }
  }

  function syncProjects(nextProjects: ProjectConfig[]) {
    setProjects(nextProjects);
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
  }

  function syncRuntimes(nextRuntimes: ProjectRuntime[]) {
    setRuntimes(() =>
      Object.fromEntries(nextRuntimes.map((runtime) => [runtime.projectId, runtime]))
    );
  }

  async function loadProjectData() {
    const [nextProjects, nextEnvironment] = await Promise.all([
      desktopApi.listProjects(),
      desktopApi.getEnvironment(),
    ]);

    syncProjects(nextProjects);
    setEnvironment(nextEnvironment);
  }

  function applyInspectionSuggestions(inspection: ProjectDirectoryInspection | null) {
    if (!inspection) {
      return;
    }

    const nextSuggestions = createSuggestionSnapshot(inspection);

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
        shouldApplySuggestedValue(
          current.startCommand,
          draftSuggestionRef.current.startCommand
        ) &&
        current.startCommand !== nextSuggestions.startCommand
      ) {
        nextDraft.startCommand = nextSuggestions.startCommand;
        changed = true;
      }

      return changed ? nextDraft : current;
    });

    draftSuggestionRef.current = nextSuggestions;
  }

  function openCreateDialog() {
    draftSuggestionRef.current = EMPTY_DRAFT_SUGGESTIONS;
    setProjectDraft(createEmptyProjectDraft());
    setFormError(null);
    setPathInspection(null);
    setIsProjectDialogOpen(true);
  }

  function openStartupSettingsDialog() {
    setStartupSettingsDraft(startupSettings);
    setIsStartupSettingsDialogOpen(true);
  }

  function openEditDialog(project: ProjectConfig) {
    draftSuggestionRef.current = EMPTY_DRAFT_SUGGESTIONS;
    setProjectDraft({
      id: project.id,
      name: project.name,
      path: project.path,
      nodeVersion: project.nodeVersion,
      startCommand: project.startCommand,
      autoStartOnAppLaunch: project.autoStartOnAppLaunch,
      autoOpenLocalUrlOnStart: project.autoOpenLocalUrlOnStart,
    });
    setFormError(null);
    setPathInspection(null);
    setIsProjectDialogOpen(true);
  }

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

    const unsubscribe = desktopApi.subscribeRuntime((runtime) => {
      if (!isMounted) {
        return;
      }

      setRuntimes((current) => ({ ...current, [runtime.projectId]: runtime }));
    });

    const unsubscribeAppCloseRequest = desktopApi.subscribeAppCloseRequest(
      (request) => {
        if (!isMounted) {
          return;
        }

        setAppCloseRequest(request);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
      unsubscribeAppCloseRequest();
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of cooldownTimersRef.current.values()) {
        window.clearTimeout(timer);
      }

      cooldownTimersRef.current.clear();
    };
  }, []);

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
          const inspection = await desktopApi.inspectProjectDirectory(
            trimmedPath
          );

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
  }, [isProjectDialogOpen, pathInspection, projectDraft.id]);

  async function handleSaveProject() {
    const currentProject = projectDraft.id
      ? projects.find((project) => project.id === projectDraft.id)
      : null;
    const draft = {
      id: projectDraft.id,
      name: projectDraft.name.trim(),
      path: projectDraft.path.trim(),
      nodeVersion: projectDraft.nodeVersion.trim(),
      startCommand: projectDraft.startCommand.trim(),
      autoStartOnAppLaunch: projectDraft.autoStartOnAppLaunch,
      autoOpenLocalUrlOnStart: projectDraft.autoOpenLocalUrlOnStart,
    };

    if (!draft.name || !draft.path || !draft.nodeVersion || !draft.startCommand) {
      setFormError("请把项目名称、路径、Node 版本和启动命令填写完整。");
      return;
    }

    if (
      currentProject &&
      isProjectRuntimeActive(runtimes[currentProject.id]?.status) &&
      (currentProject.path !== draft.path ||
        currentProject.nodeVersion !== draft.nodeVersion ||
        currentProject.startCommand !== draft.startCommand)
    ) {
      setFormError("项目正在运行中，请先停止后再修改路径、Node 版本或启动命令。");
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
        startCommand: draft.startCommand,
        autoStartOnAppLaunch: draft.autoStartOnAppLaunch,
        autoOpenLocalUrlOnStart: draft.autoOpenLocalUrlOnStart,
      };

      await desktopApi.saveProject(nextProject);
      await loadProjectData();
      setIsProjectDialogOpen(false);
      setPathInspection(null);
      draftSuggestionRef.current = EMPTY_DRAFT_SUGGESTIONS;
      setFeedback(null);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteProject() {
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
        title: "移除失败",
        message: getErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBrowseProjectPath() {
    setIsBrowsingPath(true);

    try {
      const selectedPath = await desktopApi.browseProjectDirectory(
        projectDraft.path
      );

      if (selectedPath) {
        setProjectDraft((current) => ({ ...current, path: selectedPath }));
        const inspection = await desktopApi.inspectProjectDirectory(selectedPath);
        setPathInspection(inspection);
        applyInspectionSuggestions(inspection);
        setFormError(null);
      }
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setIsBrowsingPath(false);
    }
  }

  async function handleStartProject(projectId: string) {
    await runLockedAction(`start:${projectId}`, async () => {
      try {
        await desktopApi.startProject(projectId);
        setFeedback(null);
      } catch (error) {
        setFeedback({
          variant: "destructive",
          title: "启动失败",
          message: getErrorMessage(error),
        });
      }
    });
  }

  async function handleStopProject(projectId: string) {
    await runLockedAction(`stop:${projectId}`, async () => {
      try {
        await desktopApi.stopProject(projectId);
        setFeedback(null);
      } catch (error) {
        setFeedback({
          variant: "destructive",
          title: "停止失败",
          message: getErrorMessage(error),
        });
      }
    });
  }

  async function handleOpenProjectDirectory(project: ProjectConfig) {
    await runLockedAction(`directory:${project.id}`, async () => {
      try {
        await desktopApi.openProjectDirectory(project.path);
      } catch (error) {
        setFeedback({
          variant: "destructive",
          title: "打开目录失败",
          message: getErrorMessage(error),
        });
      }
    }, 500);
  }

  async function handleOpenExternal(projectId: string, url: string) {
    await runLockedAction(`url:${projectId}`, async () => {
      try {
        await desktopApi.openExternal(url);
      } catch (error) {
        setFeedback({
          variant: "destructive",
          title: "打开地址失败",
          message: getErrorMessage(error),
        });
      }
    }, 500);
  }

  async function handleSaveStartupSettings() {
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
  }

  async function handleConfirmAppClose() {
    setIsConfirmingAppClose(true);

    try {
      await desktopApi.confirmAppClose();
    } finally {
      setIsConfirmingAppClose(false);
    }
  }

  async function handleCancelAppClose() {
    setAppCloseRequest(null);
    await desktopApi.cancelAppClose();
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen px-4 py-4 text-foreground">
        <div className="flex min-h-[calc(100vh-2rem)] w-full flex-col">
          <header className="flex items-center justify-between gap-4">
            <h1 className="text-[2rem] font-semibold tracking-tight text-foreground">
              前端项目启动面板
            </h1>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void runLockedAction(
                    "open-startup-settings",
                    () => {
                      openStartupSettingsDialog();
                    },
                    400
                  )
                }
                disabled={isActionLocked("open-startup-settings")}
              >
                <Settings2 className="size-4" />
                启动设置
              </Button>
              <Button
                type="button"
                onClick={() =>
                  void runLockedAction(
                    "open-create-project",
                    () => {
                      openCreateDialog();
                    },
                    400
                  )
                }
                disabled={isActionLocked("open-create-project")}
              >
                <Plus className="size-4" />
                新增项目
              </Button>
            </div>
          </header>

          {feedback ? (
            <Alert
              variant={feedback.variant}
              className="mt-4 border-white/10 bg-card/75 backdrop-blur-sm"
            >
              <AlertTitle>{feedback.title}</AlertTitle>
              <AlertDescription>{feedback.message}</AlertDescription>
            </Alert>
          ) : null}

          <section className="mt-3 flex-1 rounded-[22px] border border-white/10 bg-card/60 p-2.5 shadow-2xl shadow-black/20 backdrop-blur-xl">
            {isLoading ? (
              <div className="grid items-start grid-cols-[repeat(auto-fit,minmax(320px,390px))] gap-2.5">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Card
                    key={`placeholder-${index}`}
                    className="gap-3 border-white/10 bg-white/5 py-4"
                  >
                    <CardContent className="space-y-3">
                      <div className="h-6 w-40 animate-pulse rounded-full bg-white/8" />
                      <div className="h-20 animate-pulse rounded-2xl bg-white/6" />
                      <div className="h-10 animate-pulse rounded-xl bg-white/6" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}

            {!isLoading && projects.length === 0 ? (
              <div className="flex min-h-[420px] items-center justify-center">
                <Card className="max-w-xl border-white/10 bg-white/5 py-8 text-center backdrop-blur-sm">
                  <CardHeader className="items-center gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <FolderTree className="size-10 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">还没有项目</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5 text-sm text-muted-foreground">
                    <p>先把第一个项目加进来，后面就能直接启动项目、打开地址和查看终端。</p>
                    <Button
                      type="button"
                      onClick={() =>
                        void runLockedAction(
                          "empty-open-create-project",
                          () => {
                            openCreateDialog();
                          },
                          400
                        )
                      }
                      disabled={isActionLocked("empty-open-create-project")}
                    >
                      <Plus className="size-4" />
                      新增第一个项目
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {!isLoading && projects.length > 0 ? (
              <div className="grid items-start grid-cols-[repeat(auto-fit,minmax(320px,390px))] gap-2.5">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    runtime={runtimes[project.id]}
                    nodeVersionInstalled={hasInstalledNodeVersion(project.nodeVersion)}
                    isStartLocked={isActionLocked(`start:${project.id}`)}
                    isStopLocked={isActionLocked(`stop:${project.id}`)}
                    isEditLocked={isActionLocked(`edit:${project.id}`)}
                    isDeleteLocked={isActionLocked(`delete:${project.id}`)}
                    isTerminalLocked={isActionLocked(`terminal:${project.id}`)}
                    isDirectoryLocked={isActionLocked(`directory:${project.id}`)}
                    isAddressLocked={isActionLocked(`url:${project.id}`)}
                    onEdit={() =>
                      void runLockedAction(
                        `edit:${project.id}`,
                        () => {
                          openEditDialog(project);
                        },
                        400
                      )
                    }
                    onDelete={() =>
                      void runLockedAction(
                        `delete:${project.id}`,
                        () => {
                          setDeleteTarget(project);
                        },
                        400
                      )
                    }
                    onOpenTerminalOutput={() =>
                      void runLockedAction(
                        `terminal:${project.id}`,
                        () => {
                          setTerminalTarget(project);
                        },
                        400
                      )
                    }
                    onStart={() => void handleStartProject(project.id)}
                    onStop={() => void handleStopProject(project.id)}
                    onOpenDirectory={() => void handleOpenProjectDirectory(project)}
                    onOpenUrl={(url) => void handleOpenExternal(project.id, url)}
                  />
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <ProjectFormDialog
        open={isProjectDialogOpen}
        draft={projectDraft}
        errorMessage={formError}
        installedNodeVersions={environment.installedNodeVersions}
        isSubmitting={isSubmitting}
        isBrowsingPath={isBrowsingPath}
        nodeVersionInstalled={
          !projectDraft.nodeVersion || hasInstalledNodeVersion(projectDraft.nodeVersion)
        }
        pathInspection={pathInspection}
        onDraftChange={setProjectDraft}
        onBrowsePath={() => void handleBrowseProjectPath()}
        onOpenChange={(nextOpen) => {
          setIsProjectDialogOpen(nextOpen);
          if (!nextOpen) {
            setFormError(null);
            setPathInspection(null);
            draftSuggestionRef.current = EMPTY_DRAFT_SUGGESTIONS;
          }
        }}
        onSubmit={() => void handleSaveProject()}
      />

      <StartupSettingsDialog
        open={isStartupSettingsDialogOpen}
        settings={startupSettingsDraft}
        isSaving={isSavingStartupSettings}
        onSettingsChange={setStartupSettingsDraft}
        onOpenChange={(nextOpen) => {
          setIsStartupSettingsDialogOpen(nextOpen);
          if (!nextOpen) {
            setStartupSettingsDraft(startupSettings);
          }
        }}
        onSubmit={() => void handleSaveStartupSettings()}
      />

      <DeleteProjectDialog
        project={deleteTarget}
        isDeleting={isSubmitting}
        onConfirm={() => void handleDeleteProject()}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteTarget(null);
          }
        }}
      />

      <ProjectLogsDialog
        open={Boolean(terminalTarget)}
        project={terminalTarget}
        runtime={terminalTarget ? runtimes[terminalTarget.id] : undefined}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setTerminalTarget(null);
          }
        }}
      />

      <ExitRunningProjectsDialog
        request={appCloseRequest}
        isConfirming={isConfirmingAppClose}
        onConfirm={() => void handleConfirmAppClose()}
        onOpenChange={(open) => {
          if (!open) {
            void handleCancelAppClose();
          }
        }}
      />
    </TooltipProvider>
  );
}
