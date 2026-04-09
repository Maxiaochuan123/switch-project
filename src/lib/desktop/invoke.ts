import { invoke } from "@tauri-apps/api/core";

export async function invokeCommand<T>(command: string, payload?: Record<string, unknown>) {
  return invoke<T>(command, payload);
}
