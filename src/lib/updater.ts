import { useState, useCallback } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";

export type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "up-to-date" | "error";

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  const checkForUpdates = useCallback(async (silent = false) => {
    try {
      setStatus("checking");
      const update = await check();

      if (update) {
        setUpdateVersion(update.version);
        setStatus("available");
        if (!silent) {
          toast.info(`发现新版本: ${update.version}`, {
            description: "是否现在下载并安装？",
          });
        }
        return update;
      } else {
        setStatus("up-to-date");
        if (!silent) {
          toast.success("当前已是最新版本");
        }
      }
    } catch (error) {
      console.error("检查更新失败:", error);
      setStatus("error");
      if (!silent) {
        toast.error("检查更新失败", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return null;
  }, []);

  const downloadAndInstall = useCallback(async () => {
    try {
      const update = await check();
      if (!update) {
        setStatus("up-to-date");
        return;
      }

      setStatus("downloading");
      setProgress(0);

      let downloaded = 0;
      let contentLength: number | undefined;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength;
            setProgress(0);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength) {
              const percentage = Math.round((downloaded / contentLength) * 100);
              setProgress(Math.min(percentage, 99));
            } else {
              // Fallback if contentLength is unknown
              setProgress((prev) => Math.min(prev + 1, 99));
            }
            break;
          case "Finished":
            setProgress(100);
            break;
        }
      });

      toast.success("更新下载完成，正在重启应用...");
      // Delay slightly so the user can see 100%
      setTimeout(async () => {
        await relaunch();
      }, 1000);
    } catch (error) {
      console.error("更新失败:", error);
      setStatus("error");
      toast.error("更新失败", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  return {
    status,
    progress,
    updateVersion,
    checkForUpdates,
    downloadAndInstall,
  };
}
