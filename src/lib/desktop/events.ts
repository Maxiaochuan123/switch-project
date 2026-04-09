import { listen } from "@tauri-apps/api/event";
import type {
  AppCloseRequest,
  DesktopApi,
  OperationEvent,
  ProjectRuntime,
} from "@/shared/contracts";

const EVENTS = {
  runtimeUpdate: "runtime-update",
  appCloseRequested: "app-close-requested",
  operation: "operation",
} as const;

function createSubscription<T>(eventName: string, listener: (payload: T) => void) {
  let disposed = false;
  const unlistenPromise = listen<T>(eventName, (event) => {
    if (!disposed) {
      listener(event.payload);
    }
  });

  return () => {
    disposed = true;
    void unlistenPromise.then((unlisten) => unlisten());
  };
}

export const desktopSubscriptions: Pick<
  DesktopApi,
  "subscribeRuntime" | "subscribeAppCloseRequest" | "subscribeOperation"
> = {
  subscribeRuntime: (listener) => createSubscription<ProjectRuntime>(EVENTS.runtimeUpdate, listener),
  subscribeAppCloseRequest: (listener) =>
    createSubscription<AppCloseRequest>(EVENTS.appCloseRequested, listener),
  subscribeOperation: (listener) => createSubscription<OperationEvent>(EVENTS.operation, listener),
};
