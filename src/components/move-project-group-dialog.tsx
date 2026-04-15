import { useEffect, useState } from "react";
import { FolderInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectGroup } from "@/shared/contracts";

type MoveProjectGroupDialogProps = {
  open: boolean;
  projectName: string;
  currentGroupId: string | null;
  projectGroups: ProjectGroup[];
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (groupId: string | null) => void;
};

const UNGROUPED_VALUE = "__ungrouped__";

export function MoveProjectGroupDialog({
  open,
  projectName,
  currentGroupId,
  projectGroups,
  isSubmitting,
  onOpenChange,
  onSubmit,
}: MoveProjectGroupDialogProps) {
  const [selectedGroupId, setSelectedGroupId] = useState(UNGROUPED_VALUE);

  useEffect(() => {
    setSelectedGroupId(currentGroupId ?? UNGROUPED_VALUE);
  }, [currentGroupId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md border-border/50 bg-black/60 p-6 backdrop-blur-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FolderInput className="size-5 text-primary" />
            切换分组
          </DialogTitle>
          <DialogDescription>
            {projectName ? `为“${projectName}”选择新的所属分组。` : "选择新的所属分组。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Select
            value={selectedGroupId}
            onValueChange={setSelectedGroupId}
            disabled={isSubmitting}
          >
            <SelectTrigger>
              <SelectValue placeholder="请选择分组" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNGROUPED_VALUE}>未分组</SelectItem>
              {projectGroups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            onClick={() =>
              onSubmit(selectedGroupId === UNGROUPED_VALUE ? null : selectedGroupId)
            }
            disabled={isSubmitting}
          >
            {isSubmitting ? "保存中..." : "保存分组"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
