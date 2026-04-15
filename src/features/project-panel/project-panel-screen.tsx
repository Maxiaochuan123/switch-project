import { lazy, Suspense, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Pencil, Plus, Settings, Settings2, Trash2, Upload } from "lucide-react";
import { AssignProjectsToGroupDialog } from "@/components/assign-projects-to-group-dialog";
import { ConfirmProjectGroupReassignDialog } from "@/components/confirm-project-group-reassign-dialog";
import { DeleteProjectGroupDialog } from "@/components/delete-project-group-dialog";
import { DropzoneField } from "@/components/dropzone-field";
import { MoveProjectGroupDialog } from "@/components/move-project-group-dialog";
import { NodeVersionSyncCard } from "@/components/node-version-sync-card";
import { ProjectCard } from "@/components/project-card";
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
  const selectedManagedGroup = controller.page.selectedManagedGroup;
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);

  return (
    <TooltipProvider>
      <ProjectGlobalDropzone onPathSelected={controller.projectFormDialog.onPathSelected} />
      <div className="min-h-screen px-4 py-3 text-foreground">
        <div className="flex min-h-[calc(100vh-1.5rem)] w-full flex-col">
          <header className="flex items-start justify-between gap-4">
            <ScrollArea
              className="min-w-0 flex-1"
              scrollbarOrientation="horizontal"
            >
              <div className="flex min-w-max items-center gap-2 pb-3">
                {controller.page.groupTabs.map((tab) => {
                  const isActive = controller.page.activeGroupTab === tab.key;
                  const isManagedActive = selectedManagedGroup?.id === tab.key;

                  return (
                    <motion.button
                      key={tab.key}
                      type="button"
                      layout
                      transition={{ layout: { type: "spring", stiffness: 340, damping: 30 } }}
                      className={`flex h-9 items-center gap-2 rounded-xl border px-3 text-sm transition-colors ${
                        isActive
                          ? "border-primary/30 bg-primary text-black"
                          : "border-border/25 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                      }`}
                      onClick={() => controller.page.setActiveGroupTab(tab.key)}
                    >
                      <span className="whitespace-nowrap">{tab.name}</span>
                      <span className="text-[11px] opacity-75">{tab.count}</span>
                      <AnimatePresence initial={false}>
                        {isManagedActive ? (
                          <motion.span
                            key="group-actions"
                            layout
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: "auto", opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                            className="ml-1 flex items-center gap-1 overflow-hidden border-l border-black/15 pl-2 text-black"
                          >
                            <button
                              type="button"
                              className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] hover:bg-black/10"
                              onClick={(event) => {
                                event.stopPropagation();
                                void controller.page.runLockedAction(
                                  `assign-projects:${selectedManagedGroup.id}`,
                                  controller.page.handleOpenAssignProjectsDialog,
                                  400
                                );
                              }}
                              disabled={controller.page.isActionLocked(
                                `assign-projects:${selectedManagedGroup.id}`
                              )}
                            >
                              <Plus className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              className="inline-flex size-6 items-center justify-center rounded-md hover:bg-black/10"
                              onClick={(event) => {
                                event.stopPropagation();
                                controller.page.handleRenameActiveGroup();
                              }}
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              className="inline-flex size-6 items-center justify-center rounded-md hover:bg-black/10"
                              onClick={(event) => {
                                event.stopPropagation();
                                controller.page.handleDeleteActiveGroup();
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </motion.span>
                        ) : null}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
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
              ) : !controller.page.isLoading ? (
                <motion.div
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3 p-1.5"
                >
                  {controller.page.visibleProjectCards.length > 0 ? (
                    <div className="grid items-start grid-cols-[repeat(auto-fit,minmax(320px,390px))] gap-6">
                      {controller.page.visibleProjectCards.map((card) => (
                        <motion.div
                          key={card.key}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{
                            type: "spring",
                            stiffness: 260,
                            damping: 20,
                          }}
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
                            isMoveGroupLocked={card.isMoveGroupLocked}
                            groupBadgeLabel={card.groupBadgeLabel}
                            availableGroups={card.availableGroups}
                            onEdit={card.onEdit}
                            onDelete={card.onDelete}
                            onDeleteNodeModules={card.onDeleteNodeModules}
                            onReinstallNodeModules={card.onReinstallNodeModules}
                            onOpenTerminalOutput={card.onOpenTerminalOutput}
                            onStart={card.onStart}
                            onStop={card.onStop}
                            onOpenDirectory={card.onOpenDirectory}
                            onOpenUrl={card.onOpenUrl}
                            onOpenMoveGroupDialog={card.onOpenMoveGroupDialog}
                          />
                        </motion.div>
                      ))}
                    </div>
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
          <DrawerBody className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                void controller.page.handleImportProjects();
              }}
              disabled={controller.page.isActionLocked("import-projects")}
            >
              <Upload className="size-4" />
              恢复备份
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                void controller.page.handleExportProjects();
              }}
              disabled={controller.page.isActionLocked("export-projects")}
            >
              <Download className="size-4" />
              创建备份
            </Button>
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
