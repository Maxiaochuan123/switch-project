import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { OperationEvent, OperationStatus } from "@/shared/contracts";
import {
  areOperationEventsEqual,
  getOperationPanelMessage,
  isDependencyOperationBusy,
} from "./helpers";

export function useProjectOperationState() {
  const [dependencyOperations, setDependencyOperations] = useState<
    Record<string, OperationStatus>
  >({});
  const [projectStartFailures, setProjectStartFailures] = useState<Record<string, string>>({});
  const [projectOperationPanels, setProjectOperationPanels] = useState<
    Record<string, OperationEvent>
  >({});
  const operationPanelTimersRef = useRef<Map<string, number>>(new Map());

  const clearProjectOperationPanel = useCallback((projectId: string) => {
    const existingTimer = operationPanelTimersRef.current.get(projectId);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      operationPanelTimersRef.current.delete(projectId);
    }

    startTransition(() => {
      setProjectOperationPanels((current) => {
        if (!current[projectId]) {
          return current;
        }

        const next = { ...current };
        delete next[projectId];
        return next;
      });
    });
  }, []);

  const showProjectOperationPanel = useCallback(
    (event: OperationEvent, clearDelay?: number) => {
      if (!event.projectId) {
        return;
      }

      const projectId = event.projectId;

      const existingTimer = operationPanelTimersRef.current.get(projectId);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        operationPanelTimersRef.current.delete(projectId);
      }

      startTransition(() => {
        setProjectOperationPanels((current) => {
          const nextPanel = {
            ...event,
            message: getOperationPanelMessage(event),
          };
          const currentPanel = current[projectId];

          if (areOperationEventsEqual(currentPanel, nextPanel)) {
            return current;
          }

          return {
            ...current,
            [projectId]: nextPanel,
          };
        });
      });

      if (typeof clearDelay === "number" && clearDelay > 0) {
        const timer = window.setTimeout(() => {
          clearProjectOperationPanel(projectId);
        }, clearDelay);

        operationPanelTimersRef.current.set(projectId, timer);
      }
    },
    [clearProjectOperationPanel]
  );

  const clearProjectStartFailure = useCallback((projectId: string) => {
    startTransition(() => {
      setProjectStartFailures((current) => {
        if (!current[projectId]) {
          return current;
        }

        const next = { ...current };
        delete next[projectId];
        return next;
      });
    });
  }, []);

  const setProjectStartFailure = useCallback((projectId: string, message: string) => {
    startTransition(() => {
      setProjectStartFailures((current) => {
        if (current[projectId] === message) {
          return current;
        }

        return {
          ...current,
          [projectId]: message,
        };
      });
    });
  }, []);

  const setDependencyOperationStatus = useCallback(
    (projectId: string, status?: OperationStatus) => {
      startTransition(() => {
        setDependencyOperations((current) => {
          if (!status) {
            if (!current[projectId]) {
              return current;
            }

            const next = { ...current };
            delete next[projectId];
            return next;
          }

          if (current[projectId] === status) {
            return current;
          }

          return {
            ...current,
            [projectId]: status,
          };
        });
      });
    },
    []
  );

  const isProjectDependencyOperationLocked = useCallback(
    (projectId: string) => isDependencyOperationBusy(dependencyOperations[projectId]),
    [dependencyOperations]
  );

  useEffect(() => {
    return () => {
      for (const timer of operationPanelTimersRef.current.values()) {
        window.clearTimeout(timer);
      }

      operationPanelTimersRef.current.clear();
    };
  }, []);

  return {
    clearProjectOperationPanel,
    clearProjectStartFailure,
    dependencyOperations,
    isProjectDependencyOperationLocked,
    projectOperationPanels,
    projectStartFailures,
    setDependencyOperationStatus,
    setProjectStartFailure,
    showProjectOperationPanel,
  };
}
