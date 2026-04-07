import type { Dispatch, SetStateAction } from "react";
import { LaptopMinimalCheck, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { AppStartupSettings } from "@/shared/contracts";

type StartupSettingsDialogProps = {
  open: boolean;
  settings: AppStartupSettings;
  isSaving: boolean;
  onSettingsChange: Dispatch<SetStateAction<AppStartupSettings>>;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
};

type SettingsRowProps = {
  icon: typeof Rocket;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
};

function SettingsRow({
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: SettingsRowProps) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/10 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Icon className="size-4 text-primary" />
            {title}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  );
}

export function StartupSettingsDialog({
  open,
  settings,
  isSaving,
  onSettingsChange,
  onOpenChange,
  onSubmit,
}: StartupSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-white/10 bg-[#0d1426]/95 p-0 backdrop-blur-xl">
        <div className="rounded-[24px] border border-white/6 bg-[#0d1426]/95 p-6">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-2xl font-semibold tracking-tight">
              启动设置
            </DialogTitle>
            <DialogDescription>
              这里只管理软件级设置，项目自己的自动启动行为在项目编辑弹窗里配置。
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 space-y-3">
            <SettingsRow
              icon={Rocket}
              title="Windows 登录后自动启动软件"
              description="开启后，系统登录完成时会自动启动这个面板。"
              checked={settings.openAtLogin}
              onCheckedChange={(checked) =>
                onSettingsChange((current) => ({
                  ...current,
                  openAtLogin: checked,
                }))
              }
            />
            <SettingsRow
              icon={LaptopMinimalCheck}
              title="登录启动时最小化显示"
              description="适合和项目自动启动一起使用，避免开机后立刻抢占焦点。"
              checked={settings.launchMinimizedOnLogin}
              disabled={!settings.openAtLogin}
              onCheckedChange={(checked) =>
                onSettingsChange((current) => ({
                  ...current,
                  launchMinimizedOnLogin: checked,
                }))
              }
            />
          </div>

          <DialogFooter className="pt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="button" onClick={onSubmit} disabled={isSaving}>
              {isSaving ? "保存中..." : "保存设置"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
