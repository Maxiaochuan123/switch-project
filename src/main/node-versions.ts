import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { normalizeNodeVersion } from "../shared/contracts";

function getDefaultNvmHome() {
  return process.env.NVM_HOME ?? path.join(homedir(), "AppData", "Local", "nvm");
}

function compareNodeVersions(left: string, right: string) {
  const leftParts = normalizeNodeVersion(left)
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = normalizeNodeVersion(right)
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart !== rightPart) {
      return rightPart - leftPart;
    }
  }

  return 0;
}

export function resolveNvmHome() {
  const nvmHome = getDefaultNvmHome();
  return existsSync(nvmHome) ? nvmHome : null;
}

export function listInstalledNodeVersions() {
  const nvmHome = resolveNvmHome();

  if (!nvmHome) {
    return [];
  }

  return readdirSync(nvmHome, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^v\d+\.\d+\.\d+$/.test(entry.name))
    .map((entry) => entry.name.replace(/^v/, ""))
    .sort(compareNodeVersions);
}

export function hasInstalledNodeVersion(nodeVersion: string) {
  const normalizedVersion = normalizeNodeVersion(nodeVersion);
  return listInstalledNodeVersions().includes(normalizedVersion);
}
