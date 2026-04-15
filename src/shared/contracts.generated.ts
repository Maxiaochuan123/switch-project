// This file is generated from Rust contracts. Do not edit by hand.
// Run `npm run contracts:generate` to refresh it.

export type BackendErrorCode = "unknown" | "invalid-project" | "project-not-found" | "project-running" | "project-path-missing" | "node-version-mismatch" | "node-version-missing" | "missing-dependencies" | "package-manager-missing" | "start-command-missing" | "startup-command-failed" | "node-manager-missing" | "store-read-failed" | "store-write-failed" | "import-failed" | "export-failed";

export type BackendError = { code: BackendErrorCode, message: string, detail?: string, };

export type ProjectStatus = "stopped" | "starting" | "running" | "error";

export type ProjectPackageManager = "npm" | "pnpm" | "cnpm" | "yarn";

export type ProjectConfig = { id: string, name: string, path: string, groupId: string | null, nodeVersion: string, packageManager: ProjectPackageManager, startCommand: string, autoStartOnAppLaunch: boolean, autoOpenLocalUrlOnStart: boolean, };

export type ProjectGroup = { id: string, name: string, order: number, };

export type ProjectAddressKind = "local" | "network" | "other";

export type ProjectAddress = { url: string, kind: ProjectAddressKind, label: string, discoveredAt: string, };

export type ProjectLogLevel = "stdout" | "stderr" | "system";

export type ProjectLogEntry = { id: string, at: string, level: ProjectLogLevel, message: string, };

export type ProjectRuntime = { projectId: string, status: ProjectStatus, pid?: number, startedAt?: string, exitCode?: number, lastMessage?: string, failureMessage?: string, failureCode?: BackendErrorCode, suggestedNodeVersion?: string, detectedUrl?: string, detectedAddresses: Array<ProjectAddress>, startupDurationMs?: number, lastSuccessAt?: string, recentLogs: Array<ProjectLogEntry>, };

export type NodeManagerKind = "fnm";

export type NodeManagerInstallAttempt = { installer: string, command: string, exitCode?: number, stdout?: string, stderr?: string, };

export type NodeManagerInstallResult = { success: boolean, message: string, installer?: string, version?: string, attempts: Array<NodeManagerInstallAttempt>, };

export type DesktopEnvironment = { installedNodeVersions: Array<string>, nvmInstalledNodeVersions: Array<string>, activeNodeVersion: string | null, availablePackageManagers: Array<ProjectPackageManager>, rimrafInstalled: boolean, nodeManager: NodeManagerKind, nodeManagerAvailable: boolean, nodeManagerVersion: string | null, };

export type ProjectNodeVersionSource = "nvmrc" | "node-version" | "volta" | "package-engines";

export type ProjectCommandSuggestion = { scriptName: string, command: string, recommended: boolean, };

export type ProjectReadiness = { nodeInstalled: boolean, packageManagerAvailable: boolean, hasNodeModules: boolean, canStart: boolean, warnings: Array<string>, };

export type ProjectDirectoryInspection = { exists: boolean, isDirectory: boolean, hasPackageJson: boolean, hasNodeModules: boolean, suggestedName: string | null, recommendedNodeVersion: string | null, nodeVersionHint: string | null, nodeVersionSource: ProjectNodeVersionSource | null, packageManager: ProjectPackageManager | null, recommendedStartCommand: string | null, availableStartCommands: Array<ProjectCommandSuggestion>, readiness: ProjectReadiness, };

export type ProjectDiagnosis = { projectId: string, projectName: string, readiness: ProjectReadiness, pathExists: boolean, hasPackageJson: boolean, startCommandAvailable: boolean, nodeVersion: string, packageManager: ProjectPackageManager, startCommand: string, };

export type AppStartupSettings = { openAtLogin: boolean, launchMinimizedOnLogin: boolean, };

export type ProjectPanelSnapshot = { projects: Array<ProjectConfig>, projectGroups: Array<ProjectGroup>, runtimes: Array<ProjectRuntime>, environment: DesktopEnvironment, startupSettings: AppStartupSettings, };

export type ProjectGroupsExport = { projectGroups: Array<ProjectGroup>, projects: Array<ProjectConfig>, };

export type ProjectStartPreflight = { canStart: boolean, missingDependencies: boolean, selectedNodeVersion: string, hasDeclaredNodeRequirement: boolean, suggestedNodeVersion?: string, installNodeVersion?: string, reasonCode?: BackendErrorCode, reasonMessage?: string, };

export type AppCloseRequest = { activeProjectCount: number, activeProjectNames: Array<string>, };

export type DependencyOperation = "delete" | "reinstall";

export type OperationType = "dependency-delete" | "dependency-reinstall" | "node-install" | "project-start-preflight" | "project-diagnose";

export type OperationStatus = "queued" | "running" | "success" | "error";

export type OperationEvent = { operationId: string, type: OperationType, status: OperationStatus, title: string, projectId?: string, projectName?: string, message?: string, error?: BackendError, };

export type ImportProjectsResult = { added: number, updated: number, skipped: number, };
