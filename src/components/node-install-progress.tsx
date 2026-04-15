import { useEffect, useMemo, useState } from "react";
import type { NodeInstallProgress } from "@/features/project-panel/use-project-dialog-state";
import { normalizeNodeVersion } from "@/shared/contracts";

type NodeInstallProgressProps = {
  progress: NodeInstallProgress;
  tone?: "sky" | "amber";
};

function getToneClassNames(tone: NodeInstallProgressProps["tone"]) {
  if (tone === "amber") {
    return {
      container: "border-amber-500/20 bg-amber-500/8",
      text: "text-amber-50",
      subtext: "text-amber-100/75",
      track: "bg-white/10",
      fill: "from-amber-300 via-orange-300 to-yellow-200",
    };
  }

  return {
    container: "border-sky-500/20 bg-sky-500/8",
    text: "text-sky-50",
    subtext: "text-sky-100/75",
    track: "bg-white/10",
    fill: "from-sky-400 via-cyan-300 to-emerald-300",
  };
}

export function NodeInstallProgress({
  progress,
  tone = "sky",
}: NodeInstallProgressProps) {
  const [animatedOffset, setAnimatedOffset] = useState(0);
  const toneClassNames = getToneClassNames(tone);
  const baseProgress = useMemo(() => {
    if (progress.totalCount <= 0) {
      return 0;
    }

    return (progress.completedCount / progress.totalCount) * 100;
  }, [progress.completedCount, progress.totalCount]);

  useEffect(() => {
    let animationFrameId = 0;
    const startedAt = performance.now();

    const animate = () => {
      const elapsedMs = performance.now() - startedAt;
      const segmentSize = progress.totalCount > 0 ? 100 / progress.totalCount : 100;
      const maxOffset = Math.max(segmentSize * 0.88, 18);
      const nextOffset = Math.min(10 + (elapsedMs / 7000) * maxOffset, maxOffset);
      setAnimatedOffset(nextOffset);
      animationFrameId = window.requestAnimationFrame(animate);
    };

    setAnimatedOffset(10);
    animationFrameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [progress.completedCount, progress.currentVersion, progress.totalCount]);

  const progressValue = Math.min(baseProgress + animatedOffset, 96);
  const progressLabel =
    progress.kind === "sync"
      ? `正在同步到 fnm: Node v${normalizeNodeVersion(progress.currentVersion)}`
      : `正在安装 Node v${normalizeNodeVersion(progress.currentVersion)}`;
  const progressMeta =
    progress.kind === "sync"
      ? `${Math.min(progress.completedCount + 1, progress.totalCount)} / ${progress.totalCount}`
      : "1 / 1";

  return (
    <div className={`space-y-3 rounded-xl border p-4 ${toneClassNames.container}`}>
      <div className={`flex items-center justify-between gap-3 text-sm ${toneClassNames.text}`}>
        <span>{progressLabel}</span>
        <span className="tabular-nums">{progressMeta}</span>
      </div>
      <div className={`h-2 overflow-hidden rounded-full ${toneClassNames.track}`}>
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-300 ease-out ${toneClassNames.fill}`}
          style={{ width: `${progressValue}%` }}
        />
      </div>
      <p className={`text-xs leading-5 ${toneClassNames.subtext}`}>
        {progress.kind === "sync"
          ? "正在把 nvm 中的版本同步安装到 fnm，完成后面板会自动刷新。"
          : "安装过程可能需要一些时间，完成后会自动刷新当前环境。"}
      </p>
    </div>
  );
}
