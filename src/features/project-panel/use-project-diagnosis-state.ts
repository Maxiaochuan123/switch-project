import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { desktopApi } from "@/lib/desktop";
import type { ProjectConfig, ProjectDiagnosis, ProjectRuntime } from "@/shared/contracts";
import { areProjectDiagnosesEqual, isProjectRuntimeActive } from "./helpers";

type UseProjectDiagnosisStateOptions = {
  projectOperationPanels: Record<string, unknown>;
  projectStartFailures: Record<string, string>;
  projects: ProjectConfig[];
  runtimes: Record<string, ProjectRuntime>;
};

export function useProjectDiagnosisState({
  projectOperationPanels,
  projectStartFailures,
  projects,
  runtimes,
}: UseProjectDiagnosisStateOptions) {
  const [projectDiagnoses, setProjectDiagnoses] = useState<Record<string, ProjectDiagnosis>>({});
  const [pendingProjectDiagnoses, setPendingProjectDiagnoses] = useState<
    Record<string, true>
  >({});
  const diagnosisQueueRef = useRef<Set<string>>(new Set());
  const diagnosisQueueTimerRef = useRef<number | null>(null);
  const diagnosingProjectIdsRef = useRef<Set<string>>(new Set());
  const projectsByIdRef = useRef<Record<string, ProjectConfig>>(
    Object.fromEntries(projects.map((project) => [project.id, project]))
  );

  useEffect(() => {
    projectsByIdRef.current = Object.fromEntries(
      projects.map((project) => [project.id, project])
    );

    const activeIds = new Set(projects.map((project) => project.id));

    setProjectDiagnoses((current) => {
      const next = { ...current };

      for (const projectId of Object.keys(next)) {
        if (!activeIds.has(projectId)) {
          delete next[projectId];
        }
      }

      return next;
    });

    setPendingProjectDiagnoses((current) => {
      const next = { ...current };

      for (const projectId of Object.keys(next)) {
        if (!activeIds.has(projectId)) {
          delete next[projectId];
        }
      }

      return next;
    });
  }, [projects]);

  const markProjectDiagnosesPending = useCallback((projectIds: string[]) => {
    if (projectIds.length === 0) {
      return;
    }

    startTransition(() => {
      setPendingProjectDiagnoses((current) => {
        let changed = false;
        const next = { ...current };

        for (const projectId of projectIds) {
          if (next[projectId]) {
            continue;
          }

          next[projectId] = true;
          changed = true;
        }

        return changed ? next : current;
      });
    });
  }, []);

  const clearPendingProjectDiagnoses = useCallback((projectIds: string[]) => {
    if (projectIds.length === 0) {
      return;
    }

    startTransition(() => {
      setPendingProjectDiagnoses((current) => {
        let changed = false;
        const next = { ...current };

        for (const projectId of projectIds) {
          if (!next[projectId]) {
            continue;
          }

          delete next[projectId];
          changed = true;
        }

        return changed ? next : current;
      });
    });
  }, []);

  const clearProjectDiagnosis = useCallback((projectId: string) => {
    startTransition(() => {
      setProjectDiagnoses((current) => {
        if (!current[projectId]) {
          return current;
        }

        const next = { ...current };
        delete next[projectId];
        return next;
      });
    });
  }, []);

  const diagnoseProjectsSilently = useCallback(
    async (projectsToDiagnose: ProjectConfig[]) => {
      const queuedProjects = projectsToDiagnose.filter(
        (project) => !diagnosingProjectIdsRef.current.has(project.id)
      );

      if (queuedProjects.length === 0) {
        return;
      }

      const queuedProjectIds = queuedProjects.map((project) => project.id);
      markProjectDiagnosesPending(queuedProjectIds);

      for (const project of queuedProjects) {
        diagnosingProjectIdsRef.current.add(project.id);
      }

      try {
        const diagnoses = await desktopApi.diagnoseProjects(queuedProjectIds);

        startTransition(() => {
          setProjectDiagnoses((current) => {
            let changed = false;
            const next = { ...current };

            for (const diagnosis of diagnoses) {
              const currentDiagnosis = current[diagnosis.projectId];
              if (areProjectDiagnosesEqual(currentDiagnosis, diagnosis)) {
                continue;
              }

              next[diagnosis.projectId] = diagnosis;
              changed = true;
            }

            return changed ? next : current;
          });
        });
      } catch {
        // Ignore background diagnosis failures; startup checks still run on action.
      } finally {
        for (const project of queuedProjects) {
          diagnosingProjectIdsRef.current.delete(project.id);
        }

        clearPendingProjectDiagnoses(queuedProjectIds);
      }
    },
    [clearPendingProjectDiagnoses, markProjectDiagnosesPending]
  );

  const diagnoseProjectSilently = useCallback(
    async (project: ProjectConfig) => {
      await diagnoseProjectsSilently([project]);
    },
    [diagnoseProjectsSilently]
  );

  const flushQueuedDiagnoses = useCallback(() => {
    diagnosisQueueTimerRef.current = null;

    if (diagnosisQueueRef.current.size === 0) {
      return;
    }

    const queuedIds = new Set(diagnosisQueueRef.current);
    diagnosisQueueRef.current.clear();

    const queuedProjects = [...queuedIds]
      .map((projectId) => projectsByIdRef.current[projectId])
      .filter((project): project is ProjectConfig => Boolean(project));

    if (queuedProjects.length === 0) {
      return;
    }

    void diagnoseProjectsSilently(queuedProjects);
  }, [diagnoseProjectsSilently]);

  const queueDiagnoseProjects = useCallback(
    (projectsToQueue: ProjectConfig[]) => {
      let hasQueuedProject = false;
      const queuedProjectIds: string[] = [];

      for (const project of projectsToQueue) {
        if (diagnosingProjectIdsRef.current.has(project.id)) {
          continue;
        }

        diagnosisQueueRef.current.add(project.id);
        queuedProjectIds.push(project.id);
        hasQueuedProject = true;
      }

      markProjectDiagnosesPending(queuedProjectIds);

      if (!hasQueuedProject || diagnosisQueueTimerRef.current) {
        return;
      }

      diagnosisQueueTimerRef.current = window.setTimeout(flushQueuedDiagnoses, 120);
    },
    [flushQueuedDiagnoses, markProjectDiagnosesPending]
  );

  const queueProjectDiagnosis = useCallback(
    (projectId: string) => {
      const project = projectsByIdRef.current[projectId];
      if (!project) {
        return;
      }

      queueDiagnoseProjects([project]);
    },
    [queueDiagnoseProjects]
  );

  const refreshProjectDiagnosis = useCallback(
    (projectId: string) => {
      clearProjectDiagnosis(projectId);
      queueProjectDiagnosis(projectId);
    },
    [clearProjectDiagnosis, queueProjectDiagnosis]
  );

  const isProjectDiagnosisPending = useCallback(
    (projectId: string) => Boolean(pendingProjectDiagnoses[projectId]),
    [pendingProjectDiagnoses]
  );

  useEffect(() => {
    const pendingProjects: ProjectConfig[] = [];

    for (const project of projects) {
      const runtime = runtimes[project.id];
      if (isProjectRuntimeActive(runtime?.status)) {
        continue;
      }

      if (projectOperationPanels[project.id]) {
        continue;
      }

      if (projectStartFailures[project.id]) {
        continue;
      }

      if (projectDiagnoses[project.id]) {
        continue;
      }

      pendingProjects.push(project);
    }

    if (pendingProjects.length > 0) {
      queueDiagnoseProjects(pendingProjects);
    }
  }, [
    projectDiagnoses,
    projectOperationPanels,
    projectStartFailures,
    projects,
    queueDiagnoseProjects,
    runtimes,
  ]);

  useEffect(() => {
    return () => {
      if (diagnosisQueueTimerRef.current) {
        window.clearTimeout(diagnosisQueueTimerRef.current);
        diagnosisQueueTimerRef.current = null;
      }

      diagnosisQueueRef.current.clear();
    };
  }, []);

  return {
    clearProjectDiagnosis,
    diagnoseProjectSilently,
    diagnoseProjectsSilently,
    isProjectDiagnosisPending,
    projectDiagnoses,
    queueProjectDiagnosis,
    refreshProjectDiagnosis,
  };
}
