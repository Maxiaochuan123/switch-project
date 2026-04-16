import { LoaderCircle, ShieldAlert, Trash2, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { normalizeNodeVersion, type NodeVersionUsageProject } from "@/shared/contracts";

type NodeVersionManagerDialogProps = {
  open: boolean;
  isLoading: boolean;
  installedVersions: string[];
  latestLtsVersions: string[];
  latestLtsError?: string | null;
  activeNodeVersion?: string | null;
  defaultNodeVersion?: string | null;
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

function VersionMeta({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-lg font-semibold text-foreground">
        {value ? `v${normalizeNodeVersion(value)}` : "未检测到"}
      </div>
    </div>
  );
}

export function NodeVersionManagerDialog({
  open,
  isLoading,
  installedVersions,
  latestLtsVersions,
  latestLtsError,
  activeNodeVersion,
  defaultNodeVersion,
  usageByVersion,
  installingVersion,
  deletingVersion,
  switchingVersion,
  pendingDeleteVersion,
  pendingDeleteProjects,
  onOpenChange,
  onInstall,
  onSwitchDefault,
  onRequestDelete,
  onConfirmDelete,
  onPendingDeleteOpenChange,
}: NodeVersionManagerDialogProps) {
  const normalizedDefaultVersion = defaultNodeVersion ? normalizeNodeVersion(defaultNodeVersion) : null;
  const normalizedActiveVersion = activeNodeVersion ? normalizeNodeVersion(activeNodeVersion) : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[88vh] overflow-hidden rounded-xl border-border/50 bg-black/70 p-0 backdrop-blur-xl sm:max-w-4xl"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="flex min-h-0 w-full flex-col">
            <DialogHeader className="shrink-0 border-b border-border/30 px-5 py-4">
              <DialogTitle className="text-2xl font-semibold tracking-tight">
                Node 版本管理
              </DialogTitle>
              <DialogDescription>
                这里管理 fnm 已安装的 Node 版本、默认版本，以及可安装的最新 LTS 版本。新建项目时，会优先使用这里设置的默认 Node。
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-auto px-5 py-4">
              <div className="grid gap-3">
                <VersionMeta label="新项目默认 Node" value={defaultNodeVersion} />
              </div>

              {isLoading ? (
                <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-border/40 bg-black/20">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" />
                    正在读取 Node 版本信息...
                  </div>
                </div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                  <section className="space-y-3 rounded-xl border border-border/40 bg-black/20 p-4">
                    <div className="space-y-1">
                      <div className="text-base font-semibold text-foreground">已安装版本</div>
                      <div className="text-sm text-muted-foreground">
                        设为默认后，面板后续会优先使用这个 fnm 版本。
                      </div>
                    </div>

                    {installedVersions.length > 0 ? (
                      <div className="space-y-3">
                        {installedVersions.map((version) => {
                          const normalizedVersion = normalizeNodeVersion(version);
                          const usageProjects = usageByVersion[normalizedVersion] ?? [];
                          const isDefault = normalizedDefaultVersion === normalizedVersion;
                          const isActive = normalizedActiveVersion === normalizedVersion;
                          const isDeleting = deletingVersion === normalizedVersion;
                          const isSwitching = switchingVersion === normalizedVersion;

                          return (
                            <div
                              key={normalizedVersion}
                              className="rounded-lg border border-border/40 bg-black/30 p-3"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="font-mono text-sm font-medium text-foreground">
                                      v{normalizedVersion}
                                    </div>
                                    {isDefault ? <Badge>默认</Badge> : null}
                                    {isActive ? (
                                      <Badge variant="outline" className="border-primary/40 text-primary">
                                        当前
                                      </Badge>
                                    ) : null}
                                    {usageProjects.length > 0 ? (
                                      <Badge variant="outline">
                                        {usageProjects.length} 个项目使用
                                      </Badge>
                                    ) : null}
                                  </div>
                                  {usageProjects.length > 0 ? (
                                    <div className="text-xs leading-5 text-muted-foreground">
                                      {usageProjects.map((project) => project.projectName).join("、")}
                                    </div>
                                  ) : null}
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                  <Button
                                    type="button"
                                    variant={isDefault ? "secondary" : "outline"}
                                    size="sm"
                                    onClick={() => onSwitchDefault(normalizedVersion)}
                                    disabled={
                                      isDefault ||
                                      Boolean(switchingVersion) ||
                                      Boolean(deletingVersion)
                                    }
                                  >
                                    {isSwitching ? (
                                      <LoaderCircle className="size-4 animate-spin" />
                                    ) : null}
                                    {isDefault ? "默认中" : isSwitching ? "切换中..." : "设为默认"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onRequestDelete(normalizedVersion)}
                                    disabled={
                                      Boolean(deletingVersion) ||
                                      Boolean(switchingVersion)
                                    }
                                  >
                                    {isDeleting ? (
                                      <LoaderCircle className="size-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="size-4" />
                                    )}
                                    {isDeleting ? "删除中..." : "删除"}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border/40 bg-black/10 px-4 py-8 text-sm text-muted-foreground">
                        当前还没有检测到已安装的 fnm Node 版本。
                      </div>
                    )}
                  </section>

                  <section className="space-y-3 rounded-xl border border-border/40 bg-black/20 p-4">
                    <div className="space-y-1">
                      <div className="text-base font-semibold text-foreground">安装最新 LTS</div>
                      <div className="text-sm text-muted-foreground">
                        从 Node 官方发布源读取最新的长期支持版本。
                      </div>
                    </div>

                    {latestLtsError ? (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100/85">
                        {latestLtsError}
                      </div>
                    ) : null}

                    {latestLtsVersions.length > 0 ? (
                      <div className="space-y-2">
                        {latestLtsVersions.map((version) => {
                          const normalizedVersion = normalizeNodeVersion(version);
                          const installed = installedVersions.some(
                            (current) => normalizeNodeVersion(current) === normalizedVersion
                          );
                          const isInstalling = installingVersion === normalizedVersion;

                          return (
                            <div
                              key={normalizedVersion}
                              className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-black/30 px-3 py-2"
                            >
                              <div className="font-mono text-sm text-foreground">
                                v{normalizedVersion}
                              </div>
                              <Button
                                type="button"
                                variant={installed ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => onInstall(normalizedVersion)}
                                disabled={installed || Boolean(installingVersion)}
                              >
                                {isInstalling ? (
                                  <LoaderCircle className="size-4 animate-spin" />
                                ) : installed ? (
                                  <Wrench className="size-4" />
                                ) : null}
                                {installed ? "已安装" : isInstalling ? "安装中..." : "安装"}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : !latestLtsError ? (
                      <div className="rounded-lg border border-dashed border-border/40 bg-black/10 px-4 py-8 text-sm text-muted-foreground">
                        当前还没有可展示的 LTS 版本列表。
                      </div>
                    ) : null}
                  </section>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingDeleteVersion)}
        onOpenChange={onPendingDeleteOpenChange}
      >
        <AlertDialogContent className="border-border/50 bg-black/60 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogMedia className="border border-amber-500/20 bg-amber-500/10 text-amber-100">
              <ShieldAlert className="size-7" />
            </AlertDialogMedia>
            <AlertDialogTitle>确认删除 Node v{pendingDeleteVersion}</AlertDialogTitle>
            <AlertDialogDescription>
              以下项目配置仍在使用这个 Node 版本。删除后，这些项目下次启动可能失败。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 rounded-xl border border-border/40 bg-black/30 p-4">
            {pendingDeleteProjects.map((project) => (
              <div key={project.projectId} className="text-sm text-foreground">
                {project.projectName}
              </div>
            ))}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingVersion)}>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={Boolean(deletingVersion)}
              onClick={onConfirmDelete}
            >
              {deletingVersion ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {deletingVersion ? "删除中..." : "继续删除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
