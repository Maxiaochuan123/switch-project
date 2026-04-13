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
    <div className="rounded-lg border border-border/30 bg-black/10 p-4">
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
      <DialogContent
        className="max-w-xl border-border/50 bg-black/60 p-6 backdrop-blur-xl"
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-2xl font-semibold tracking-tight">启动设置</DialogTitle>
          <DialogDescription>
            这里只管理软件级设置，项目自己的自动启动行为在项目编辑弹窗里配置。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <SettingsRow
            icon={Rocket}
            title="开机自动启动"
            description="开启后，登录系统后会自动启动这个软件。"
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
            title="启动后最小化到托盘"
            description="软件启动时，窗口不直接显示，而是最小化到系统托盘。"
            checked={settings.launchMinimizedOnLogin}
            onCheckedChange={(checked) =>
              onSettingsChange((current) => ({
                ...current,
                launchMinimizedOnLogin: checked,
              }))
            }
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isSaving}>
            {isSaving ? "保存中..." : "保存设置"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
