import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen, TauriEvent } from "@tauri-apps/api/event";
import { FolderOpen, Loader2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

type DropzoneState = "idle" | "drag-over";

type DropzoneFieldProps = {
  selectedPath: string;
  isLoading: boolean;
  dropzoneError?: string;
  onBrowse: () => void;
  onPathSelected: (path: string) => void;
};

type DragPayload = {
  paths?: string[];
  position?: {
    x: number;
    y: number;
  };
};

export function DropzoneField({
  selectedPath,
  isLoading,
  dropzoneError,
  onBrowse,
  onPathSelected,
}: DropzoneFieldProps) {
  const [dropzoneState, setDropzoneState] = useState<DropzoneState>("idle");
  const dropzoneRef = useRef<HTMLDivElement | null>(null);
  const lastDroppedPathRef = useRef("");
  const lastDroppedAtRef = useRef(0);

  const isPointInsideDropzone = useCallback((position?: { x: number; y: number }) => {
    if (!position || !dropzoneRef.current) {
      return false;
    }

    const rect = dropzoneRef.current.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const x = position.x / scale;
    const y = position.y / scale;

    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }, []);

  const handleResolvedPath = useCallback(
    (path: string) => {
      const normalizedPath = path.trim();
      if (!normalizedPath) {
        return;
      }

      const now = Date.now();
      if (
        lastDroppedPathRef.current === normalizedPath &&
        now - lastDroppedAtRef.current < 800
      ) {
        return;
      }

      lastDroppedPathRef.current = normalizedPath;
      lastDroppedAtRef.current = now;
      onPathSelected(normalizedPath);
    },
    [onPathSelected]
  );

  useEffect(() => {
    const unlistenFns: Array<() => void> = [];

    const register = async (
      eventName: TauriEvent,
      handler: (payload: DragPayload) => void
    ) => {
      const unlisten = await listen<DragPayload>(eventName, (event) => {
        handler(event.payload);
      });
      unlistenFns.push(unlisten);
    };

    void (async () => {
      await register(TauriEvent.DRAG_ENTER, (payload) => {
        setDropzoneState(isPointInsideDropzone(payload.position) ? "drag-over" : "idle");
      });

      await register(TauriEvent.DRAG_OVER, (payload) => {
        setDropzoneState(isPointInsideDropzone(payload.position) ? "drag-over" : "idle");
      });

      await register(TauriEvent.DRAG_LEAVE, () => {
        setDropzoneState("idle");
      });

      await register(TauriEvent.DRAG_DROP, (payload) => {
        const firstPath = payload.paths?.[0];
        const isInside = isPointInsideDropzone(payload.position);
        setDropzoneState("idle");

        if (isInside && firstPath) {
          handleResolvedPath(firstPath);
        }
      });
    })();

    return () => {
      for (const unlisten of unlistenFns) {
        unlisten();
      }
    };
  }, [handleResolvedPath, isPointInsideDropzone]);

  const handleClick = useCallback(() => {
    if (!isLoading) {
      onBrowse();
    }
  }, [isLoading, onBrowse]);

  const isDragOver = dropzoneState === "drag-over";
  const hasError = Boolean(dropzoneError);
  const icon = useMemo(() => {
    if (isLoading) {
      return <Loader2 className="size-6 animate-spin text-primary" />;
    }

    return <UploadCloud className="size-6 text-primary" />;
  }, [isLoading]);

  return (
    <div className="space-y-2">
      <div
        ref={dropzoneRef}
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
          "flex min-h-40 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          isDragOver
            ? "border-cyan-300/80 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(103,232,249,0.25)]"
            : "border-white/15 bg-black/10 hover:border-white/25 hover:bg-white/5",
          hasError && !isDragOver && "border-rose-400/50 bg-rose-500/10",
          isLoading && "cursor-wait opacity-85"
        )}
      >
        {icon}
        <div className="mt-4 text-base font-semibold text-foreground">
          {isLoading
            ? "正在识别项目..."
            : isDragOver
              ? "松开自动识别"
              : "点击选择 / 拖拽文件夹"}
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {isLoading
            ? "系统正在自动分析项目配置"
            : isDragOver
              ? "将自动读取项目配置"
              : "请选择项目根目录"}
        </div>
      </div>

      {selectedPath ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/15 px-3 py-2">
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
