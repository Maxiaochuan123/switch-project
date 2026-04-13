import { useEffect, useState } from "react";
import { listen, TauriEvent } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

type DragPayload = {
  paths?: string[];
  position?: {
    x: number;
    y: number;
  };
};

type ProjectGlobalDropzoneProps = {
  onPathSelected: (path: string) => void;
};

export function ProjectGlobalDropzone({ onPathSelected }: ProjectGlobalDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

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
      await register(TauriEvent.DRAG_ENTER, () => {
        setIsDragging(true);
      });

      await register(TauriEvent.DRAG_OVER, () => {
        setIsDragging(true);
      });

      await register(TauriEvent.DRAG_LEAVE, () => {
        setIsDragging(false);
      });

      await register(TauriEvent.DRAG_DROP, (payload) => {
        const firstPath = payload.paths?.[0];
        setIsDragging(false);

        if (firstPath) {
          onPathSelected(firstPath);
        }
      });
    })();

    return () => {
      for (const unlisten of unlistenFns) {
        unlisten();
      }
    };
  }, [onPathSelected]);

  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-primary/10 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className={cn(
              "flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-primary bg-black/60 p-12 text-primary shadow-2xl shadow-primary/20",
              "animate-pulse"
            )}
          >
            <div className="rounded-full bg-primary/20 p-6">
              <UploadCloud className="size-16" />
            </div>
            <div className="space-y-2 text-center">
              <h3 className="text-3xl font-bold tracking-tight">以此添加新项目</h3>
              <p className="text-lg text-primary/70">松开文件夹即可自动识别并添加</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
