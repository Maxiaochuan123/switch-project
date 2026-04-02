import type { DesktopApi } from "./shared/contracts";

declare global {
  interface Window {
    switchProjectApi: DesktopApi;
  }
}

export {};
