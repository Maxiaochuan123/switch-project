import type { DesktopApi } from "@/shared/contracts";
import { desktopCommands } from "./desktop/commands";
import { desktopSubscriptions } from "./desktop/events";

export const desktopApi: DesktopApi = {
  ...desktopCommands,
  ...desktopSubscriptions,
};
