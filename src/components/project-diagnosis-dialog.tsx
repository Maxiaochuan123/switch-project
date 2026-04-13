import { Activity, LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProjectConfig, ProjectDiagnosis } from "@/shared/contracts";

type ProjectDiagnosisDialogProps = {
  open: boolean;
  project: ProjectConfig | null;
  diagnosis: ProjectDiagnosis | null;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
};

function DiagnosisItem({
  label,
  ok,
}: {
  label: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/30 bg-black/10 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={ok ? "text-emerald-300" : "text-amber-300"}>{ok ? "正常" : "待处理"}</span>
    </div>
  );
}

export function ProjectDiagnosisDialog({
  open,
  project,
  diagnosis,
  isLoading,
  onOpenChange,
}: ProjectDiagnosisDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-lg border-border/50 bg-black/60 backdrop-blur-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Activity className="size-5 text-primary" />
            {project ? `${project.name} 诊断` : "项目诊断"}
          </DialogTitle>
          <DialogDescription>
            快速检查当前项目的 Node、包管理器、依赖和启动条件是否就绪。
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            正在检查项目环境...
          </div>
        ) : diagnosis ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <DiagnosisItem label="Node 版本" ok={diagnosis.readiness.nodeInstalled} />
              <DiagnosisItem
                label="包管理器"
                ok={diagnosis.readiness.packageManagerAvailable}
              />
              <DiagnosisItem label="项目依赖" ok={diagnosis.readiness.hasNodeModules} />
              <DiagnosisItem label="可直接启动" ok={diagnosis.readiness.canStart} />
            </div>

            <div className="rounded-lg border border-border/30 bg-black/10 p-4 text-sm text-muted-foreground">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <span>项目路径</span>
                  <span className={diagnosis.pathExists ? "text-emerald-300" : "text-amber-300"}>
                    {diagnosis.pathExists ? "正常" : "不存在"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>package.json</span>
                  <span className={diagnosis.hasPackageJson ? "text-emerald-300" : "text-amber-300"}>
                    {diagnosis.hasPackageJson ? "已检测到" : "缺失"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>启动命令</span>
                  <span
                    className={
                      diagnosis.startCommandAvailable ? "text-emerald-300" : "text-amber-300"
                    }
                  >
                    {diagnosis.startCommandAvailable ? diagnosis.startCommand : "未配置"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Node 版本</span>
                  <span className="font-mono text-foreground">v{diagnosis.nodeVersion}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>包管理器</span>
                  <span className="font-mono text-foreground">{diagnosis.packageManager}</span>
                </div>
              </div>
            </div>

            {diagnosis.readiness.warnings.length > 0 ? (
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-50">
                <div className="mb-2 font-medium">需要处理的问题</div>
                <div className="space-y-1">
                  {diagnosis.readiness.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-50">
                当前项目环境已经准备就绪，可以直接启动。
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
            暂无诊断结果
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
