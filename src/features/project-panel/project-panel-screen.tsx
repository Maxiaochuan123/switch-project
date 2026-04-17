import { lazy, Suspense, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  LoaderCircle,
  Plus,
  Settings,
  Settings2,
  Upload,
  Wrench,
  RefreshCw,
  Info,
} from "lucide-react";
import { AssignProjectsToGroupDialog } from "@/components/assign-projects-to-group-dialog";
import { ConfirmProjectGroupReassignDialog } from "@/components/confirm-project-group-reassign-dialog";
import { DeleteProjectGroupDialog } from "@/components/delete-project-group-dialog";
import { DropzoneField } from "@/components/dropzone-field";
import { MoveProjectGroupDialog } from "@/components/move-project-group-dialog";
import { NodeVersionSyncCard } from "@/components/node-version-sync-card";
import { ProjectGroupDialog } from "@/components/project-group-dialog";
import { ProjectGlobalDropzone } from "@/components/project-global-dropzone";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUpdater } from "@/lib/updater";
import { version } from "../../../package.json";
import { cn } from "@/lib/utils";
import {
  ProjectGroupTabsDnd,
  SortableProjectCardsGrid,
} from "./project-panel-sortable";
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

const NodeVersionManagerDialog = lazy(() =>
  import("@/components/node-version-manager-dialog").then((module) => ({
    default: module.NodeVersionManagerDialog,
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
  const selectedManagedGroup = controller.page.selectedManagedGroup;
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const isImportingProjects = controller.page.isActionLocked("import-projects");
  const isExportingProjects = controller.page.isActionLocked("export-projects");
  const isAssignProjectsLocked = selectedManagedGroup
    ? controller.page.isActionLocked(`assign-projects:${selectedManagedGroup.id}`)
    : false;

  const { status, progress, checkForUpdates, downloadAndInstall } = useUpdater();

  return (
    <TooltipProvider>
      <ProjectGlobalDropzone onPathSelected={controller.projectFormDialog.onPathSelected} />
      <div className="min-h-screen px-4 py-3 text-foreground">
        <div className="flex min-h-[calc(100vh-1.5rem)] w-full flex-col">
          <header className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              {controller.page.hasProjectGroups ? (
                <ScrollArea
                  className="min-w-0 flex-1"
                  scrollbarOrientation="horizontal"
                >
                  <div className="flex min-w-max items-center gap-2">
                    <ProjectGroupTabsDnd
                      activeKey={controller.page.activeGroupTab}
                      groupTabs={controller.page.groupTabs}
                      isAssignLocked={isAssignProjectsLocked}
                      onAssignProjects={() =>
                        void controller.page.runLockedAction(
                          `assign-projects:${selectedManagedGroup?.id ?? "none"}`,
                          controller.page.handleOpenAssignProjectsDialog,
                          400
                        )
                      }
                      onDeleteGroup={controller.page.handleDeleteActiveGroup}
                      onRenameGroup={controller.page.handleRenameActiveGroup}
                      onReorder={controller.page.handleReorderProjectGroups}
                      onSelectTab={controller.page.setActiveGroupTab}
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="rounded-xl text-primary hover:bg-primary/10 hover:text-primary"
                      onClick={() =>
                        void controller.page.runLockedAction(
                          "open-create-group",
                          controller.page.handleCreateGroup,
                          400
                        )
                      }
                      disabled={controller.page.isActionLocked("open-create-group")}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex h-9 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-xl px-0 text-sm text-muted-foreground hover:bg-transparent hover:text-foreground"
                    onClick={() =>
                      void controller.page.runLockedAction(
                        "open-create-group",
                        controller.page.handleCreateGroup,
                        400
                      )
                    }
                    disabled={controller.page.isActionLocked("open-create-group")}
                  >
                    <Plus className="size-4" />
                    创建分组
                  </Button>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-9 px-3"
                onClick={() => setIsSettingsDrawerOpen(true)}
              >
                <Settings className="size-4" />
                设置
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9"
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

          <section className="mt-2.5 flex-1 rounded-xl border border-border/50 bg-black/40 p-2 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <AnimatePresence mode="wait">
              {!controller.page.isLoading &&
              !controller.page.hasProjects &&
              !controller.page.hasProjectGroups ? (
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
                      Current 将助你高效管理启动前端项目。<br />
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
              ) : !controller.page.isLoading ? (
                <motion.div
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3 p-1.5"
                >
                  {controller.page.visibleProjectCards.length > 0 ? (
                    <SortableProjectCardsGrid
                      cards={controller.page.visibleProjectCards}
                      onReorder={controller.page.handleReorderProjectsInSelectedGroup}
                      sortableGroupId={selectedManagedGroup?.id ?? null}
                    />
                  ) : selectedManagedGroup ? (
                    <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-border/40 bg-black/20 px-6 py-10">
                      <div className="max-w-md text-center">
                        <div className="text-base font-medium text-foreground">
                          这个分组里还没有项目
                        </div>
                        <div className="mt-2 text-sm leading-6 text-muted-foreground">
                          把已有项目加入“{selectedManagedGroup.name}”，或者先添加新项目后再归到这个分组。
                        </div>
                        <Button
                          type="button"
                          className="mt-5"
                          onClick={() =>
                            void controller.page.runLockedAction(
                              `assign-projects:${selectedManagedGroup.id}`,
                              controller.page.handleOpenAssignProjectsDialog,
                              400
                            )
                          }
                          disabled={controller.page.isActionLocked(
                            `assign-projects:${selectedManagedGroup.id}`
                          )}
                        >
                          <Plus className="size-4" />
                          添加项目到分组
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/40 bg-black/20 px-4 py-8 text-sm text-muted-foreground">
                      当前标签下还没有项目。
                    </div>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        </div>
      </div>

      <Drawer open={isSettingsDrawerOpen} onOpenChange={setIsSettingsDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>设置</DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="flex min-h-[50vh] flex-col">
            <div className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setIsSettingsDrawerOpen(false);
                  void controller.page.runLockedAction(
                    "open-startup-settings",
                    controller.page.openStartupSettingsDialog,
                    400
                  );
                }}
                disabled={controller.page.isActionLocked("open-startup-settings")}
              >
                <Settings2 className="size-4" />
                启动设置
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setIsSettingsDrawerOpen(false);
                  controller.page.openNodeVersionManagerDialog();
                }}
              >
                <Wrench className="size-4" />
                Node 版本管理
              </Button>
            </div>

            <div className="mt-auto space-y-3">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  void controller.page.handleImportProjects();
                }}
                disabled={isImportingProjects}
              >
                {isImportingProjects ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                {isImportingProjects ? "恢复中..." : "恢复备份"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  void controller.page.handleExportProjects();
                }}
                disabled={isExportingProjects}
              >
                {isExportingProjects ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {isExportingProjects ? "创建中..." : "创建备份"}
              </Button>

              <div className="border-t border-border/50 py-1" />

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/30 bg-black/20 p-3 backdrop-blur-md">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Info className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground">Current</span>
                      <span className="text-[10px] font-medium text-muted-foreground uppercase opacity-50">Beta</span>
                    </div>
                    <div className="text-xs text-muted-foreground">版本 v{version}</div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {(status === "idle" || status === "checking" || status === "up-to-date" || status === "error") ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2.5 text-xs font-medium hover:bg-primary/10 hover:text-primary transition-all active:scale-95"
                      onClick={() => void checkForUpdates()}
                      disabled={status === "checking"}
                    >
                      <RefreshCw className={cn("mr-1.5 size-3", status === "checking" && "animate-spin")} />
                      {status === "checking" ? "检查中" : "检查更新"}
                    </Button>
                  ) : status === "available" ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 px-3 text-xs font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-95"
                      onClick={() => void downloadAndInstall()}
                    >
                      <Download className="mr-1.5 size-3" />
                      立即更新
                    </Button>
                  ) : null}
                </div>
              </div>

              {status === "downloading" && (
                <div className="px-1 space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
                  <div className="flex justify-between items-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <div className="size-1 rounded-full bg-primary animate-pulse" />
                      正在下载更新...
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-primary/10">
                    <motion.div
                      className="h-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ type: "spring", bounce: 0, duration: 0.5 }}
                    />
                  </div>
                </div>
              )}
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

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
            projectGroups={controller.projectFormDialog.projectGroups}
            submitErrorMessage={controller.projectFormDialog.submitErrorMessage}
            installedNodeVersions={controller.projectFormDialog.installedNodeVersions}
            nvmInstalledNodeVersions={controller.projectFormDialog.nvmInstalledNodeVersions}
            activeNodeVersion={controller.projectFormDialog.activeNodeVersion}
            defaultNodeVersion={controller.projectFormDialog.defaultNodeVersion}
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
            onOpenCreateGroup={controller.projectFormDialog.onOpenCreateGroup}
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

        {controller.nodeVersionManagerDialog.open ? (
          <NodeVersionManagerDialog
            open={controller.nodeVersionManagerDialog.open}
            isLoading={controller.nodeVersionManagerDialog.isLoading}
            installedVersions={controller.nodeVersionManagerDialog.installedVersions}
            latestLtsVersions={controller.nodeVersionManagerDialog.latestLtsVersions}
            latestLtsError={controller.nodeVersionManagerDialog.latestLtsError}
            activeNodeVersion={controller.nodeVersionManagerDialog.activeNodeVersion}
            defaultNodeVersion={controller.nodeVersionManagerDialog.defaultNodeVersion}
            usageByVersion={controller.nodeVersionManagerDialog.usageByVersion}
            installingVersion={controller.nodeVersionManagerDialog.installingVersion}
            deletingVersion={controller.nodeVersionManagerDialog.deletingVersion}
            switchingVersion={controller.nodeVersionManagerDialog.switchingVersion}
            pendingDeleteVersion={controller.nodeVersionManagerDialog.pendingDeleteVersion}
            pendingDeleteProjects={controller.nodeVersionManagerDialog.pendingDeleteProjects}
            onOpenChange={controller.nodeVersionManagerDialog.onOpenChange}
            onInstall={controller.nodeVersionManagerDialog.onInstall}
            onSwitchDefault={controller.nodeVersionManagerDialog.onSwitchDefault}
            onRequestDelete={controller.nodeVersionManagerDialog.onRequestDelete}
            onConfirmDelete={controller.nodeVersionManagerDialog.onConfirmDelete}
            onPendingDeleteOpenChange={controller.nodeVersionManagerDialog.onPendingDeleteOpenChange}
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

        {controller.projectGroupDialog.open ? (
          <ProjectGroupDialog
            open={controller.projectGroupDialog.open}
            draft={controller.projectGroupDialog.draft}
            errorMessage={controller.projectGroupDialog.errorMessage}
            isSubmitting={controller.projectGroupDialog.isSubmitting}
            onOpenChange={controller.projectGroupDialog.onOpenChange}
            onSubmit={(name) => controller.projectGroupDialog.onSubmit(name)}
          />
        ) : null}

        {controller.deleteProjectGroupDialog.group ? (
          <DeleteProjectGroupDialog
            group={controller.deleteProjectGroupDialog.group}
            affectedProjectCount={controller.deleteProjectGroupDialog.affectedProjectCount}
            isDeleting={controller.deleteProjectGroupDialog.isDeleting}
            onConfirm={() => controller.deleteProjectGroupDialog.onConfirm()}
            onOpenChange={controller.deleteProjectGroupDialog.onOpenChange}
          />
        ) : null}

        {controller.assignProjectsToGroupDialog.open ? (
          <AssignProjectsToGroupDialog
            open={controller.assignProjectsToGroupDialog.open}
            targetGroupName={controller.assignProjectsToGroupDialog.targetGroupName}
            sections={controller.assignProjectsToGroupDialog.sections}
            isSubmitting={controller.assignProjectsToGroupDialog.isSubmitting}
            onOpenChange={controller.assignProjectsToGroupDialog.onOpenChange}
            onSubmit={(projectIds) =>
              void controller.assignProjectsToGroupDialog.onSubmit(projectIds)
            }
          />
        ) : null}

        {controller.confirmProjectGroupReassignDialog.open ? (
          <ConfirmProjectGroupReassignDialog
            open={controller.confirmProjectGroupReassignDialog.open}
            targetGroupName={controller.confirmProjectGroupReassignDialog.targetGroupName}
            projectNames={controller.confirmProjectGroupReassignDialog.projectNames}
            isSubmitting={controller.confirmProjectGroupReassignDialog.isSubmitting}
            onConfirm={() => controller.confirmProjectGroupReassignDialog.onConfirm()}
            onOpenChange={controller.confirmProjectGroupReassignDialog.onOpenChange}
          />
        ) : null}

        {controller.moveProjectGroupDialog.open ? (
          <MoveProjectGroupDialog
            open={controller.moveProjectGroupDialog.open}
            projectName={controller.moveProjectGroupDialog.projectName}
            currentGroupId={controller.moveProjectGroupDialog.currentGroupId}
            projectGroups={controller.moveProjectGroupDialog.projectGroups}
            isSubmitting={controller.moveProjectGroupDialog.isSubmitting}
            onOpenChange={controller.moveProjectGroupDialog.onOpenChange}
            onSubmit={(groupId) => void controller.moveProjectGroupDialog.onSubmit(groupId)}
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
