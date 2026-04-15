use crate::contracts::{normalize_node_version, BackendErrorCode, ProjectRuntime};
use crate::node_manager::list_installed_node_versions;

pub fn select_retry_node_version(selected_node_version: &str) -> Option<String> {
    let selected_major = normalize_node_version(selected_node_version)
        .split('.')
        .next()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(0);

    if selected_major < 22 {
        return None;
    }

    let selected_node_version = normalize_node_version(selected_node_version);
    let installed_versions = list_installed_node_versions();

    for major in ["20", "18", "16"] {
        if let Some(version) = installed_versions.iter().find(|version| {
            let normalized = normalize_node_version(version);
            normalized != selected_node_version && normalized.starts_with(&format!("{major}."))
        }) {
            return Some(normalize_node_version(version));
        }
    }

    installed_versions
        .into_iter()
        .map(|version| normalize_node_version(&version))
        .find(|version| version != &selected_node_version)
}

pub fn classify_runtime_failure(
    failure_text: &str,
    selected_node_version: &str,
) -> (Option<BackendErrorCode>, Option<String>) {
    if failure_text.trim().is_empty() {
        return (Some(BackendErrorCode::Unknown), None);
    }

    let normalized = failure_text.to_lowercase();

    if normalized.contains("err_unsupported_esm_url_scheme")
        || normalized.contains("received protocol 'c:'")
    {
        return (
            Some(BackendErrorCode::NodeVersionMismatch),
            select_retry_node_version(selected_node_version),
        );
    }

    if normalized.contains("cannot find module")
        || normalized.contains("module not found")
        || normalized.contains("node_modules")
    {
        return (Some(BackendErrorCode::MissingDependencies), None);
    }

    if normalized.contains("fnm")
        && (normalized.contains("未检测到")
            || normalized.contains("not recognized")
            || normalized.contains("无法自动安装"))
    {
        return (Some(BackendErrorCode::NodeManagerMissing), None);
    }

    if normalized.contains("package manager")
        || normalized.contains("pnpm")
        || normalized.contains("yarn")
        || normalized.contains("cnpm")
    {
        return (Some(BackendErrorCode::PackageManagerMissing), None);
    }

    if normalized.contains("missing script")
        || normalized.contains("start command")
        || normalized.contains("is not recognized as an internal or external command")
        || normalized.contains("command not found")
    {
        return (Some(BackendErrorCode::StartCommandMissing), None);
    }

    if normalized.contains("failed")
        || normalized.contains("exit code")
        || normalized.contains("exited with")
    {
        return (Some(BackendErrorCode::StartupCommandFailed), None);
    }

    (Some(BackendErrorCode::Unknown), None)
}

pub fn build_runtime_failure_message(runtime: &ProjectRuntime) -> String {
    if let Some(message) = runtime.last_message.as_ref().map(|value| value.trim()) {
        if !message.is_empty() {
            return message.to_string();
        }
    }

    if let Some(message) = runtime
        .recent_logs
        .iter()
        .rev()
        .map(|entry| entry.message.trim())
        .find(|message| !message.is_empty())
    {
        return message.to_string();
    }

    "启动失败，请查看终端输出。".to_string()
}
