import { useEffect, useState } from "react";
import {
  Activity,
  FolderTree,
  Plus,
  RefreshCcw,
  ServerCrash,
} from "lucide-react";
import { ProjectCard } from "@/components/project-card";
import { DeleteProjectDialog } from "@/components/delete-project-dialog";
import { ProjectFormDialog, type ProjectDraft } from "@/components/project-form-dialog";
import { ProjectLogsDialog } from "@/components/project-logs-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  normalizeNodeVersion,
  type DesktopEnvironment,
  type ProjectConfig,
  type ProjectRuntime,
} from "@/shared/contracts";

function createEmptyProjectDraft(defaultNodeVersion?: string): ProjectDraft {
  return {
    name: "",
    path: "",
    nodeVersion: defaultNodeVersion ?? "",
    startCommand: "npm run dev",
  };
}

type Feedback = {
  variant: "default" | "destructive";
  title: string;
  message: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "操作失败。";
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
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(
    createEmptyProjectDraft()
  );
  const [deleteTarget, setDeleteTarget] = useState<ProjectConfig | null>(null);
  const [logsTarget, setLogsTarget] = useState<ProjectConfig | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBrowsingPath, setIsBrowsingPath] = useState(false);

  function hasInstalledNodeVersion(nodeVersion: string) {
    const normalizedVersion = normalizeNodeVersion(nodeVersion);
    return environment.installedNodeVersions.includes(normalizedVersion);
  }

  async function loadDashboardData() {
    const [nextProjects, nextEnvironment] = await Promise.all([
      window.switchProjectApi.listProjects(),
      window.switchProjectApi.getEnvironment(),
    ]);

    setProjects(nextProjects);
    setEnvironment(nextEnvironment);
    setRuntimes((currentRuntimes) => {
      const nextRuntimes = { ...currentRuntimes };
      const activeProjectIds = new Set(nextProjects.map((project) => project.id));

      for (const projectId of Object.keys(nextRuntimes)) {
        if (!activeProjectIds.has(projectId)) {
          delete nextRuntimes[projectId];
        }
      }

      return nextRuntimes;
    });
  }

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        await loadDashboardData();
      } catch (error) {
        if (isMounted) {
          setFeedback({
            variant: "destructive",
            title: "加载项目失败",
            message: getErrorMessage(error),
          });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    const unsubscribe = window.switchProjectApi.subscribeRuntime((runtime) => {
      if (!isMounted) {
        return;
      }

      setRuntimes((currentRuntimes) => ({
        ...currentRuntimes,
        [runtime.projectId]: runtime,
      }));
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const runningCount = projects.filter(
    (project) => runtimes[project.id]?.status === "running"
  ).length;
  const errorCount = projects.filter(
    (project) => runtimes[project.id]?.status === "error"
  ).length;

  function openCreateDialog() {
    setProjectDraft(createEmptyProjectDraft(environment.installedNodeVersions[0]));
    setFormError(null);
    setIsProjectDialogOpen(true);
  }

  function openEditDialog(project: ProjectConfig) {
    setProjectDraft(project);
    setFormError(null);
    setIsProjectDialogOpen(true);
  }

  async function refreshProjects() {
    try {
      await loadDashboardData();
    } catch (error) {
      setFeedback({
        variant: "destructive",
        title: "刷新失败",
        message: getErrorMessage(error),
      });
    }
  }

  async function handleSaveProject() {
    const trimmedDraft = {
      id: projectDraft.id,
      name: projectDraft.name.trim(),
      path: projectDraft.path.trim(),
      nodeVersion: projectDraft.nodeVersion.trim(),
      startCommand: projectDraft.startCommand.trim(),
    };

    if (
      !trimmedDraft.name ||
      !trimmedDraft.path ||
      !trimmedDraft.nodeVersion ||
      !trimmedDraft.startCommand
    ) {
      setFormError("请填写完整的项目信息。");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const nextProject: ProjectConfig = {
        id: trimmedDraft.id ?? crypto.randomUUID(),
        name: trimmedDraft.name,
        path: trimmedDraft.path,
        nodeVersion: trimmedDraft.nodeVersion,
        startCommand: trimmedDraft.startCommand,
      };

      await window.switchProjectApi.saveProject(nextProject);
      await loadDashboardData();
      setIsProjectDialogOpen(false);
      setProjectDraft(createEmptyProjectDraft(environment.installedNodeVersions[0]));
      setFeedback({
        variant: "default",
        title: nextProject.id === projectDraft.id ? "项目已更新" : "项目已添加",
        message: `${nextProject.name} 已加入面板。`,
      });
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
      await window.switchProjectApi.deleteProject(deleteTarget.id);
      await loadDashboardData();
      setFeedback({
        variant: "default",
        title: "项目已移除",
        message: `${deleteTarget.name} 已从面板中移除。`,
      });
      setDeleteTarget(null);
    } catch (error) {
      setFeedback({
        variant: "destructive",
        title: "删除失败",
        message: getErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBrowseProjectPath() {
    setIsBrowsingPath(true);

    try {
      const selectedPath = await window.switchProjectApi.browseProjectDirectory(
        projectDraft.path
      );

      if (!selectedPath) {
        return;
      }

      setProjectDraft((currentDraft) => ({
        ...currentDraft,
        path: selectedPath,
      }));
      setFormError(null);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setIsBrowsingPath(false);
    }
  }

  async function handleStartProject(projectId: string) {
    try {
      await window.switchProjectApi.startProject(projectId);
      setFeedback(null);
    } catch (error) {
      setFeedback({
        variant: "destructive",
        title: "启动失败",
        message: getErrorMessage(error),
      });
    }
  }

  async function handleStopProject(projectId: string) {
    try {
      await window.switchProjectApi.stopProject(projectId);
      setFeedback(null);
    } catch (error) {
      setFeedback({
        variant: "destructive",
        title: "停止失败",
        message: getErrorMessage(error),
      });
    }
  }

  return (
    <>
      <div className="min-h-screen">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8">
          <header className="relative overflow-hidden rounded-[30px] border border-white/10 bg-card/70 p-8 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(62,207,196,0.16),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(91,123,255,0.12),transparent_32%)]" />
            <div className="relative flex flex-col gap-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl space-y-3">
                  <p className="font-mono text-xs uppercase tracking-[0.32em] text-primary/90">
                    本地前端控制台
                  </p>
                  <h1 className="text-4xl font-semibold tracking-tight text-foreground">
                    项目切换面板
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    统一管理项目路径、Node 版本和启动命令，不用再切换目录或来回开终端。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/12 bg-white/5 text-foreground hover:bg-white/10"
                    onClick={() => void refreshProjects()}
                  >
                    <RefreshCcw className="size-4" />
                    刷新
                  </Button>
                  <Button
                    size="sm"
                    className="shadow-lg shadow-primary/20"
                    onClick={openCreateDialog}
                  >
                    <Plus className="size-4" />
                    新增项目
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Card className="gap-4 border-white/10 bg-white/5 py-5 backdrop-blur-sm">
                  <CardHeader className="gap-1 pb-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      面板项目数
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-end gap-3">
                      <FolderTree className="size-5 text-primary" />
                      <span className="font-mono text-3xl font-semibold text-foreground">
                        {projects.length}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="gap-4 border-white/10 bg-white/5 py-5 backdrop-blur-sm">
                  <CardHeader className="gap-1 pb-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      运行中
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-end gap-3">
                      <Activity className="size-5 text-primary" />
                      <span className="font-mono text-3xl font-semibold text-foreground">
                        {runningCount}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="gap-4 border-white/10 bg-white/5 py-5 backdrop-blur-sm">
                  <CardHeader className="gap-1 pb-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      待处理
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-end gap-3">
                      <ServerCrash className="size-5 text-amber-300" />
                      <span className="font-mono text-3xl font-semibold text-foreground">
                        {errorCount}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </header>

          {feedback ? (
            <Alert
              variant={feedback.variant}
              className="mt-6 border-white/10 bg-card/75 backdrop-blur-sm"
            >
              <AlertTitle>{feedback.title}</AlertTitle>
              <AlertDescription>{feedback.message}</AlertDescription>
            </Alert>
          ) : null}

          <section className="mt-6 flex-1 overflow-hidden rounded-[30px] border border-white/10 bg-card/60 p-2 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <ScrollArea className="h-[calc(100vh-24rem)]">
              {isLoading ? (
                <div className="grid gap-4 p-4 xl:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Card
                      key={`placeholder-${index}`}
                      className="gap-4 border-white/10 bg-white/5 py-6"
                    >
                      <CardContent className="space-y-4">
                        <div className="h-6 w-40 animate-pulse rounded-full bg-white/8" />
                        <div className="h-16 animate-pulse rounded-2xl bg-white/6" />
                        <div className="h-10 animate-pulse rounded-2xl bg-white/6" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : null}

              {!isLoading && projects.length === 0 ? (
                <div className="flex min-h-[460px] items-center justify-center p-6">
                  <Card className="max-w-2xl border-white/10 bg-white/5 py-8 text-center backdrop-blur-sm">
                    <CardHeader className="items-center gap-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <FolderTree className="size-10 text-primary" />
                      </div>
                      <CardTitle className="text-2xl">还没有项目</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5 text-sm text-muted-foreground">
                      <p>
                        先添加你的第一个前端项目，填写本地路径、所需 Node
                        版本，以及平时在终端里使用的启动命令。
                      </p>
                      <Button onClick={openCreateDialog}>
                        <Plus className="size-4" />
                        新增第一个项目
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              ) : null}

              {!isLoading && projects.length > 0 ? (
                <div className="grid gap-4 p-4 xl:grid-cols-2">
                  {projects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      nodeVersionInstalled={hasInstalledNodeVersion(project.nodeVersion)}
                      runtime={runtimes[project.id]}
                      onEdit={() => openEditDialog(project)}
                      onDelete={() => setDeleteTarget(project)}
                      onViewLogs={() => setLogsTarget(project)}
                      onStart={() => void handleStartProject(project.id)}
                      onStop={() => void handleStopProject(project.id)}
                    />
                  ))}
                </div>
              ) : null}
            </ScrollArea>
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
        onDraftChange={setProjectDraft}
        onBrowsePath={() => void handleBrowseProjectPath()}
        onOpenChange={(nextOpen) => {
          setIsProjectDialogOpen(nextOpen);
          if (!nextOpen) {
            setFormError(null);
          }
        }}
        onSubmit={() => void handleSaveProject()}
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
        open={Boolean(logsTarget)}
        project={logsTarget}
        runtime={logsTarget ? runtimes[logsTarget.id] : undefined}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setLogsTarget(null);
          }
        }}
      />
    </>
  );
}
