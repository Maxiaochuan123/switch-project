use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub id: String,
    pub name: String,
    pub path: String,
    pub node_version: String,
    pub start_command: String,
    #[serde(default)]
    pub auto_start_on_app_launch: bool,
    #[serde(default)]
    pub auto_open_local_url_on_start: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProjectStatus {
    Stopped,
    Starting,
    Running,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProjectAddressKind {
    Local,
    Network,
    Other,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProjectLogLevel {
    Stdout,
    Stderr,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAddress {
    pub url: String,
    pub kind: ProjectAddressKind,
    pub label: String,
    pub discovered_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLogEntry {
    pub id: String,
    pub at: String,
    pub level: ProjectLogLevel,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    pub detected_url: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub detected_addresses: Vec<ProjectAddress>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub startup_duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_success_at: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub recent_logs: Vec<ProjectLogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopEnvironment {
    pub installed_node_versions: Vec<String>,
    pub nvm_home: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectNodeVersionSource {
    Nvmrc,
    NodeVersion,
    Volta,
    PackageEngines,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProjectPackageManager {
    Npm,
    Pnpm,
    Yarn,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCommandSuggestion {
    pub script_name: String,
    pub command: String,
    pub recommended: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDirectoryInspection {
    pub exists: bool,
    pub is_directory: bool,
    pub has_package_json: bool,
    pub suggested_name: Option<String>,
    pub recommended_node_version: Option<String>,
    pub node_version_hint: Option<String>,
    pub node_version_source: Option<ProjectNodeVersionSource>,
    pub package_manager: Option<ProjectPackageManager>,
    pub recommended_start_command: Option<String>,
    #[serde(default)]
    pub available_start_commands: Vec<ProjectCommandSuggestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppCloseRequest {
    pub active_project_count: usize,
    pub active_project_names: Vec<String>,
}

pub fn normalize_node_version(value: &str) -> String {
    value.trim().trim_start_matches(['v', 'V']).to_string()
}
