import { RefreshCw, X } from "lucide-react";
import { NodeInstallProgress } from "@/components/node-install-progress";
import { Button } from "@/components/ui/button";
import type { NodeInstallProgress as NodeInstallProgressState } from "@/features/project-panel/use-project-dialog-state";
import { normalizeNodeVersion } from "@/shared/contracts";

type NodeVersionSyncCardProps = {
  missingVersions: string[];
  isSyncing: boolean;
  progress: NodeInstallProgressState | null;
  onDismiss: () => void;
  onSync: () => void;
};

export function NodeVersionSyncCard({
  missingVersions,
  isSyncing,
  progress,
  onDismiss,
  onSync,
}: NodeVersionSyncCardProps) {
  return (
    <section className="mt-3 rounded-2xl border border-sky-500/20 bg-sky-500/8 p-4 shadow-lg shadow-black/10 backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="text-sm font-semibold text-sky-100">检测到 nvm 与 fnm 版本不一致</div>
          <p className="text-sm leading-6 text-sky-50/80">
            当前 nvm 里有 {missingVersions.length} 个 Node 版本尚未同步到 fnm。为了让面板运行环境保持稳定，建议一键同步安装。
          </p>
          <div className="flex flex-wrap gap-2">
            {missingVersions.map((version) => (
              <span
                key={version}
                className="rounded-full border border-sky-300/20 bg-black/20 px-3 py-1 text-xs text-sky-100/90"
              >
                v{normalizeNodeVersion(version)}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" onClick={onDismiss} disabled={isSyncing}>
            <X className="size-4" />
            稍后再说
          </Button>
          <Button type="button" onClick={onSync} disabled={isSyncing}>
            <RefreshCw className={`size-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "同步中..." : "一键同步到 fnm"}
          </Button>
        </div>
      </div>

      {progress ? (
        <div className="mt-4">
          <NodeInstallProgress progress={progress} />
        </div>
      ) : null}
    </section>
  );
}
