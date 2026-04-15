import { coerce, satisfies } from "semver";
import {
  buildRunCommand,
  normalizeNodeVersion,
  type ProjectDirectoryInspection,
  type ProjectPackageManager,
} from "@/shared/contracts";

export type ProjectDraft = {
  id?: string;
  name: string;
  path: string;
  nodeVersion: string;
  packageManager: ProjectPackageManager | "";
  startCommand: string;
  autoStartOnAppLaunch: boolean;
  autoOpenLocalUrlOnStart: boolean;
};

export type DraftSuggestionSnapshot = {
  name: string;
  nodeVersion: string;
  startCommand: string;
  packageManager: ProjectPackageManager | "";
};

export const EMPTY_DRAFT_SUGGESTIONS: DraftSuggestionSnapshot = {
  name: "",
  nodeVersion: "",
  startCommand: "",
  packageManager: "",
};

export function createEmptyProjectDraft(): ProjectDraft {
  return {
    name: "",
    path: "",
    nodeVersion: "",
    packageManager: "",
    startCommand: "",
    autoStartOnAppLaunch: false,
    autoOpenLocalUrlOnStart: false,
  };
}

export function shouldApplySuggestedValue(currentValue: string, lastAppliedValue: string) {
  const trimmedCurrentValue = currentValue.trim();
  return trimmedCurrentValue.length === 0 || trimmedCurrentValue === lastAppliedValue.trim();
}

export function createSuggestionSnapshot(
  inspection: ProjectDirectoryInspection | null
): DraftSuggestionSnapshot {
  return {
    name: inspection?.suggestedName ?? "",
    nodeVersion: inspection?.nodeVersionHint ?? inspection?.recommendedNodeVersion ?? "",
    startCommand: "",
    packageManager: "",
  };
}

export function getSuggestedPackageManager(
  inspection: ProjectDirectoryInspection | null,
  availablePackageManagers: ProjectPackageManager[]
): ProjectPackageManager | "" {
  if (inspection?.packageManager) {
    return inspection.packageManager;
  }

  return availablePackageManagers[0] ?? "";
}

export function getSuggestedStartCommand(
  inspection: ProjectDirectoryInspection | null,
  packageManager: ProjectPackageManager | ""
) {
  const scriptName =
    inspection?.availableStartCommands.find((command) => command.recommended)?.scriptName ??
    inspection?.availableStartCommands[0]?.scriptName ??
    null;

  if (!scriptName || !packageManager) {
    return "";
  }

  return buildRunCommand(packageManager, scriptName);
}

export function hasInstalledNodeVersion(installedNodeVersions: string[], nodeVersion: string) {
  return installedNodeVersions.some((installedVersion) =>
    doesNodeVersionSatisfyRequirement(installedVersion, nodeVersion)
  );
}

export function mergeNodeVersionLists(...versionGroups: string[][]) {
  const mergedVersions: string[] = [];

  for (const versions of versionGroups) {
    for (const version of versions) {
      const normalizedVersion = normalizeNodeVersion(version);
      if (
        normalizedVersion &&
        !mergedVersions.some((currentVersion) => currentVersion === normalizedVersion)
      ) {
        mergedVersions.push(normalizedVersion);
      }
    }
  }

  return mergedVersions;
}

export function getMissingNodeVersions(
  installedNodeVersions: string[],
  externalNodeVersions: string[]
) {
  const normalizedInstalledVersions = installedNodeVersions.map((version) =>
    normalizeNodeVersion(version)
  );

  return externalNodeVersions
    .map((version) => normalizeNodeVersion(version))
    .filter(
      (version, index, currentVersions) =>
        Boolean(version) &&
        !normalizedInstalledVersions.includes(version) &&
        currentVersions.indexOf(version) === index
    )
    .sort(compareNodeVersionsDesc);
}

export function selectBestAvailableNodeVersion(
  recommendedVersion: string | null | undefined,
  installedNodeVersions: string[],
  activeNodeVersion?: string | null
) {
  if (installedNodeVersions.length === 0) {
    return "";
  }

  if (!recommendedVersion) {
    return selectPreferredInstalledNodeVersion(installedNodeVersions, activeNodeVersion);
  }

  const normalizedRecommendedVersion = normalizeNodeVersion(recommendedVersion);
  const recommendedMajor = normalizedRecommendedVersion.split(".")[0];

  const normalizedInstalledVersions = installedNodeVersions.map((version) =>
    normalizeNodeVersion(version)
  );

  const exactMatch = normalizedInstalledVersions.find(
    (version) => version === normalizedRecommendedVersion
  );
  if (exactMatch) {
    return exactMatch;
  }

  const compatibleMatches = normalizedInstalledVersions.filter((version) =>
    isVersionCompatible(version, normalizedRecommendedVersion)
  );

  const sameMajorMatches = normalizedInstalledVersions
    .filter(
      (version) =>
        version.split(".")[0] === recommendedMajor &&
        compatibleMatches.includes(version)
    )
    .sort(compareNodeVersionsDesc);

  if (sameMajorMatches.length > 0) {
    return sameMajorMatches[0]!;
  }

  const otherCompatibleMatches = compatibleMatches
    .filter((version) => version.split(".")[0] !== recommendedMajor)
    .sort(compareNodeVersionsDesc);

  if (otherCompatibleMatches.length > 0) {
    return otherCompatibleMatches[0]!;
  }

  return "";
}

export function doesNodeVersionSatisfyRequirement(
  nodeVersion: string,
  requirement: string | null | undefined
) {
  if (!requirement?.trim()) {
    return true;
  }

  return isVersionCompatible(nodeVersion, requirement);
}

function selectPreferredInstalledNodeVersion(
  installedNodeVersions: string[],
  activeNodeVersion?: string | null
) {
  const normalizedInstalledVersions = installedNodeVersions.map((version) =>
    normalizeNodeVersion(version)
  );

  if (activeNodeVersion) {
    const normalizedActiveVersion = normalizeNodeVersion(activeNodeVersion);
    const activeMatch = normalizedInstalledVersions.find(
      (version) => version === normalizedActiveVersion
    );

    if (activeMatch) {
      return activeMatch;
    }
  }

  const stableMajors = ["24", "22", "20", "18", "16", "14", "12", "10"];

  for (const major of stableMajors) {
    const matched = normalizedInstalledVersions
      .filter((version) => version.split(".")[0] === major)
      .sort(compareNodeVersionsDesc)[0];

    if (matched) {
      return matched;
    }
  }

  return [...normalizedInstalledVersions].sort(compareNodeVersionsDesc)[0] ?? "";
}

function isVersionCompatible(installedVersion: string, recommendedVersion: string) {
  const normalizedInstalledVersion = normalizeNodeVersion(installedVersion);
  const normalizedRecommendedVersion = normalizeNodeVersion(recommendedVersion);

  if (normalizedInstalledVersion === normalizedRecommendedVersion) {
    return true;
  }

  const coercedInstalledVersion = coerce(normalizedInstalledVersion);
  if (!coercedInstalledVersion) {
    return false;
  }

  try {
    return satisfies(coercedInstalledVersion, normalizedRecommendedVersion, {
      includePrerelease: false,
      loose: true,
    });
  } catch {
    const recommendedMajor = normalizedRecommendedVersion.split(".")[0];
    return normalizedInstalledVersion.split(".")[0] === recommendedMajor;
  }
}

function compareNodeVersionsDesc(left: string, right: string) {
  const leftParts = left.split(".").map((part) => Number(part) || 0);
  const rightParts = right.split(".").map((part) => Number(part) || 0);

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}
