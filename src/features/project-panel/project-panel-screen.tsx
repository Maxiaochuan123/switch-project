import { Download, FolderTree, Plus, Settings2, Upload } from "lucide-react";
import { DeleteProjectDialog } from "@/components/delete-project-dialog";
import { ExitRunningProjectsDialog } from "@/components/exit-running-projects-dialog";
import { InstallNodeVersionDialog } from "@/components/install-node-version-dialog";
import { ProjectCard } from "@/components/project-card";
import { ProjectFormDialog } from "@/components/project-form-dialog";
import { ProjectLogsDialog } from "@/components/project-logs-dialog";
import { RetryProjectNodeVersionDialog } from "@/components/retry-project-node-version-dialog";
import { StartupSettingsDialog } from "@/components/startup-settings-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useProjectPanelController } from "./use-project-panel-controller";

export function ProjectPanelScreen() {
  const controller = useProjectPanelController();
  const skeletonCount = controller.projects.length > 0 ? Math.min(controller.projects.length, 2) : 1;

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
                onClick={() => void controller.handleImportProjects()}
                disabled={controller.isActionLocked("import-projects")}
              >
                <Upload className="size-4" />
                导入配置
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void controller.handleExportProjects()}
                disabled={controller.isActionLocked("export-projects")}
              >
                <Download className="size-4" />
                导出配置
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void controller.runLockedAction(
                    "open-startup-settings",
                    controller.openStartupSettingsDialog,
                    400
                  )
                }
                disabled={controller.isActionLocked("open-startup-settings")}
              >
                <Settings2 className="size-4" />
                启动设置
              </Button>
              <Button
                type="button"
                onClick={() =>
                  void controller.runLockedAction(
                    "open-create-project",
                    controller.openCreateDialog,
                    400
                  )
                }
                disabled={controller.isActionLocked("open-create-project")}
              >
                <Plus className="size-4" />
                新增项目
              </Button>
            </div>
          </header>

          <section className="mt-3 flex-1 rounded-[22px] border border-white/10 bg-card/60 p-2.5 shadow-2xl shadow-black/20 backdrop-blur-xl">
            {controller.isLoading ? (
              <div className="grid items-start grid-cols-[repeat(auto-fit,minmax(320px,390px))] gap-2.5">
                {Array.from({ length: skeletonCount }).map((_, index) => (
                  <Card key={`placeholder-${index}`} className="gap-3 border-white/10 bg-white/5 py-4">
                    <CardContent className="space-y-3">
                      <div className="h-6 w-40 animate-pulse rounded-full bg-white/8" />
                      <div className="h-20 animate-pulse rounded-2xl bg-white/6" />
                      <div className="h-10 animate-pulse rounded-xl bg-white/6" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}

            {!controller.isLoading && controller.projects.length === 0 ? (
              <div className="flex min-h-[420px] items-center justify-center">
                <Card className="max-w-xl border-white/10 bg-white/5 py-8 text-center backdrop-blur-sm">
                  <CardHeader className="items-center gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <FolderTree className="size-10 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">还没有项目</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5 text-sm text-muted-foreground">
                    <p>先添加第一个项目，后面就可以直接启动项目、打开地址和查看终端。</p>
                    <Button
                      type="button"
                      onClick={() =>
                        void controller.runLockedAction(
                          "empty-open-create-project",
                          controller.openCreateDialog,
                          400
                        )
                      }
                      disabled={controller.isActionLocked("empty-open-create-project")}
                    >
                      <Plus className="size-4" />
                      新增第一个项目
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {!controller.isLoading && controller.projects.length > 0 ? (
              <div className="grid items-start grid-cols-[repeat(auto-fit,minmax(320px,390px))] gap-2.5">
                {controller.projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    runtime={controller.runtimes[project.id]}
                    runtimeFailureMessage={controller.projectStartFailures[project.id]}
                    operationPanel={controller.projectOperationPanels[project.id]}
                    diagnosis={controller.projectDiagnoses[project.id]}
                    isStartLocked={
                      controller.isActionLocked(`start:${project.id}`) ||
                      controller.isProjectDependencyOperationLocked(project.id)
                    }
                    isStopLocked={controller.isActionLocked(`stop:${project.id}`)}
                    isEditLocked={controller.isActionLocked(`edit:${project.id}`)}
                    isDeleteLocked={controller.isActionLocked(`delete:${project.id}`)}
                    isDeleteNodeModulesLocked={
                      controller.isActionLocked(`delete-node-modules:${project.id}`) ||
                      controller.isProjectDependencyOperationLocked(project.id)
                    }
                    isReinstallNodeModulesLocked={
                      controller.isActionLocked(`reinstall-node-modules:${project.id}`) ||
                      controller.isProjectDependencyOperationLocked(project.id)
                    }
                    isTerminalLocked={controller.isActionLocked(`terminal:${project.id}`)}
                    isDirectoryLocked={controller.isActionLocked(`directory:${project.id}`)}
                    isAddressLocked={controller.isActionLocked(`url:${project.id}`)}
                    onEdit={() =>
                      void controller.runLockedAction(
                        `edit:${project.id}`,
                        () => {
                          controller.openEditDialog(project);
                        },
                        400
                      )
                    }
                    onDelete={() =>
                      void controller.runLockedAction(
                        `delete:${project.id}`,
                        () => {
                          controller.setDeleteTarget(project);
                        },
                        400
                      )
                    }
                    onDeleteNodeModules={() => void controller.handleDeleteProjectDependencies(project)}
                    onReinstallNodeModules={() =>
                      void controller.handleReinstallProjectDependenciesToast(project)
                    }
                    onOpenTerminalOutput={() =>
                      void controller.runLockedAction(
                        `terminal:${project.id}`,
                        () => {
                          controller.setTerminalTarget(project);
                        },
                        400
                      )
                    }
                    onStart={() => void controller.handleStartProject(project.id)}
                    onStop={() => void controller.handleStopProject(project.id)}
                    onOpenDirectory={() => void controller.handleOpenProjectDirectory(project)}
                    onOpenUrl={(url) => void controller.handleOpenExternal(project.id, url)}
                  />
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <ProjectFormDialog
        open={controller.isProjectDialogOpen}
        draft={controller.projectDraft}
        submitErrorMessage={controller.formError}
        installedNodeVersions={controller.environment.installedNodeVersions}
        activeNodeVersion={controller.environment.activeNodeVersion}
        installedPackageManagers={controller.environment.availablePackageManagers}
        isSubmitting={controller.isSubmitting}
        isInspectingProject={controller.isInspectingProject}
        inspectionNotice={controller.inspectionNotice}
        dropzoneError={controller.dropzoneError}
        pathInspection={controller.pathInspection}
        isInstallingNodeVersion={controller.isInstallingNodeVersion}
        onPackageManagerChange={controller.handlePackageManagerChange}
        onInstallNodeVersion={(version) => void controller.handleInstallNodeVersionOnly(version)}
        onBrowsePath={() => void controller.handleBrowseProjectPath()}
        onPathSelected={(path) => void controller.handleDropzonePath(path)}
        onOpenChange={controller.handleProjectDialogOpenChange}
        onSubmit={(draft) => void controller.handleSaveProject(draft)}
      />

      <InstallNodeVersionDialog
        open={Boolean(controller.nodeInstallRequest)}
        projectName={controller.nodeInstallRequest?.project.name ?? ""}
        nodeVersion={controller.nodeInstallRequest?.version ?? ""}
        isInstalling={controller.isInstallingNodeVersion}
        onConfirm={() => void controller.handleInstallNodeVersionAndStart()}
        onOpenChange={controller.handleNodeInstallDialogOpenChange}
      />

      <RetryProjectNodeVersionDialog
        open={Boolean(controller.nodeRetryTarget)}
        projectName={controller.nodeRetryTarget?.project.name ?? ""}
        currentNodeVersion={controller.nodeRetryTarget?.project.nodeVersion ?? ""}
        suggestedNodeVersion={controller.nodeRetryTarget?.suggestedNodeVersion ?? ""}
        availableNodeVersions={controller.environment.installedNodeVersions}
        isProcessing={controller.isInstallingNodeVersion}
        onConfirm={(nodeVersion) => void controller.handleRetryProjectWithSuggestedNode(nodeVersion)}
        onOpenChange={controller.handleNodeRetryDialogOpenChange}
      />

      <StartupSettingsDialog
        open={controller.isStartupSettingsDialogOpen}
        settings={controller.startupSettingsDraft}
        isSaving={controller.isSavingStartupSettings}
        onSettingsChange={controller.setStartupSettingsDraft}
        onOpenChange={controller.handleStartupSettingsOpenChange}
        onSubmit={() => void controller.handleSaveStartupSettings()}
      />

      <DeleteProjectDialog
        project={controller.deleteTarget}
        isDeleting={controller.isSubmitting}
        onConfirm={() => void controller.handleDeleteProject()}
        onOpenChange={controller.handleDeleteDialogOpenChange}
      />

      <ProjectLogsDialog
        open={Boolean(controller.terminalTarget)}
        project={controller.terminalTarget}
        runtime={
          controller.terminalTarget ? controller.runtimes[controller.terminalTarget.id] : undefined
        }
        onOpenChange={controller.handleLogsDialogOpenChange}
      />

      <ExitRunningProjectsDialog
        request={controller.appCloseRequest}
        isConfirming={controller.isConfirmingAppClose}
        isMinimizing={controller.isMinimizingAppClose}
        onConfirm={() => void controller.handleConfirmAppClose()}
        onMinimize={() => void controller.handleMinimizeAppClose()}
        onOpenChange={controller.handleExitDialogOpenChange}
      />

      <Toaster />
    </TooltipProvider>
  );
}
