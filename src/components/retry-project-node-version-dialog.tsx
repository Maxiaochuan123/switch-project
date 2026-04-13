import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeNodeVersion } from "@/shared/contracts";

type RetryProjectNodeVersionDialogProps = {
  open: boolean;
  projectName: string;
  currentNodeVersion: string;
  suggestedNodeVersion: string;
  availableNodeVersions: string[];
  isProcessing: boolean;
  onConfirm: (nodeVersion: string) => void;
  onOpenChange: (open: boolean) => void;
};

export function RetryProjectNodeVersionDialog({
  open,
  projectName,
  currentNodeVersion,
  suggestedNodeVersion,
  availableNodeVersions,
  isProcessing,
  onConfirm,
  onOpenChange,
}: RetryProjectNodeVersionDialogProps) {
  const normalizedCurrentNodeVersion = normalizeNodeVersion(currentNodeVersion);
  const normalizedSuggestedNodeVersion = normalizeNodeVersion(suggestedNodeVersion);
  const nodeVersionOptions = useMemo(() => {
    const normalizedOptions = availableNodeVersions
      .map((version) => normalizeNodeVersion(version))
      .filter(Boolean);

    if (
      normalizedCurrentNodeVersion &&
      !normalizedOptions.includes(normalizedCurrentNodeVersion)
    ) {
      normalizedOptions.unshift(normalizedCurrentNodeVersion);
    }

    if (
      normalizedSuggestedNodeVersion &&
      !normalizedOptions.includes(normalizedSuggestedNodeVersion)
    ) {
      normalizedOptions.unshift(normalizedSuggestedNodeVersion);
    }

    return [...new Set(normalizedOptions)];
  }, [availableNodeVersions, normalizedCurrentNodeVersion, normalizedSuggestedNodeVersion]);

  const [selectedNodeVersion, setSelectedNodeVersion] = useState(normalizedSuggestedNodeVersion);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedNodeVersion(normalizedSuggestedNodeVersion);
  }, [normalizedSuggestedNodeVersion, open]);

  const isSameFailedVersion =
    normalizeNodeVersion(selectedNodeVersion) === normalizedCurrentNodeVersion;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent 
        className="border-border/50 bg-black/60 backdrop-blur-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogMedia className="border border-amber-500/20 bg-amber-500/10 text-amber-100">
            <AlertTriangle className="size-7" />
          </AlertDialogMedia>
          <AlertDialogTitle>启动失败，是否降级后重试</AlertDialogTitle>
          <AlertDialogDescription>
            {`${projectName} 当前使用 Node v${normalizedCurrentNodeVersion} 启动失败。请选择一个可用的 Node 版本后重试。`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">可用 Node 版本</Label>
          <Select
            value={selectedNodeVersion || undefined}
            onValueChange={setSelectedNodeVersion}
            disabled={isProcessing}
          >
            <SelectTrigger>
              <SelectValue placeholder="请选择 Node 版本" />
            </SelectTrigger>
            <SelectContent>
              {nodeVersionOptions.map((version) => {
                const normalizedVersion = normalizeNodeVersion(version);
                const isFailedVersion = normalizedVersion === normalizedCurrentNodeVersion;
                const isSuggestedVersion = normalizedVersion === normalizedSuggestedNodeVersion;

                return (
                  <SelectItem key={normalizedVersion} value={normalizedVersion}>
                    {`Node v${normalizedVersion}${
                      isFailedVersion
                        ? "（当前失败版本）"
                        : isSuggestedVersion
                          ? "（建议重试）"
                          : ""
                    }`}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {isSameFailedVersion ? (
            <p className="text-xs text-amber-200">当前版本已启动失败，请选择其他 Node 版本。</p>
          ) : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isProcessing}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              if (!selectedNodeVersion || isSameFailedVersion) {
                return;
              }
              onConfirm(selectedNodeVersion);
            }}
            disabled={isProcessing || !selectedNodeVersion || isSameFailedVersion}
          >
            {isProcessing ? "处理中..." : "切换并重试"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
