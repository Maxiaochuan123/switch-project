import type { Dispatch, SetStateAction } from "react";
import { FolderOpen, FolderOpenDot, TerminalSquare } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

export type ProjectDraft = {
  id?: string;
  name: string;
  path: string;
  nodeVersion: string;
  startCommand: string;
};

type ProjectFormDialogProps = {
  open: boolean;
  draft: ProjectDraft;
  errorMessage: string | null;
  installedNodeVersions: string[];
  isSubmitting: boolean;
  isBrowsingPath: boolean;
  nodeVersionInstalled: boolean;
  onDraftChange: Dispatch<SetStateAction<ProjectDraft>>;
  onBrowsePath: () => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
};

export function ProjectFormDialog({
  open,
  draft,
  errorMessage,
  installedNodeVersions,
  isSubmitting,
  isBrowsingPath,
  nodeVersionInstalled,
  onDraftChange,
  onBrowsePath,
  onOpenChange,
  onSubmit,
}: ProjectFormDialogProps) {
  const title = draft.id ? "编辑项目" : "新增项目";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-white/10 bg-[#0d1426]/95 p-0 backdrop-blur-xl">
        <div className="rounded-[22px] border border-white/6 bg-[radial-gradient(circle_at_top_right,rgba(62,207,196,0.12),transparent_34%),rgba(0,0,0,0.14)] p-6">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-2xl font-semibold tracking-tight">
              {title}
            </DialogTitle>
            <DialogDescription>
              设置项目路径、所需的 Node 版本，以及在该目录下执行的启动命令。
            </DialogDescription>
          </DialogHeader>

          <form
            className="mt-6 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="project-name">项目名称</Label>
                <Input
                  id="project-name"
                  value={draft.name}
                  placeholder="admin-front"
                  onChange={(event) =>
                    onDraftChange((currentDraft) => ({
                      ...currentDraft,
                      name: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="node-version">Node 版本</Label>
                <Input
                  id="node-version"
                  value={draft.nodeVersion}
                  placeholder="20.11.1"
                  onChange={(event) =>
                    onDraftChange((currentDraft) => ({
                      ...currentDraft,
                      nodeVersion: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-path">项目路径</Label>
              <div className="flex gap-2">
                <Input
                  id="project-path"
                  value={draft.path}
                  placeholder="C:\\Users\\admin\\Desktop\\my-project"
                  onChange={(event) =>
                    onDraftChange((currentDraft) => ({
                      ...currentDraft,
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
                  {isBrowsingPath ? "打开中" : "浏览"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="start-command">启动命令</Label>
              <Input
                id="start-command"
                value={draft.startCommand}
                placeholder="pnpm dev"
                onChange={(event) =>
                  onDraftChange((currentDraft) => ({
                    ...currentDraft,
                    startCommand: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/8 bg-black/10 p-4 text-sm text-muted-foreground">
                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-foreground/80">
                  <FolderOpenDot className="size-4 text-primary" />
                  路径规则
                </div>
                请填写真实存在的项目目录。保存时会校验，路径不存在会导致启动失败。
              </div>

              <div className="rounded-2xl border border-white/8 bg-black/10 p-4 text-sm text-muted-foreground">
                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-foreground/80">
                  <TerminalSquare className="size-4 text-primary" />
                  命令规则
                </div>
                请填写你平时在终端里执行的完整命令，例如 `npm run dev`、`pnpm dev`
                或 `turbo dev`。
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-white/8 bg-black/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.18em] text-foreground/80">
                  本机已安装的 Node 版本
                </div>
                {draft.nodeVersion ? (
                  <Badge
                    variant="outline"
                    className={
                      nodeVersionInstalled
                        ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                        : "border-amber-400/20 bg-amber-400/10 text-amber-100"
                    }
                  >
                    {nodeVersionInstalled ? "本机已安装" : "本机缺失"}
                  </Badge>
                ) : null}
              </div>

              {installedNodeVersions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {installedNodeVersions.map((nodeVersion) => (
                    <Button
                      key={nodeVersion}
                      type="button"
                      variant={draft.nodeVersion === nodeVersion ? "default" : "outline"}
                      size="xs"
                      onClick={() =>
                        onDraftChange((currentDraft) => ({
                          ...currentDraft,
                          nodeVersion,
                        }))
                      }
                    >
                      v{nodeVersion}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  没有检测到 `nvm-windows` 已安装的 Node 版本。
                </p>
              )}

              {!nodeVersionInstalled && draft.nodeVersion ? (
                <Alert className="border-white/8 bg-black/10">
                  <AlertTitle>版本未安装</AlertTitle>
                  <AlertDescription>
                    请先在这台机器上安装 `v{draft.nodeVersion}`，再启动项目。
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>

            {errorMessage ? (
              <Alert variant="destructive" className="border-white/8 bg-black/10">
                <AlertTitle>保存失败</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "保存中" : "保存项目"}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
