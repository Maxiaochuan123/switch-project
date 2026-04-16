use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::{
    contracts::{
        normalize_node_version, AppStartupSettings, DesktopEnvironment, NodeManagerInstallResult,
        NodeVersionManagerSnapshot, NodeVersionUsageProject,
    },
    lock_error,
    node_manager::{
        clear_node_manager_cache, delete_node_version as delete_node_version_impl,
        install_node_manager as install_node_manager_impl,
        install_node_version as install_node_version_impl, list_latest_lts_node_versions,
        resolve_active_node_version, resolve_default_node_version,
        set_default_node_version as set_default_node_version_impl,
    },
    runtime::{
        clear_command_resolution_cache, open_project_terminal as open_project_terminal_window,
    },
    ManagedState,
};

use super::common::build_desktop_environment;

#[tauri::command]
pub fn get_environment() -> Result<DesktopEnvironment, String> {
    build_desktop_environment()
}

#[tauri::command]
pub async fn install_node_manager() -> NodeManagerInstallResult {
    let result = install_node_manager_impl().await;
    if result.success {
        clear_node_manager_cache();
        clear_command_resolution_cache();
    }

    result
}

#[tauri::command]
pub async fn install_node_version(version: String) -> Result<(), String> {
    install_node_version_impl(&version).await?;
    clear_node_manager_cache();
    clear_command_resolution_cache();
    Ok(())
}

#[tauri::command]
pub async fn delete_node_version(version: String) -> Result<(), String> {
    delete_node_version_impl(&version).await?;
    clear_node_manager_cache();
    clear_command_resolution_cache();
    Ok(())
}

#[tauri::command]
pub async fn set_default_node_version(version: String) -> Result<(), String> {
    set_default_node_version_impl(&version).await?;
    clear_node_manager_cache();
    clear_command_resolution_cache();
    Ok(())
}

#[tauri::command]
pub async fn get_node_version_manager_snapshot(
    state: State<'_, ManagedState>,
) -> Result<NodeVersionManagerSnapshot, String> {
    let projects = state.store.lock().map_err(lock_error)?.list_projects();
    let mut usage_by_version = std::collections::HashMap::new();

    for project in projects {
        let normalized_version = normalize_node_version(&project.node_version);
        if normalized_version.is_empty() {
            continue;
        }

        usage_by_version
            .entry(normalized_version)
            .or_insert_with(Vec::new)
            .push(NodeVersionUsageProject {
                project_id: project.id,
                project_name: project.name,
            });
    }

    let latest_lts_versions_result = list_latest_lts_node_versions().await;

    Ok(NodeVersionManagerSnapshot {
        installed_versions: crate::node_manager::list_installed_node_versions(),
        latest_lts_versions: latest_lts_versions_result.clone().unwrap_or_default(),
        latest_lts_error: latest_lts_versions_result.err(),
        active_node_version: resolve_active_node_version(),
        default_node_version: resolve_default_node_version(),
        usage_by_version,
    })
}

#[tauri::command]
pub fn get_app_startup_settings(state: State<ManagedState>) -> Result<AppStartupSettings, String> {
    Ok(state
        .store
        .lock()
        .map_err(lock_error)?
        .get_app_startup_settings())
}

#[tauri::command]
pub fn save_app_startup_settings(
    state: State<ManagedState>,
    settings: AppStartupSettings,
) -> Result<(), String> {
    state
        .store
        .lock()
        .map_err(lock_error)?
        .save_app_startup_settings(settings)
}

#[tauri::command]
pub fn open_project_directory(app: AppHandle, project_path: String) -> Result<(), String> {
    app.opener()
        .open_path(project_path, None::<&str>)
        .map_err(|error| format!("打开目录失败: {error}"))
}

#[tauri::command]
pub fn open_project_terminal(project_path: String, node_version: String) -> Result<(), String> {
    open_project_terminal_window(&project_path, &node_version)
}

#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| format!("打开地址失败: {error}"))
}
