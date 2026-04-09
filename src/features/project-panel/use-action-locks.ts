import { useCallback, useEffect, useRef, useState } from "react";

export function useActionLocks() {
  const [, setActionLocks] = useState<Record<string, boolean>>({});
  const actionLocksRef = useRef<Set<string>>(new Set());
  const cooldownTimersRef = useRef<Map<string, number>>(new Map());

  const isActionLocked = useCallback((key: string) => actionLocksRef.current.has(key), []);

  const setActionLock = useCallback((key: string, locked: boolean) => {
    if (locked) {
      actionLocksRef.current.add(key);
    } else {
      actionLocksRef.current.delete(key);
    }

    setActionLocks((current) => {
      if (locked) {
        if (current[key]) {
          return current;
        }

        return { ...current, [key]: true };
      }

      if (!current[key]) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const runLockedAction = useCallback(
    async (key: string, action: () => Promise<void> | void, cooldownMs = 0) => {
      if (isActionLocked(key)) {
        return;
      }

      const existingTimer = cooldownTimersRef.current.get(key);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        cooldownTimersRef.current.delete(key);
      }

      setActionLock(key, true);

      try {
        await action();
      } finally {
        if (cooldownMs > 0) {
          const timer = window.setTimeout(() => {
            cooldownTimersRef.current.delete(key);
            setActionLock(key, false);
          }, cooldownMs);

          cooldownTimersRef.current.set(key, timer);
        } else {
          setActionLock(key, false);
        }
      }
    },
    [isActionLocked, setActionLock]
  );

  useEffect(() => {
    return () => {
      for (const timer of cooldownTimersRef.current.values()) {
        window.clearTimeout(timer);
      }

      cooldownTimersRef.current.clear();
    };
  }, []);

  return {
    isActionLocked,
    runLockedAction,
  };
}
