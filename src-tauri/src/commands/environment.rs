use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::{
    contracts::{AppStartupSettings, DesktopEnvironment},
    lock_error,
    node_versions::install_node_version as install_node_version_impl,
    runtime::open_project_terminal as open_project_terminal_window,
    ManagedState,
};

use super::common::build_desktop_environment;

#[tauri::command]
pub fn get_environment() -> Result<DesktopEnvironment, String> {
    build_desktop_environment()
}

#[tauri::command]
pub async fn install_node_version(version: String) -> Result<(), String> {
    install_node_version_impl(&version).await
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
