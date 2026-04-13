import { useCallback, useMemo } from "react";
import { FolderOpen, Loader2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

type DropzoneFieldProps = {
  selectedPath: string;
  isLoading: boolean;
  dropzoneError?: string;
  onBrowse: () => void;
};

export function DropzoneField({
  selectedPath,
  isLoading,
  dropzoneError,
  onBrowse,
}: DropzoneFieldProps) {
  const handleClick = useCallback(() => {
    if (!isLoading) {
      onBrowse();
    }
  }, [isLoading, onBrowse]);

  const hasError = Boolean(dropzoneError);
  const icon = useMemo(() => {
    if (isLoading) {
      return <Loader2 className="size-10 animate-spin text-primary" />;
    }

    return <UploadCloud className="size-10 text-primary" />;
  }, [isLoading]);

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleClick();
          }
        }}
        className={cn(
          "flex min-h-40 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          "border-border/50 bg-black/10 hover:border-border hover:bg-white/5",
          hasError && "border-rose-400/50 bg-rose-500/10",
          isLoading && "cursor-wait opacity-85"
        )}
      >
        {icon}
        <div className="mt-4 text-base font-semibold text-foreground">
          {isLoading ? "正在识别项目..." : "点击选择 / 拖拽文件夹"}
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {isLoading ? "系统正在自动分析项目配置" : "请选择项目根目录"}
        </div>
      </div>

      {selectedPath ? (
        <div className="flex items-center gap-2 rounded-xl border border-border/30 bg-black/15 px-3 py-2">
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs text-muted-foreground" title={selectedPath}>
            {selectedPath}
          </span>
        </div>
      ) : null}

      {hasError ? <p className="text-xs text-rose-300">{dropzoneError}</p> : null}
    </div>
  );
}
