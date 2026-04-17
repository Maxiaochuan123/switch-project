import { useCallback, type Dispatch, type SetStateAction } from "react";
import { desktopApi } from "@/lib/desktop";
import { getErrorMessage, type Feedback } from "./helpers";
import type {
  AppCloseRequest,
  AppStartupSettings,
} from "@/shared/contracts";

type UseProjectAppActionsOptions = {
  setAppCloseRequest: Dispatch<SetStateAction<AppCloseRequest | null>>;
  setFeedback: Dispatch<SetStateAction<Feedback | null>>;
  setIsConfirmingAppClose: Dispatch<SetStateAction<boolean>>;
  setIsMinimizingAppClose: Dispatch<SetStateAction<boolean>>;
  setIsSavingStartupSettings: Dispatch<SetStateAction<boolean>>;
  setIsStartupSettingsDialogOpen: Dispatch<SetStateAction<boolean>>;
  setStartupSettings: Dispatch<SetStateAction<AppStartupSettings>>;
  setStartupSettingsDraft: Dispatch<SetStateAction<AppStartupSettings>>;
  startupSettingsDraft: AppStartupSettings;
};

export function useProjectAppActions({
  setAppCloseRequest,
  setFeedback,
  setIsConfirmingAppClose,
  setIsMinimizingAppClose,
  setIsSavingStartupSettings,
  setIsStartupSettingsDialogOpen,
  setStartupSettings,
  setStartupSettingsDraft,
  startupSettingsDraft,
}: UseProjectAppActionsOptions) {
  const handleSaveStartupSettings = useCallback(async () => {
    setIsSavingStartupSettings(true);

    try {
      await desktopApi.saveAppStartupSettings(startupSettingsDraft);
      const nextStartupSettings = await desktopApi.getAppStartupSettings();
      setStartupSettings(nextStartupSettings);
      setStartupSettingsDraft(nextStartupSettings);

      if (nextStartupSettings.openAtLogin !== startupSettingsDraft.openAtLogin) {
        setFeedback({
          variant: "destructive",
          title: "开机自启设置未生效",
          message: startupSettingsDraft.openAtLogin
            ? "系统没有开启开机自启，当前已恢复为实际状态。"
            : "系统没有关闭开机自启，当前已恢复为实际状态。",
        });
        return;
      }

      setIsStartupSettingsDialogOpen(false);
      setFeedback(null);
    } catch (error) {
      setFeedback({
        variant: "destructive",
        title: "保存启动设置失败",
        message: getErrorMessage(error),
      });
    } finally {
      setIsSavingStartupSettings(false);
    }
  }, [
    setFeedback,
    setIsSavingStartupSettings,
    setIsStartupSettingsDialogOpen,
    setStartupSettings,
    setStartupSettingsDraft,
    startupSettingsDraft,
  ]);

  const handleConfirmAppClose = useCallback(async () => {
    setIsConfirmingAppClose(true);

    try {
      await desktopApi.confirmAppClose();
    } finally {
      setIsConfirmingAppClose(false);
    }
  }, [setIsConfirmingAppClose]);

  const handleMinimizeAppClose = useCallback(async () => {
    setIsMinimizingAppClose(true);
    setAppCloseRequest(null);

    try {
      await desktopApi.minimizeAppToTray();
    } finally {
      setIsMinimizingAppClose(false);
    }
  }, [setAppCloseRequest, setIsMinimizingAppClose]);

  const handleCancelAppClose = useCallback(async () => {
    setAppCloseRequest(null);
    await desktopApi.cancelAppClose();
  }, [setAppCloseRequest]);

  const handleExitDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        void handleCancelAppClose();
      }
    },
    [handleCancelAppClose]
  );

  return {
    handleCancelAppClose,
    handleConfirmAppClose,
    handleExitDialogOpenChange,
    handleMinimizeAppClose,
    handleSaveStartupSettings,
  };
}
