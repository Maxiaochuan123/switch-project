import { useEffect, useMemo, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { AlertTriangle, FolderOpen, Info, LoaderCircle } from "lucide-react";
import { DropzoneField } from "@/components/dropzone-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  getSuggestedPackageManager,
  getSuggestedStartCommand,
  hasInstalledNodeVersion,
  selectBestAvailableNodeVersion,
  shouldApplySuggestedValue,
  type ProjectDraft,
} from "@/features/project-panel/project-draft";
import {
  getPackageManagerLabel,
  normalizeNodeVersion,
  type ProjectDirectoryInspection,
  type ProjectPackageManager,
} from "@/shared/contracts";

const projectDraftSchema = z.object({
  name: z.string().trim().min(1, "请输入项目名称"),
  path: z.string().trim().min(1, "请选择项目目录"),
  nodeVersion: z.string().trim().min(1, "请选择 Node 版本"),
  packageManager: z.string().trim().min(1, "请选择包管理器"),
  startCommand: z.string().trim().min(1, "请输入启动命令"),
  autoStartOnAppLaunch: z.boolean(),
  autoOpenLocalUrlOnStart: z.boolean(),
});

type ProjectDraftFormValues = z.infer<typeof projectDraftSchema>;

type ProjectFormDialogProps = {
  open: boolean;
  draft: ProjectDraft;
  submitErrorMessage: string | null;
  installedNodeVersions: string[];
  activeNodeVersion: string | null;
  installedPackageManagers: ProjectPackageManager[];
  isSubmitting: boolean;
  isInspectingProject: boolean;
  inspectionNotice: "idle" | "success" | "error";
  dropzoneError: string;
  pathInspection: ProjectDirectoryInspection | null;
  isInstallingNodeVersion: boolean;
  onPackageManagerChange: (packageManager: ProjectPackageManager) => void;
  onInstallNodeVersion: (version: string) => void;
  onBrowsePath: () => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: ProjectDraft) => void;
};

function FieldLabel({
  htmlFor,
  label,
  required,
}: {
  htmlFor?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
      {label}
      {required ? <span className="ml-1 text-rose-300">*</span> : null}
    </Label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-rose-300">{message}</p>;
}

function SettingsRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="rounded-lg border border-border/30 bg-black/10 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">{title}</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  );
}

export function ProjectFormDialog({
  open,
  draft,
  submitErrorMessage,
  installedNodeVersions,
  activeNodeVersion,
  installedPackageManagers,
  isSubmitting,
  isInspectingProject,
  inspectionNotice,
  dropzoneError,
  pathInspection,
  isInstallingNodeVersion,
  onPackageManagerChange,
  onInstallNodeVersion,
  onBrowsePath,
  onOpenChange,
  onSubmit,
}: ProjectFormDialogProps) {
  const isEditing = Boolean(draft.id);
  const formId = draft.id ? "edit-project-form" : "create-project-form";
  const lastSuggestedRef = useRef({
    packageManager: "",
    startCommand: "",
  });

  const form = useForm<ProjectDraftFormValues>({
    resolver: zodResolver(projectDraftSchema),
    defaultValues: {
      name: draft.name,
      path: draft.path,
      nodeVersion: draft.nodeVersion,
      packageManager: draft.packageManager,
      startCommand: draft.startCommand,
      autoStartOnAppLaunch: draft.autoStartOnAppLaunch,
      autoOpenLocalUrlOnStart: draft.autoOpenLocalUrlOnStart,
    },
  });

  useEffect(() => {
    form.reset({
      name: draft.name,
      path: draft.path,
      nodeVersion: draft.nodeVersion,
      packageManager: draft.packageManager,
      startCommand: draft.startCommand,
      autoStartOnAppLaunch: draft.autoStartOnAppLaunch,
      autoOpenLocalUrlOnStart: draft.autoOpenLocalUrlOnStart,
    });
    lastSuggestedRef.current = {
      packageManager: "",
      startCommand: "",
    };
  }, [draft, form]);

  const watchedPath = form.watch("path");
  const watchedNodeVersion = form.watch("nodeVersion");
  const watchedPackageManager = form.watch("packageManager");
  const suggestedPackageManager = getSuggestedPackageManager(
    pathInspection,
    installedPackageManagers
  );
  const suggestedStartCommand = getSuggestedStartCommand(
    pathInspection,
    (watchedPackageManager || suggestedPackageManager) as ProjectPackageManager | ""
  );

  const autoSelectedNodeVersion = useMemo(
    () =>
      selectBestAvailableNodeVersion(
        pathInspection?.nodeVersionHint ?? pathInspection?.recommendedNodeVersion,
        installedNodeVersions,
        activeNodeVersion
      ),
    [
      activeNodeVersion,
      installedNodeVersions,
      pathInspection?.nodeVersionHint,
      pathInspection?.recommendedNodeVersion,
    ]
  );
  const suggestedNodeVersion = draft.nodeVersion || autoSelectedNodeVersion;

  useEffect(() => {
    if (isInspectingProject) {
      return;
    }

    const currentValue = form.getValues("nodeVersion").trim();
    if (currentValue || !autoSelectedNodeVersion) {
      return;
    }

    form.setValue("nodeVersion", autoSelectedNodeVersion, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: true,
    });
  }, [autoSelectedNodeVersion, form, isInspectingProject]);

  useEffect(() => {
    if (isInspectingProject || draft.id || !pathInspection) {
      return;
    }

    const currentFormValues = form.getValues();

    let shouldResetForm = false;
    const nextFormValues = { ...currentFormValues };

    const currentPackageManager = String(currentFormValues.packageManager ?? "");
    if (
      shouldApplySuggestedValue(
        currentPackageManager,
        lastSuggestedRef.current.packageManager
      ) &&
      currentPackageManager !== suggestedPackageManager
    ) {
      nextFormValues.packageManager = suggestedPackageManager;
      shouldResetForm = true;
    }

    const currentStartCommand = String(currentFormValues.startCommand ?? "");
    if (
      shouldApplySuggestedValue(currentStartCommand, lastSuggestedRef.current.startCommand) &&
      currentStartCommand !== suggestedStartCommand
    ) {
      nextFormValues.startCommand = suggestedStartCommand;
      shouldResetForm = true;
    }

    if (shouldResetForm) {
      form.reset(nextFormValues);
    }

    lastSuggestedRef.current = {
      packageManager: suggestedPackageManager,
      startCommand: suggestedStartCommand,
    };
  }, [
    draft.id,
    form,
    installedPackageManagers,
    isInspectingProject,
    pathInspection,
  ]);

  const selectedNodeVersion = watchedNodeVersion.trim();
  const nodeRequirement =
    pathInspection?.nodeVersionHint?.trim() ||
    pathInspection?.recommendedNodeVersion?.trim() ||
    "";
  const installTargetVersion =
    pathInspection?.recommendedNodeVersion || selectedNodeVersion || "";
  const selectedNodeVersionLabel = selectedNodeVersion || suggestedNodeVersion || "";

  const isInstallTargetMissing =
    Boolean(nodeRequirement || selectedNodeVersionLabel) &&
    !hasInstalledNodeVersion(
      installedNodeVersions,
      selectedNodeVersionLabel || nodeRequirement
    );

  const shouldShowInstallButton =
    Boolean(installTargetVersion) &&
    selectedNodeVersion.length === 0 &&
    isInstallTargetMissing &&
    !isInspectingProject;

  const nodeVersionOptions = useMemo(() => {
    const options = [...installedNodeVersions];

    if (
      watchedNodeVersion &&
      !options.some(
        (version) => normalizeNodeVersion(version) === normalizeNodeVersion(watchedNodeVersion)
      )
    ) {
      options.unshift(watchedNodeVersion);
    }

    return options;
  }, [installedNodeVersions, watchedNodeVersion]);

  const packageManagerOptions = useMemo<{ value: ProjectPackageManager; label: string }[]>(() => {
    const options: { value: ProjectPackageManager; label: string }[] =
      installedPackageManagers.map((packageManager) => ({
        value: packageManager,
        label: getPackageManagerLabel(packageManager),
      }));

    if (
      watchedPackageManager &&
      !options.some((option) => option.value === watchedPackageManager)
    ) {
      options.unshift({
        value: watchedPackageManager as ProjectPackageManager,
        label: `${getPackageManagerLabel(watchedPackageManager as ProjectPackageManager)}（项目检测）`,
      });
    }

    return options;
  }, [installedPackageManagers, watchedPackageManager]);

  const dialogTitle = draft.id ? "编辑项目" : "添加项目";
  const submitLabel = draft.id ? "保存" : "添加";
  const isFormDisabled = isSubmitting || isInspectingProject;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid max-h-[88vh] max-w-xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-border/50 bg-black/60 p-0 backdrop-blur-xl"
        
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b border-border/30 px-6 py-5">
          <DialogTitle className="text-2xl font-semibold tracking-tight">{dialogTitle}</DialogTitle>
          <DialogDescription>
            选择项目根目录后，系统会自动识别项目名称、包管理器、启动命令和推荐 Node 版本。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0">
          <form
            id={formId}
            onSubmit={form.handleSubmit((values) =>
              onSubmit({
                ...values,
                id: draft.id,
              } as ProjectDraft)
            )}
            className="space-y-5 px-6 py-5"
          >
              {submitErrorMessage ? (
                <Alert variant="destructive" className="border-rose-500/20 bg-rose-500/10">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>保存失败</AlertTitle>
                  <AlertDescription>{submitErrorMessage}</AlertDescription>
                </Alert>
              ) : null}

              <section className="space-y-4 rounded-lg border border-border/30 bg-black/10 p-4">
                <div className="text-sm font-medium text-foreground">基础信息</div>

                <div className="space-y-2">
                  <FieldLabel label="项目目录" required />
                  {isEditing ? (
                    <div className="rounded-lg border border-border/30 bg-black/10 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                            <span>当前项目目录</span>
                          </div>
                          <p
                            className="mt-2 break-all text-xs leading-5 text-muted-foreground"
                            title={watchedPath}
                          >
                            {watchedPath}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0"
                          onClick={onBrowsePath}
                          disabled={isFormDisabled}
                        >
                          更换目录
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <DropzoneField
                      selectedPath={watchedPath}
                      isLoading={isInspectingProject}
                      dropzoneError={dropzoneError}
                      onBrowse={onBrowsePath}
                    />
                  )}
                  <input type="hidden" {...form.register("path")} />
                  <FieldError message={form.formState.errors.path?.message} />
                </div>

                {watchedPath && !isInspectingProject ? (
                  <>
                    {inspectionNotice === "success" ? (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                    <Info className="size-3.5 shrink-0" />
                    已为您自动填充配置，请检查是否需要调整。
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <FieldLabel htmlFor="project-name" label="项目名称" required />
                    <Input
                      id="project-name"
                      placeholder="默认取文件夹名称，也可以手动修改"
                      disabled={isFormDisabled}
                      {...form.register("name")}
                    />
                    <FieldError message={form.formState.errors.name?.message} />
                  </div>

                  <div className="space-y-2">
                    <FieldLabel label="包管理器" required />
                    <Controller
                      control={form.control}
                      name="packageManager"
                      defaultValue={draft.packageManager || suggestedPackageManager}
                      render={({ field }) => (
                        <Select
                          value={field.value || suggestedPackageManager || undefined}
                          onValueChange={(value) => {
                            field.onChange(value);
                            onPackageManagerChange(value as ProjectPackageManager);
                          }}
                          disabled={isFormDisabled}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="请选择包管理器" />
                          </SelectTrigger>
                          <SelectContent>
                            {packageManagerOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <FieldError message={form.formState.errors.packageManager?.message} />
                  </div>
                </div>

                {pathInspection && !pathInspection.hasPackageJson && watchedPath.trim() && !isInspectingProject ? (
                  <Alert className="border-amber-500/20 bg-amber-500/10 text-amber-50">
                    <AlertTriangle className="size-4 text-amber-200" />
                    <AlertTitle>当前目录里没有 package.json</AlertTitle>
                    <AlertDescription>
                      可以继续保存，但这通常说明你选中的不是项目根目录。
                    </AlertDescription>
                  </Alert>
                ) : null}
                  </>
                ) : null}
              </section>

              {watchedPath && !isInspectingProject ? (
                <>
                  <section className="space-y-4 rounded-lg border border-border/30 bg-black/10 p-4">
                <div className="text-sm font-medium text-foreground">启动配置</div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <FieldLabel label="Node 版本" required />
                    {shouldShowInstallButton ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => onInstallNodeVersion(installTargetVersion)}
                        disabled={isInstallingNodeVersion || isFormDisabled}
                      >
                        {isInstallingNodeVersion ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : null}
                        {isInstallingNodeVersion
                          ? "安装中..."
                          : `安装 Node v${normalizeNodeVersion(installTargetVersion)}`}
                      </Button>
                    ) : (
                      <Controller
                        control={form.control}
                        name="nodeVersion"
                        defaultValue={suggestedNodeVersion}
                        render={({ field }) => (
                          <Select
                            value={field.value || suggestedNodeVersion || undefined}
                            onValueChange={field.onChange}
                            disabled={isFormDisabled}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="请选择 Node 版本" />
                            </SelectTrigger>
                            <SelectContent>
                              {nodeVersionOptions.map((version) => {
                                const normalizedVersion = normalizeNodeVersion(version);
                                const installed = installedNodeVersions.some(
                                  (item) => normalizeNodeVersion(item) === normalizedVersion
                                );

                                return (
                                  <SelectItem key={version} value={version}>
                                    {installed
                                      ? `v${normalizedVersion}`
                                      : `v${normalizedVersion}（未安装）`}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    )}
                    <FieldError message={form.formState.errors.nodeVersion?.message} />
                    {nodeRequirement ? (
                      <p className="text-xs text-muted-foreground">
                        项目要求: Node {nodeRequirement}
                      </p>
                    ) : null}
                    {selectedNodeVersionLabel ? (
                      <p className="text-xs text-muted-foreground">
                        当前选择: Node v{normalizeNodeVersion(selectedNodeVersionLabel)}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <FieldLabel htmlFor="start-command" label="启动命令" required />
                    <Controller
                      control={form.control}
                      name="startCommand"
                      defaultValue={draft.startCommand || suggestedStartCommand}
                      render={({ field }) => (
                        <Input
                          id="start-command"
                          placeholder="默认从 package.json 读取，也可以手动修改"
                          disabled={isFormDisabled}
                          {...field}
                          value={field.value || suggestedStartCommand}
                        />
                      )}
                    />
                    <FieldError message={form.formState.errors.startCommand?.message} />
                  </div>
                </div>

                {isInstallTargetMissing && !shouldShowInstallButton ? (
                  <Alert className="border-amber-500/20 bg-amber-500/10 text-amber-50">
                    <AlertTriangle className="size-4 text-amber-200" />
                    <AlertTitle>当前缺少所需的 Node 版本</AlertTitle>
                    <AlertDescription>
                      {selectedNodeVersion
                        ? `当前选择的是 Node v${normalizeNodeVersion(watchedNodeVersion)}，本机还没有安装。`
                        : nodeRequirement
                          ? `项目要求 Node ${nodeRequirement}，本机当前没有已安装的可用版本。`
                          : "本机当前没有已安装的可用 Node 版本。"}
                    </AlertDescription>
                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onInstallNodeVersion(installTargetVersion)}
                        disabled={isInstallingNodeVersion}
                      >
                        {isInstallingNodeVersion ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : null}
                        {isInstallingNodeVersion
                          ? "安装中..."
                          : `安装 Node v${normalizeNodeVersion(installTargetVersion)}`}
                      </Button>
                    </div>
                  </Alert>
                ) : null}
              </section>

              <section className="space-y-4 rounded-lg border border-border/30 bg-black/10 p-4">
                <div className="text-sm font-medium text-foreground">启动行为</div>

                <div className="space-y-3">
                  <Controller
                    control={form.control}
                    name="autoStartOnAppLaunch"
                    render={({ field }) => (
                      <SettingsRow
                        title="软件启动后自动启动项目"
                        description="每次打开这个面板时，这个项目都会自动跟着启动。"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />

                  <Controller
                    control={form.control}
                    name="autoOpenLocalUrlOnStart"
                    render={({ field }) => (
                      <SettingsRow
                        title="项目启动后自动打开本地地址"
                        description="识别到 localhost 地址后，会自动在浏览器里打开一次。"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                </div>
              </section>
                </>
              ) : null}
          </form>
        </ScrollArea>

          <DialogFooter className="border-t border-border/30 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" form={formId} disabled={isFormDisabled}>
              {isSubmitting ? "保存中..." : isInspectingProject ? "识别中..." : submitLabel}
            </Button>
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
