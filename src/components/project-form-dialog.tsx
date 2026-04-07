import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { CircleAlert, FolderOpen, Package, X } from "lucide-react";
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
import type { ProjectDirectoryInspection } from "@/shared/contracts";

export type ProjectDraft = {
  id?: string;
  name: string;
  path: string;
  nodeVersion: string;
  startCommand: string;
  autoStartOnAppLaunch: boolean;
  autoOpenLocalUrlOnStart: boolean;
};

type ProjectFormDialogProps = {
  open: boolean;
  draft: ProjectDraft;
  errorMessage: string | null;
  installedNodeVersions: string[];
  isSubmitting: boolean;
  isBrowsingPath: boolean;
  nodeVersionInstalled: boolean;
  pathInspection: ProjectDirectoryInspection | null;
  onDraftChange: Dispatch<SetStateAction<ProjectDraft>>;
  onBrowsePath: () => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
};

type SettingSwitchRowProps = {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

function FieldHeader({ label, htmlFor }: { label: string; htmlFor?: string }) {
  return <Label htmlFor={htmlFor}>{label}</Label>;
}

function SettingSwitchRow({
  title,
  description,
  checked,
  onCheckedChange,
}: SettingSwitchRowProps) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/10 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-foreground">{title}</div>
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
  errorMessage,
  installedNodeVersions,
  isSubmitting,
  isBrowsingPath,
  nodeVersionInstalled,
  pathInspection,
  onDraftChange,
  onBrowsePath,
  onOpenChange,
  onSubmit,
}: ProjectFormDialogProps) {
  const [visibleErrorMessage, setVisibleErrorMessage] = useState<string | null>(null);
  const trimmedPath = draft.path.trim();
  const trimmedNodeVersion = draft.nodeVersion.trim();
  const title = draft.id ? "编辑项目" : "新增项目";

  useEffect(() => {
    if (!open) {
      setVisibleErrorMessage(null);
      return;
    }

    if (!errorMessage) {
      setVisibleErrorMessage(null);
      return;
    }

    setVisibleErrorMessage(errorMessage);

    const timer = window.setTimeout(() => {
      setVisibleErrorMessage((current) => (current === errorMessage ? null : current));
    }, 3200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [errorMessage, open]);

  return (
    <>
      {visibleErrorMessage ? (
        <div className="pointer-events-none fixed top-5 right-5 z-[90] w-full max-w-sm px-4 sm:px-0">
          <div className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-rose-400/20 bg-[#181120]/96 px-4 py-3 text-rose-50 shadow-2xl shadow-black/45 backdrop-blur-xl">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-300" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">保存失败</div>
              <div className="mt-1 text-sm leading-6 text-rose-100/90">
                {visibleErrorMessage}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="-mr-1 text-rose-100 hover:bg-white/10 hover:text-white"
              onClick={() => setVisibleErrorMessage(null)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[88vh] max-w-xl overflow-hidden border-0 bg-transparent p-0 shadow-none">
          <div className="flex max-h-[88vh] flex-col rounded-[24px] border border-white/10 bg-[#0d1426]/95 backdrop-blur-xl">
            <DialogHeader className="shrink-0 px-6 pt-6">
              <DialogTitle className="text-2xl font-semibold tracking-tight">{title}</DialogTitle>
              <DialogDescription>
                先选择项目目录，系统会自动带出项目名称和启动命令，Node 版本由你手动选择。
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="min-h-0 flex-1 px-6">
              <form
                className="space-y-5 pb-6 pt-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmit();
                }}
              >
                <section className="space-y-4 rounded-2xl border border-white/8 bg-black/10 p-4">
                  <div className="text-sm font-medium text-foreground">基础信息</div>

                  <div className="space-y-2">
                    <FieldHeader htmlFor="project-path" label="项目目录" />
                    <div className="flex gap-2">
                      <Input
                        id="project-path"
                        value={draft.path}
                        placeholder="C:\\Users\\admin\\Desktop\\my-project"
                        onChange={(event) =>
                          onDraftChange((current) => ({
                            ...current,
                            path: event.target.value,
                          }))
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        onClick={onBrowsePath}
                        disabled={isBrowsingPath}
                      >
                        <FolderOpen className="size-4" />
                        {isBrowsingPath ? "选择中..." : "浏览"}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <FieldHeader htmlFor="project-name" label="项目名称" />
                    <Input
                      id="project-name"
                      value={draft.name}
                      placeholder="例如：admin-front"
                      onChange={(event) =>
                        onDraftChange((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>

                  {trimmedPath &&
                  pathInspection?.exists &&
                  pathInspection.isDirectory &&
                  !pathInspection.hasPackageJson ? (
                    <Alert className="border-amber-400/20 bg-amber-400/10 text-amber-50">
                      <Package className="size-4" />
                      <AlertTitle>当前目录里没有 package.json</AlertTitle>
                      <AlertDescription>
                        可以继续保存，但这通常说明你选中的不是项目根目录。
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </section>

                <section className="space-y-4 rounded-2xl border border-white/8 bg-black/10 p-4">
                  <div className="text-sm font-medium text-foreground">启动配置</div>

                  <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
                    <div className="space-y-2">
                      <FieldHeader label="Node 版本" />
                      <Select
                        value={draft.nodeVersion || undefined}
                        onValueChange={(value) =>
                          onDraftChange((current) => ({
                            ...current,
                            nodeVersion: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="请选择 Node 版本" />
                        </SelectTrigger>
                        <SelectContent>
                          {installedNodeVersions.map((version) => (
                            <SelectItem key={version} value={version}>
                              v{version}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <FieldHeader htmlFor="start-command" label="启动命令" />
                      <Input
                        id="start-command"
                        value={draft.startCommand}
                        placeholder="例如：npm run dev"
                        onChange={(event) =>
                          onDraftChange((current) => ({
                            ...current,
                            startCommand: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  {!nodeVersionInstalled && trimmedNodeVersion ? (
                    <Alert className="border-amber-400/20 bg-amber-400/10 text-amber-50">
                      <AlertTitle>这个 Node 版本还没安装</AlertTitle>
                      <AlertDescription>
                        先执行 {`nvm install ${trimmedNodeVersion}`}，安装完成后就能直接启动。
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </section>

                <section className="space-y-4 rounded-2xl border border-white/8 bg-black/10 p-4">
                  <div className="text-sm font-medium text-foreground">启动行为</div>
                  <div className="space-y-3">
                    <SettingSwitchRow
                      title="软件启动后自动启动项目"
                      description="每次打开这个面板时，这个项目都会自动跟着启动。"
                      checked={draft.autoStartOnAppLaunch}
                      onCheckedChange={(checked) =>
                        onDraftChange((current) => ({
                          ...current,
                          autoStartOnAppLaunch: checked,
                        }))
                      }
                    />
                    <SettingSwitchRow
                      title="项目启动后自动打开本地地址"
                      description="识别到 localhost 地址后，会自动在浏览器里打开一次。"
                      checked={draft.autoOpenLocalUrlOnStart}
                      onCheckedChange={(checked) =>
                        onDraftChange((current) => ({
                          ...current,
                          autoOpenLocalUrlOnStart: checked,
                        }))
                      }
                    />
                  </div>
                </section>
              </form>
            </ScrollArea>

            <DialogFooter className="shrink-0 border-t border-white/8 px-6 py-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="button" onClick={onSubmit} disabled={isSubmitting}>
                {isSubmitting ? "保存中..." : "保存项目"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
