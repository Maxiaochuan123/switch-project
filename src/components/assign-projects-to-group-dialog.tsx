import { useEffect, useMemo, useState } from "react";
import { Check, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

type GroupedProjectOption = {
  id: string;
  name: string;
  isCurrentGroup: boolean;
};

type GroupedProjectSection = {
  key: string;
  name: string;
  projects: GroupedProjectOption[];
};

type AssignProjectsToGroupDialogProps = {
  open: boolean;
  targetGroupName: string;
  sections: GroupedProjectSection[];
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (projectIds: string[]) => void;
};

export function AssignProjectsToGroupDialog({
  open,
  targetGroupName,
  sections,
  isSubmitting,
  onOpenChange,
  onSubmit,
}: AssignProjectsToGroupDialogProps) {
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  const selectableProjectIds = useMemo(
    () =>
      sections.flatMap((section) =>
        section.projects.filter((project) => !project.isCurrentGroup).map((project) => project.id)
      ),
    [sections]
  );

  useEffect(() => {
    if (!open) {
      setSelectedProjectIds([]);
    }
  }, [open]);

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid max-h-[80vh] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-border/50 bg-black/60 p-0 backdrop-blur-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b border-border/30 px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FolderPlus className="size-5 text-primary" />
            快捷添加项目
          </DialogTitle>
          <DialogDescription>
            把已有项目批量加入“{targetGroupName}”。未分组会排在最前面，其他分组按当前顺序展示。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 px-6 py-5">
          <div className="space-y-5">
            {sections.map((section) => (
              <section key={section.key} className="space-y-3">
                <div className="text-sm font-medium text-foreground">{section.name}</div>
                {section.projects.length > 0 ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {section.projects.map((project) => {
                      const isSelected =
                        project.isCurrentGroup || selectedProjectIds.includes(project.id);

                      return (
                        <button
                          key={project.id}
                          type="button"
                          className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                            project.isCurrentGroup
                              ? "cursor-default border-primary/20 bg-primary/10 text-primary"
                              : isSelected
                                ? "border-primary/30 bg-primary/12 text-foreground"
                                : "border-border/30 bg-black/10 text-foreground hover:border-primary/20 hover:bg-white/5"
                          }`}
                          onClick={() => {
                            if (!project.isCurrentGroup) {
                              toggleProject(project.id);
                            }
                          }}
                          disabled={project.isCurrentGroup}
                        >
                          <span
                            className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                              isSelected
                                ? "border-primary bg-primary text-black"
                                : "border-muted-foreground/40"
                            }`}
                          >
                            {isSelected ? <Check className="size-3" /> : null}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{project.name}</div>
                            {project.isCurrentGroup ? (
                              <div className="text-xs text-primary/80">已在当前分组</div>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/30 bg-black/10 px-4 py-6 text-sm text-muted-foreground">
                    这个分组下没有项目。
                  </div>
                )}
              </section>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border/30 px-6 py-4">
          <div className="mr-auto text-xs text-muted-foreground">
            已选 {selectedProjectIds.length} / {selectableProjectIds.length} 个项目
          </div>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            onClick={() => onSubmit(selectedProjectIds)}
            disabled={isSubmitting || selectedProjectIds.length === 0}
          >
            {isSubmitting ? "保存中..." : "加入当前分组"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
