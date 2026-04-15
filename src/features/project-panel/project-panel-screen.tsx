import { lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download,Plus, Settings2, Upload } from "lucide-react";
import { DropzoneField } from "@/components/dropzone-field";
import { NodeVersionSyncCard } from "@/components/node-version-sync-card";
import { ProjectCard } from "@/components/project-card";
import { ProjectGlobalDropzone } from "@/components/project-global-dropzone";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useProjectPanelController } from "./use-project-panel-controller";

const ProjectFormDialog = lazy(() =>
  import("@/components/project-form-dialog").then((module) => ({
    default: module.ProjectFormDialog,
  }))
);

const InstallNodeVersionDialog = lazy(() =>
  import("@/components/install-node-version-dialog").then((module) => ({
    default: module.InstallNodeVersionDialog,
  }))
);

const FnmSetupDialog = lazy(() =>
  import("@/components/fnm-setup-dialog").then((module) => ({
    default: module.FnmSetupDialog,
  }))
);

const RetryProjectNodeVersionDialog = lazy(() =>
  import("@/components/retry-project-node-version-dialog").then((module) => ({
    default: module.RetryProjectNodeVersionDialog,
  }))
);

const StartupSettingsDialog = lazy(() =>
  import("@/components/startup-settings-dialog").then((module) => ({
    default: module.StartupSettingsDialog,
  }))
);

const DeleteProjectDialog = lazy(() =>
  import("@/components/delete-project-dialog").then((module) => ({
    default: module.DeleteProjectDialog,
  }))
);

const ProjectLogsDialog = lazy(() =>
  import("@/components/project-logs-dialog").then((module) => ({
    default: module.ProjectLogsDialog,
  }))
);

const ExitRunningProjectsDialog = lazy(() =>
  import("@/components/exit-running-projects-dialog").then((module) => ({
    default: module.ExitRunningProjectsDialog,
  }))
);

export function ProjectPanelScreen() {
  const controller = useProjectPanelController();

  return (
    <TooltipProvider>
      <ProjectGlobalDropzone onPathSelected={controller.projectFormDialog.onPathSelected} />
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
                onClick={() => void controller.page.handleImportProjects()}
                disabled={controller.page.isActionLocked("import-projects")}
              >
                <Upload className="size-4" />
                导入配置
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void controller.page.handleExportProjects()}
                disabled={controller.page.isActionLocked("export-projects")}
              >
                <Download className="size-4" />
                导出配置
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void controller.page.runLockedAction(
                    "open-startup-settings",
                    controller.page.openStartupSettingsDialog,
                    400
                  )
                }
                disabled={controller.page.isActionLocked("open-startup-settings")}
              >
                <Settings2 className="size-4" />
                启动设置
              </Button>
              <Button
                type="button"
                onClick={() =>
                  void controller.page.runLockedAction(
                    "open-create-project",
                    controller.page.openCreateDialog,
                    400
                  )
                }
                disabled={controller.page.isActionLocked("open-create-project")}
              >
                <Plus className="size-4" />
                添加项目
              </Button>
            </div>
          </header>

          {controller.nodeVersionSyncCard.open ? (
            <NodeVersionSyncCard
              missingVersions={controller.nodeVersionSyncCard.missingVersions}
              isSyncing={controller.nodeVersionSyncCard.isSyncing}
              progress={controller.nodeVersionSyncCard.progress}
              onDismiss={controller.nodeVersionSyncCard.onDismiss}
              onSync={() => void controller.nodeVersionSyncCard.onSync()}
            />
          ) : null}

          <section className="mt-3 flex-1 rounded-xl border border-border/50 bg-black/40 p-2.5 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <AnimatePresence mode="wait">
              {!controller.page.isLoading && !controller.page.hasProjects ? (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  className="flex h-full min-h-[600px] flex-col items-center justify-center p-8 text-center"
                >
                  <div className="max-w-md space-y-6">
                    <h2 className="text-5xl font-extrabold tracking-tighter text-white">
                      构建你的项目空间
                    </h2>
                    <p className="text-xl text-muted-foreground/60 leading-relaxed">
                      VoltAgent 将助你高效管理启动前端项目。<br />
                      将项目文件夹拖入下方，即可开启沉浸式开发体验。
                    </p>
                  </div>

                  <div className="mt-12 w-full max-w-lg">
                    <div className="rounded-2xl border border-white/5 bg-white/5 p-6 backdrop-blur-md shadow-2xl">
                      <DropzoneField
                        selectedPath=""
                        isLoading={controller.projectFormDialog.isInspectingProject && !controller.projectFormDialog.open}
                        dropzoneError={controller.projectFormDialog.dropzoneError}
                        onBrowse={controller.projectFormDialog.onBrowsePath}
                      />
                    </div>
                  </div>
                </motion.div>
              ) : !controller.page.isLoading && controller.page.hasProjects ? (
                <motion.div 
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid items-start grid-cols-[repeat(auto-fit,minmax(320px,390px))] gap-6 p-2"
                >
                  {controller.page.projectCards.map((card) => (
                    <motion.div
                      key={card.key}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    >
                      <ProjectCard
                        project={card.project}
                        runtime={card.runtime}
                        runtimeFailureMessage={card.runtimeFailureMessage}
                        operationPanel={card.operationPanel}
                        diagnosis={card.diagnosis}
                        isDiagnosisPending={card.isDiagnosisPending}
                        isStartPending={card.isStartPending}
                        isStopPending={card.isStopPending}
                        isStartLocked={card.isStartLocked}
                        isStopLocked={card.isStopLocked}
                        isEditLocked={card.isEditLocked}
                        isDeleteLocked={card.isDeleteLocked}
                        isDeleteNodeModulesLocked={card.isDeleteNodeModulesLocked}
                        isReinstallNodeModulesLocked={card.isReinstallNodeModulesLocked}
                        isTerminalLocked={card.isTerminalLocked}
                        isDirectoryLocked={card.isDirectoryLocked}
                        isAddressLocked={card.isAddressLocked}
                        onEdit={card.onEdit}
                        onDelete={card.onDelete}
                        onDeleteNodeModules={card.onDeleteNodeModules}
                        onReinstallNodeModules={card.onReinstallNodeModules}
                        onOpenTerminalOutput={card.onOpenTerminalOutput}
                        onStart={card.onStart}
                        onStop={card.onStop}
                        onOpenDirectory={card.onOpenDirectory}
                        onOpenUrl={card.onOpenUrl}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        </div>
      </div>

      <Suspense fallback={null}>
        {controller.fnmSetupDialog.open ? (
          <FnmSetupDialog
            open={controller.fnmSetupDialog.open}
            isInstalling={controller.fnmSetupDialog.isInstalling}
            installResult={controller.fnmSetupDialog.installResult}
            isLogsOpen={controller.fnmSetupDialog.isLogsOpen}
            onInstall={() => void controller.fnmSetupDialog.onInstall()}
            onLogsOpenChange={controller.fnmSetupDialog.onLogsOpenChange}
            onOpenGuide={() => void controller.fnmSetupDialog.onOpenGuide()}
            onOpenLogs={controller.fnmSetupDialog.onOpenLogs}
            onRefresh={() => void controller.fnmSetupDialog.onRefresh()}
          />
        ) : null}

        {controller.projectFormDialog.open ? (
          <ProjectFormDialog
            open={controller.projectFormDialog.open}
            draft={controller.projectFormDialog.draft}
            submitErrorMessage={controller.projectFormDialog.submitErrorMessage}
            installedNodeVersions={controller.projectFormDialog.installedNodeVersions}
            nvmInstalledNodeVersions={controller.projectFormDialog.nvmInstalledNodeVersions}
            activeNodeVersion={controller.projectFormDialog.activeNodeVersion}
            installedPackageManagers={controller.projectFormDialog.installedPackageManagers}
            isSubmitting={controller.projectFormDialog.isSubmitting}
            isInspectingProject={controller.projectFormDialog.isInspectingProject}
            inspectionNotice={controller.projectFormDialog.inspectionNotice}
            dropzoneError={controller.projectFormDialog.dropzoneError}
            pathInspection={controller.projectFormDialog.pathInspection}
            isInstallingNodeVersion={controller.projectFormDialog.isInstallingNodeVersion}
            nodeInstallProgress={controller.projectFormDialog.nodeInstallProgress}
            onPackageManagerChange={controller.projectFormDialog.onPackageManagerChange}
            onInstallNodeVersion={(version) =>
              void controller.projectFormDialog.onInstallNodeVersion(version)
            }
            onBrowsePath={() => void controller.projectFormDialog.onBrowsePath()}
            onOpenChange={controller.projectFormDialog.onOpenChange}
            onSubmit={(draft) => void controller.projectFormDialog.onSubmit(draft)}
          />
        ) : null}

        {controller.nodeInstallDialog.open ? (
          <InstallNodeVersionDialog
            open={controller.nodeInstallDialog.open}
            projectName={controller.nodeInstallDialog.projectName}
            nodeVersion={controller.nodeInstallDialog.nodeVersion}
            isInstalling={controller.nodeInstallDialog.isInstalling}
            progress={controller.nodeInstallDialog.progress}
            onConfirm={() => void controller.nodeInstallDialog.onConfirm()}
            onOpenChange={controller.nodeInstallDialog.onOpenChange}
          />
        ) : null}

        {controller.nodeRetryDialog.open ? (
          <RetryProjectNodeVersionDialog
            open={controller.nodeRetryDialog.open}
            projectName={controller.nodeRetryDialog.projectName}
            currentNodeVersion={controller.nodeRetryDialog.currentNodeVersion}
            suggestedNodeVersion={controller.nodeRetryDialog.suggestedNodeVersion}
            availableNodeVersions={controller.nodeRetryDialog.availableNodeVersions}
            isProcessing={controller.nodeRetryDialog.isProcessing}
            onConfirm={(nodeVersion) =>
              void controller.nodeRetryDialog.onConfirm(nodeVersion)
            }
            onOpenChange={controller.nodeRetryDialog.onOpenChange}
          />
        ) : null}

        {controller.startupSettingsDialog.open ? (
          <StartupSettingsDialog
            open={controller.startupSettingsDialog.open}
            settings={controller.startupSettingsDialog.settings}
            isSaving={controller.startupSettingsDialog.isSaving}
            onSettingsChange={controller.startupSettingsDialog.onSettingsChange}
            onOpenChange={controller.startupSettingsDialog.onOpenChange}
            onSubmit={() => void controller.startupSettingsDialog.onSubmit()}
          />
        ) : null}

        {controller.deleteDialog.project ? (
          <DeleteProjectDialog
            project={controller.deleteDialog.project}
            isDeleting={controller.deleteDialog.isDeleting}
            onConfirm={() => void controller.deleteDialog.onConfirm()}
            onOpenChange={controller.deleteDialog.onOpenChange}
          />
        ) : null}

        {controller.logsDialog.open ? (
          <ProjectLogsDialog
            open={controller.logsDialog.open}
            project={controller.logsDialog.project}
            runtime={controller.logsDialog.runtime}
            onOpenChange={controller.logsDialog.onOpenChange}
          />
        ) : null}

        {controller.exitDialog.request ? (
          <ExitRunningProjectsDialog
            request={controller.exitDialog.request}
            isConfirming={controller.exitDialog.isConfirming}
            isMinimizing={controller.exitDialog.isMinimizing}
            onConfirm={() => void controller.exitDialog.onConfirm()}
            onMinimize={() => void controller.exitDialog.onMinimize()}
            onOpenChange={controller.exitDialog.onOpenChange}
          />
        ) : null}
      </Suspense>

      <Toaster />
    </TooltipProvider>
  );
}
