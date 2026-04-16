use std::{collections::HashMap, fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use ts_rs::{Config as TsConfig, TS};

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum BackendErrorCode {
    Unknown,
    InvalidProject,
    ProjectNotFound,
    ProjectRunning,
    ProjectPathMissing,
    NodeVersionMismatch,
    NodeVersionMissing,
    MissingDependencies,
    PackageManagerMissing,
    StartCommandMissing,
    StartupCommandFailed,
    NodeManagerMissing,
    StoreReadFailed,
    StoreWriteFailed,
    ImportFailed,
    ExportFailed,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(optional_fields)]
pub struct BackendError {
    pub code: BackendErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    pub node_version: String,
    #[serde(default = "default_project_package_manager")]
    pub package_manager: ProjectPackageManager,
    pub start_command: String,
    #[serde(default)]
    pub auto_start_on_app_launch: bool,
    #[serde(default)]
    pub auto_open_local_url_on_start: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGroup {
    pub id: String,
    pub name: String,
    pub order: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "lowercase")]
pub enum ProjectStatus {
    Stopped,
    Starting,
    Running,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "lowercase")]
pub enum ProjectAddressKind {
    Local,
    Network,
    Other,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "lowercase")]
pub enum ProjectLogLevel {
    Stdout,
    Stderr,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAddress {
    pub url: String,
    pub kind: ProjectAddressKind,
    pub label: String,
    pub discovered_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLogEntry {
    pub id: String,
    pub at: String,
    pub level: ProjectLogLevel,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(optional_fields)]
pub struct ProjectRuntime {
    pub project_id: String,
    pub status: ProjectStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_code: Option<BackendErrorCode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggested_node_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detected_url: Option<String>,
    #[serde(default)]
    pub detected_addresses: Vec<ProjectAddress>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub startup_duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_success_at: Option<String>,
    #[serde(default)]
    pub recent_logs: Vec<ProjectLogEntry>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "lowercase")]
pub enum NodeManagerKind {
    Fnm,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(optional_fields)]
pub struct NodeManagerInstallAttempt {
    pub installer: String,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdout: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stderr: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(optional_fields)]
pub struct NodeManagerInstallResult {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(default)]
    pub attempts: Vec<NodeManagerInstallAttempt>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DesktopEnvironment {
    pub installed_node_versions: Vec<String>,
    #[serde(default)]
    pub nvm_installed_node_versions: Vec<String>,
    pub active_node_version: Option<String>,
    pub default_node_version: Option<String>,
    pub available_package_managers: Vec<ProjectPackageManager>,
    pub rimraf_installed: bool,
    pub node_manager: NodeManagerKind,
    pub node_manager_available: bool,
    pub node_manager_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct NodeVersionUsageProject {
    pub project_id: String,
    pub project_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(optional_fields)]
pub struct NodeVersionManagerSnapshot {
    #[serde(default)]
    pub installed_versions: Vec<String>,
    #[serde(default)]
    pub latest_lts_versions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_lts_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_node_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_node_version: Option<String>,
    #[serde(default)]
    pub usage_by_version: HashMap<String, Vec<NodeVersionUsageProject>>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectNodeVersionSource {
    Nvmrc,
    NodeVersion,
    Volta,
    PackageEngines,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "lowercase")]
pub enum ProjectPackageManager {
    Npm,
    Pnpm,
    Cnpm,
    Yarn,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCommandSuggestion {
    pub script_name: String,
    pub command: String,
    pub recommended: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDirectoryInspection {
    pub exists: bool,
    pub is_directory: bool,
    pub has_package_json: bool,
    pub has_node_modules: bool,
    pub suggested_name: Option<String>,
    pub recommended_node_version: Option<String>,
    pub node_version_hint: Option<String>,
    pub node_version_source: Option<ProjectNodeVersionSource>,
    pub package_manager: Option<ProjectPackageManager>,
    pub recommended_start_command: Option<String>,
    #[serde(default)]
    pub available_start_commands: Vec<ProjectCommandSuggestion>,
    pub readiness: ProjectReadiness,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectReadiness {
    pub node_installed: bool,
    pub package_manager_available: bool,
    pub has_node_modules: bool,
    pub can_start: bool,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDiagnosis {
    pub project_id: String,
    pub project_name: String,
    pub readiness: ProjectReadiness,
    pub path_exists: bool,
    pub has_package_json: bool,
    pub start_command_available: bool,
    pub node_version: String,
    pub package_manager: ProjectPackageManager,
    pub start_command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPanelSnapshot {
    pub projects: Vec<ProjectConfig>,
    pub project_groups: Vec<ProjectGroup>,
    pub runtimes: Vec<ProjectRuntime>,
    pub environment: DesktopEnvironment,
    pub startup_settings: AppStartupSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(optional_fields)]
pub struct ProjectStartPreflight {
    pub can_start: bool,
    pub missing_dependencies: bool,
    pub selected_node_version: String,
    pub has_declared_node_requirement: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggested_node_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_node_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason_code: Option<BackendErrorCode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AppStartupSettings {
    #[serde(default)]
    pub open_at_login: bool,
    #[serde(default)]
    pub launch_minimized_on_login: bool,
}

impl Default for AppStartupSettings {
    fn default() -> Self {
        Self {
            open_at_login: false,
            launch_minimized_on_login: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AppCloseRequest {
    pub active_project_count: usize,
    pub active_project_names: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "lowercase")]
pub enum DependencyOperation {
    Delete,
    Reinstall,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "kebab-case")]
pub enum OperationType {
    DependencyDelete,
    DependencyReinstall,
    NodeInstall,
    ProjectStartPreflight,
    ProjectDiagnose,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "lowercase")]
pub enum OperationStatus {
    Queued,
    Running,
    Success,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(optional_fields)]
pub struct OperationEvent {
    pub operation_id: String,
    #[serde(rename = "type")]
    pub operation_type: OperationType,
    pub status: OperationStatus,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BackendError>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ImportProjectsResult {
    pub added: usize,
    pub updated: usize,
    pub skipped: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGroupsExport {
    #[serde(default)]
    pub project_groups: Vec<ProjectGroup>,
    #[serde(default)]
    pub projects: Vec<ProjectConfig>,
}

pub fn normalize_node_version(value: &str) -> String {
    value.trim().trim_start_matches(['v', 'V']).to_string()
}

pub fn default_project_package_manager() -> ProjectPackageManager {
    ProjectPackageManager::Npm
}

pub fn build_run_command(package_manager: ProjectPackageManager, script_name: &str) -> String {
    match package_manager {
        ProjectPackageManager::Npm => format!("npm run {script_name}"),
        ProjectPackageManager::Pnpm => format!("pnpm {script_name}"),
        ProjectPackageManager::Cnpm => format!("cnpm run {script_name}"),
        ProjectPackageManager::Yarn => format!("yarn {script_name}"),
    }
}

pub fn build_install_command(package_manager: ProjectPackageManager) -> String {
    match package_manager {
        ProjectPackageManager::Npm => "npm install".to_string(),
        ProjectPackageManager::Pnpm => "pnpm install".to_string(),
        ProjectPackageManager::Cnpm => "cnpm install".to_string(),
        ProjectPackageManager::Yarn => "yarn install".to_string(),
    }
}

pub fn package_manager_command_name(package_manager: ProjectPackageManager) -> &'static str {
    match package_manager {
        ProjectPackageManager::Npm => "npm",
        ProjectPackageManager::Pnpm => "pnpm",
        ProjectPackageManager::Cnpm => "cnpm",
        ProjectPackageManager::Yarn => "yarn",
    }
}

pub fn backend_error(code: BackendErrorCode, message: impl Into<String>) -> BackendError {
    BackendError {
        code,
        message: message.into(),
        detail: None,
    }
}

pub fn export_typescript_contracts() -> Result<PathBuf, String> {
    let output_path = generated_typescript_contracts_path();
    let contents = build_typescript_contracts();

    fs::write(&output_path, contents)
        .map_err(|error| format!("failed to write TypeScript contracts: {error}"))?;

    Ok(output_path)
}

fn build_typescript_contracts() -> String {
    let config = TsConfig::new().with_large_int("number");
    let mut sections = Vec::new();

    push_typescript_declaration::<BackendErrorCode>(&mut sections, &config);
    push_typescript_declaration::<BackendError>(&mut sections, &config);
    push_typescript_declaration::<ProjectStatus>(&mut sections, &config);
    push_typescript_declaration::<ProjectPackageManager>(&mut sections, &config);
    push_typescript_declaration::<ProjectConfig>(&mut sections, &config);
    push_typescript_declaration::<ProjectGroup>(&mut sections, &config);
    push_typescript_declaration::<ProjectAddressKind>(&mut sections, &config);
    push_typescript_declaration::<ProjectAddress>(&mut sections, &config);
    push_typescript_declaration::<ProjectLogLevel>(&mut sections, &config);
    push_typescript_declaration::<ProjectLogEntry>(&mut sections, &config);
    push_typescript_declaration::<ProjectRuntime>(&mut sections, &config);
    push_typescript_declaration::<NodeManagerKind>(&mut sections, &config);
    push_typescript_declaration::<NodeManagerInstallAttempt>(&mut sections, &config);
    push_typescript_declaration::<NodeManagerInstallResult>(&mut sections, &config);
    push_typescript_declaration::<DesktopEnvironment>(&mut sections, &config);
    push_typescript_declaration::<NodeVersionUsageProject>(&mut sections, &config);
    push_typescript_declaration::<NodeVersionManagerSnapshot>(&mut sections, &config);
    push_typescript_declaration::<ProjectNodeVersionSource>(&mut sections, &config);
    push_typescript_declaration::<ProjectCommandSuggestion>(&mut sections, &config);
    push_typescript_declaration::<ProjectReadiness>(&mut sections, &config);
    push_typescript_declaration::<ProjectDirectoryInspection>(&mut sections, &config);
    push_typescript_declaration::<ProjectDiagnosis>(&mut sections, &config);
    push_typescript_declaration::<AppStartupSettings>(&mut sections, &config);
    push_typescript_declaration::<ProjectPanelSnapshot>(&mut sections, &config);
    push_typescript_declaration::<ProjectGroupsExport>(&mut sections, &config);
    push_typescript_declaration::<ProjectStartPreflight>(&mut sections, &config);
    push_typescript_declaration::<AppCloseRequest>(&mut sections, &config);
    push_typescript_declaration::<DependencyOperation>(&mut sections, &config);
    push_typescript_declaration::<OperationType>(&mut sections, &config);
    push_typescript_declaration::<OperationStatus>(&mut sections, &config);
    push_typescript_declaration::<OperationEvent>(&mut sections, &config);
    push_typescript_declaration::<ImportProjectsResult>(&mut sections, &config);

    format!(
        "// This file is generated from Rust contracts. Do not edit by hand.\n// Run `npm run contracts:generate` to refresh it.\n\n{}\n",
        sections.join("\n\n")
    )
}

fn push_typescript_declaration<T: TS>(sections: &mut Vec<String>, config: &TsConfig) {
    sections.push(format!("export {}", T::decl(config)));
}

fn generated_typescript_contracts_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/shared/contracts.generated.ts")
}

#[cfg(test)]
mod tests {
    use super::{build_typescript_contracts, generated_typescript_contracts_path};

    #[test]
    fn generated_typescript_contracts_are_in_sync() {
        let expected = build_typescript_contracts();
        let actual = std::fs::read_to_string(generated_typescript_contracts_path())
            .expect("generated TypeScript contracts should exist");

        assert_eq!(
            normalize_line_endings(&actual),
            normalize_line_endings(&expected),
            "generated TypeScript contracts are out of date; run `npm run contracts:generate`"
        );
    }

    fn normalize_line_endings(value: &str) -> String {
        value.replace("\r\n", "\n")
    }
}
