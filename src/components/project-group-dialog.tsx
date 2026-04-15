import { useEffect, useState } from "react";
import { Folders } from "lucide-react";
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
import type { ProjectGroupDraft } from "@/features/project-panel/use-project-dialog-state";

type ProjectGroupDialogProps = {
  open: boolean;
  draft: ProjectGroupDraft | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
};

export function ProjectGroupDialog({
  open,
  draft,
  isSubmitting,
  errorMessage,
  onOpenChange,
  onSubmit,
}: ProjectGroupDialogProps) {
  const [name, setName] = useState("");
  const isEditing = Boolean(draft?.id);

  useEffect(() => {
    setName(draft?.name ?? "");
  }, [draft]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md border-border/50 bg-black/60 p-6 backdrop-blur-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Folders className="size-5 text-primary" />
            {isEditing ? "重命名分组" : "新建分组"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "修改分组名称后，组内项目会保持不变。"
              : "新建一个分组，方便把项目按业务或工作流整理起来。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input
            autoFocus={false}
            placeholder="例如：CRM、Admin、实验项目"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSubmitting}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit(name);
              }
            }}
          />
          {errorMessage ? (
            <p className="text-xs text-rose-300">{errorMessage}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              分组名称全局唯一，系统保留“未分组”。
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={() => onSubmit(name)} disabled={isSubmitting}>
            {isSubmitting ? "保存中..." : isEditing ? "保存名称" : "创建分组"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
