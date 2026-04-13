import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { desktopApi } from "@/lib/desktop";
import type { ProjectConfig, ProjectRuntime } from "@/shared/contracts";
import { areProjectRuntimesEqual, isDependencyOperationEvent } from "./helpers";
import { useProjectDiagnosisState } from "./use-project-diagnosis-state";
import { useProjectOperationState } from "./use-project-operation-state";

export type ProjectNodeRetrySuggestion = {
  project: ProjectConfig;
  suggestedNodeVersion: string;
};

type UseProjectRuntimeStateOptions = {
  projects: ProjectConfig[];
  onSuggestRetry: (suggestion: ProjectNodeRetrySuggestion) => void;
  onClearRetrySuggestion: (projectId: string) => void;
};

function getRuntimeFailureMessage(runtime: ProjectRuntime) {
  if (runtime.failureMessage?.trim()) {
    return runtime.failureMessage.trim();
  }

  const recentLogMessage = [...(runtime.recentLogs ?? [])]
    .reverse()
    .map((entry) => entry.message.trim())
    .find(Boolean);

  return runtime.lastMessage?.trim() || recentLogMessage || "启动失败，请查看终端输出。";
}

function hasRuntimePanelContent(runtime: ProjectRuntime) {
  if (runtime.detectedAddresses.length > 0) {
    return true;
  }

  return runtime.recentLogs.some(
    (entry) => entry.level !== "system" && entry.message.trim().length > 0
  );
}

function shouldFlushRuntimeUpdateImmediately(
  currentRuntime: ProjectRuntime | undefined,
  nextRuntime: ProjectRuntime
) {
  return (
    currentRuntime?.status !== nextRuntime.status || hasRuntimePanelContent(nextRuntime)
  );
}

export function useProjectRuntimeState({
  projects,
  onSuggestRetry,
  onClearRetrySuggestion,
}: UseProjectRuntimeStateOptions) {
  const [runtimes, setRuntimes] = useState<Record<string, ProjectRuntime>>({});
  const pendingRuntimeUpdatesRef = useRef<Record<string, ProjectRuntime>>({});
  const runtimeFlushTimerRef = useRef<number | null>(null);
  const projectsByIdRef = useRef<Record<string, ProjectConfig>>(
    Object.fromEntries(projects.map((project) => [project.id, project]))
  );
  const runtimesRef = useRef<Record<string, ProjectRuntime>>({});
  const {
    clearProjectOperationPanel,
    clearProjectStartFailure,
    dependencyOperations,
    isProjectDependencyOperationLocked,
    projectOperationPanels,
    projectStartFailures,
    setDependencyOperationStatus,
    setProjectStartFailure,
    showProjectOperationPanel,
  } = useProjectOperationState();

  useEffect(() => {
    projectsByIdRef.current = Object.fromEntries(
      projects.map((project) => [project.id, project])
    );

    setRuntimes((current) => {
      const next = { ...current };
      const activeIds = new Set(projects.map((project) => project.id));

      for (const projectId of Object.keys(next)) {
        if (!activeIds.has(projectId)) {
          delete next[projectId];
        }
      }

      runtimesRef.current = next;
      return next;
    });
  }, [projects]);

  const syncRuntimes = useCallback((nextRuntimes: ProjectRuntime[]) => {
    startTransition(() => {
      setRuntimes((current) => {
        let changed = false;
        const nextRuntimeMap: Record<string, ProjectRuntime> = {};

        for (const runtime of nextRuntimes) {
          const currentRuntime = current[runtime.projectId];
          const nextRuntime = areProjectRuntimesEqual(currentRuntime, runtime)
            ? currentRuntime
            : runtime;
          nextRuntimeMap[runtime.projectId] = nextRuntime;
          changed ||= nextRuntime !== currentRuntime;
        }

        if (!changed && Object.keys(current).length === Object.keys(nextRuntimeMap).length) {
          runtimesRef.current = current;
          return current;
        }

        runtimesRef.current = nextRuntimeMap;
        return nextRuntimeMap;
      });
    });
  }, []);

  const flushQueuedRuntimeUpdates = useCallback(() => {
    runtimeFlushTimerRef.current = null;
    const queuedRuntimes = Object.values(pendingRuntimeUpdatesRef.current);
    if (queuedRuntimes.length === 0) {
      return;
    }

    pendingRuntimeUpdatesRef.current = {};

    startTransition(() => {
      setRuntimes((current) => {
        let changed = false;
        const next = { ...current };

        for (const runtime of queuedRuntimes) {
          if (areProjectRuntimesEqual(next[runtime.projectId], runtime)) {
            continue;
          }

          next[runtime.projectId] = runtime;
          changed = true;
        }

        if (!changed) {
          runtimesRef.current = current;
          return current;
        }

        runtimesRef.current = next;
        return next;
      });
    });
  }, []);

  const queueRuntimeUpdate = useCallback(
    (runtime: ProjectRuntime) => {
      const currentRuntime =
        pendingRuntimeUpdatesRef.current[runtime.projectId] ??
        runtimesRef.current[runtime.projectId];

      pendingRuntimeUpdatesRef.current[runtime.projectId] = runtime;

      if (shouldFlushRuntimeUpdateImmediately(currentRuntime, runtime)) {
        if (runtimeFlushTimerRef.current) {
          window.clearTimeout(runtimeFlushTimerRef.current);
          runtimeFlushTimerRef.current = null;
        }

        flushQueuedRuntimeUpdates();
        return;
      }

      if (runtimeFlushTimerRef.current) {
        return;
      }

      runtimeFlushTimerRef.current = window.setTimeout(flushQueuedRuntimeUpdates, 80);
    },
    [flushQueuedRuntimeUpdates]
  );

  const {
    clearProjectDiagnosis,
    diagnoseProjectSilently,
    diagnoseProjectsSilently,
    isProjectDiagnosisPending,
    projectDiagnoses,
    queueProjectDiagnosis,
    refreshProjectDiagnosis,
  } = useProjectDiagnosisState({
    projectOperationPanels,
    projectStartFailures,
    projects,
    runtimes,
  });

  useEffect(() => {
    const unsubscribeRuntime = desktopApi.subscribeRuntime((runtime) => {
      queueRuntimeUpdate(runtime);

      if (runtime.status === "running") {
        if (hasRuntimePanelContent(runtime)) {
          clearProjectOperationPanel(runtime.projectId);
        }

        clearProjectStartFailure(runtime.projectId);
        onClearRetrySuggestion(runtime.projectId);
        return;
      }

      if (runtime.status === "starting") {
        if (hasRuntimePanelContent(runtime)) {
          clearProjectOperationPanel(runtime.projectId);
        }

        clearProjectStartFailure(runtime.projectId);
        onClearRetrySuggestion(runtime.projectId);
        return;
      }

      if (runtime.status === "stopped") {
        return;
      }

      if (runtime.status !== "error") {
        return;
      }

      const project = projectsByIdRef.current[runtime.projectId];
      if (!project) {
        return;
      }

      const failureMessage = getRuntimeFailureMessage(runtime);
      setProjectStartFailure(project.id, failureMessage);

      showProjectOperationPanel({
        operationId: `project-start-failed:${project.id}:${Date.now()}`,
        type: "project-start-preflight",
        status: "error",
        title: "启动失败",
        projectId: project.id,
        projectName: project.name,
        message: failureMessage,
      });

      if (runtime.suggestedNodeVersion) {
        onSuggestRetry({
          project,
          suggestedNodeVersion: runtime.suggestedNodeVersion,
        });
      }
    });

    const unsubscribeOperation = desktopApi.subscribeOperation((event) => {
      if (!isDependencyOperationEvent(event.type) || !event.projectId) {
        return;
      }

      if (event.status === "running") {
        setDependencyOperationStatus(event.projectId, event.status);
        showProjectOperationPanel(event);
        return;
      }

      setDependencyOperationStatus(event.projectId);
      showProjectOperationPanel(event);

      if (event.status === "success") {
        clearProjectDiagnosis(event.projectId);
        queueProjectDiagnosis(event.projectId);
      }
    });

    return () => {
      unsubscribeRuntime();
      unsubscribeOperation();

      if (runtimeFlushTimerRef.current) {
        window.clearTimeout(runtimeFlushTimerRef.current);
        runtimeFlushTimerRef.current = null;
      }

      pendingRuntimeUpdatesRef.current = {};
    };
  }, [
    clearProjectDiagnosis,
    clearProjectOperationPanel,
    clearProjectStartFailure,
    onClearRetrySuggestion,
    onSuggestRetry,
    queueRuntimeUpdate,
    queueProjectDiagnosis,
    setDependencyOperationStatus,
    setProjectStartFailure,
    showProjectOperationPanel,
  ]);

  return {
    clearProjectDiagnosis,
    clearProjectOperationPanel,
    clearProjectStartFailure,
    dependencyOperations,
    diagnoseProjectsSilently,
    diagnoseProjectSilently,
    isProjectDiagnosisPending,
    isProjectDependencyOperationLocked,
    projectDiagnoses,
    projectOperationPanels,
    projectStartFailures,
    queueProjectDiagnosis,
    refreshProjectDiagnosis,
    runtimes,
    setProjectStartFailure,
    showProjectOperationPanel,
    syncRuntimes,
  };
}
