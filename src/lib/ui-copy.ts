import type { ProjectStatus } from "@/shared/contracts";

export const COPY_FEEDBACK_DURATION_MS = 1600;

export function getDefaultErrorMessage() {
  return "操作失败，请稍后重试。";
}

export function getProjectStatusLabel(status?: ProjectStatus) {
  switch (status) {
    case "running":
      return "运行中";
    case "starting":
      return "启动中";
    case "error":
      return "异常";
    default:
      return "已停止";
  }
}
