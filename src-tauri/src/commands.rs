use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::{
    contracts::{
        AppStartupSettings, DependencyOperation, DesktopEnvironment, ImportProjectsResult,
        ProjectConfig, ProjectDiagnosis, ProjectDirectoryInspection, ProjectRuntime,
    },
    lock_error,
    node_versions::{
        install_node_version as install_node_version_impl, list_installed_node_versions,
        resolve_active_node_version, resolve_nvm_home,
    },
    package_managers::list_available_package_managers,
    project_directory::inspect_project_directory as inspect_project_directory_impl,
    runtime::{
        ensure_delete_tool_ready, is_delete_tool_ready,
        open_project_terminal as open_project_terminal_window, run_delete_project_node_modules_task,
        run_reinstall_project_node_modules_task,
    },
    ManagedState,
};

fn get_project(state: &State<ManagedState>, project_id: &str) -> Result<ProjectConfig, String> {
    state
        .store
        .lock()
        .map_err(lock_error)?
        .get_project(project_id)
        .ok_or_else(|| "项目不存在。".to_string())
}

#[tauri::command]
pub fn list_projects(state: State<ManagedState>) -> Result<Vec<ProjectConfig>, String> {
    Ok(state.store.lock().map_err(lock_error)?.list_projects())
}

#[tauri::command]
pub fn save_project(state: State<ManagedState>, project: ProjectConfig) -> Result<(), String> {
    state.store.lock().map_err(lock_error)?.save_project(project)
}

#[tauri::command]
pub fn delete_project(
    app: AppHandle,
    state: State<ManagedState>,
    project_id: String,
) -> Result<(), String> {
    state.runtime_manager.stop_project(&app, &project_id)?;
    state.store.lock().map_err(lock_error)?.delete_project(&project_id)
}

#[tauri::command]
pub fn list_runtimes(state: State<ManagedState>) -> Result<Vec<ProjectRuntime>, String> {
    Ok(state.runtime_manager.list_runtimes())
}

#[tauri::command]
pub fn diagnose_project(
    state: State<ManagedState>,
    project_id: String,
) -> Result<ProjectDiagnosis, String> {
    let project = get_project(&state, &project_id)?;
    let inspection = inspect_project_directory_impl(&project.path, &list_installed_node_versions());

    Ok(ProjectDiagnosis {
        project_id: project.id,
        project_name: project.name,
        readiness: inspection.readiness.clone(),
        path_exists: inspection.exists && inspection.is_directory,
        has_package_json: inspection.has_package_json,
        start_command_available: !project.start_command.trim().is_empty(),
        node_version: project.node_version,
        package_manager: project.package_manager,
        start_command: project.start_command,
    })
}

#[tauri::command]
pub fn inspect_project_directory(project_path: String) -> Result<ProjectDirectoryInspection, String> {
    Ok(inspect_project_directory_impl(
        &project_path,
        &list_installed_node_versions(),
    ))
}

#[tauri::command]
pub fn get_environment() -> Result<DesktopEnvironment, String> {
    Ok(DesktopEnvironment {
        installed_node_versions: list_installed_node_versions(),
        active_node_version: resolve_active_node_version(),
        available_package_managers: list_available_package_managers(),
        rimraf_installed: is_delete_tool_ready()?,
        nvm_home: resolve_nvm_home().map(|value| value.to_string_lossy().to_string()),
    })
}

#[tauri::command]
pub fn import_projects(
    state: State<ManagedState>,
    file_path: String,
) -> Result<ImportProjectsResult, String> {
    state
        .store
        .lock()
        .map_err(lock_error)?
        .import_projects(&file_path)
}

#[tauri::command]
pub fn export_projects(state: State<ManagedState>, file_path: String) -> Result<(), String> {
    state
        .store
        .lock()
        .map_err(lock_error)?
        .export_projects(&file_path)
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
pub async fn start_project(
    app: AppHandle,
    state: State<'_, ManagedState>,
    project_id: String,
) -> Result<(), String> {
    let project = get_project(&state, &project_id)?;
    state.runtime_manager.start_project(&app, project).await
}

#[tauri::command]
pub fn stop_project(
    app: AppHandle,
    state: State<'_, ManagedState>,
    project_id: String,
) -> Result<(), String> {
    state.runtime_manager.stop_project(&app, &project_id)
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

#[tauri::command]
pub fn minimize_app_to_tray(app: AppHandle, state: State<ManagedState>) -> Result<(), String> {
    *state.pending_close_request.lock().map_err(lock_error)? = None;

    if let Some(window) = app.get_webview_window("main") {
        window
            .hide()
            .map_err(|error| format!("最小化到托盘失败: {error}"))?;
    }

    Ok(())
}

#[tauri::command]
pub fn delete_project_node_modules(
    app: AppHandle,
    state: State<'_, ManagedState>,
    project_id: String,
) -> Result<(), String> {
    let project = get_project(&state, &project_id)?;

    if state.runtime_manager.is_project_active(&project.id) {
        return Err("项目正在运行中，请先停止后再删除依赖。".to_string());
    }

    state
        .runtime_manager
        .begin_dependency_operation(&project.id, DependencyOperation::Delete)?;

    tauri::async_runtime::spawn(async move {
        run_delete_project_node_modules_task(app, project).await;
    });

    Ok(())
}

#[tauri::command]
pub fn reinstall_project_node_modules(
    app: AppHandle,
    state: State<'_, ManagedState>,
    project_id: String,
) -> Result<(), String> {
    let project = get_project(&state, &project_id)?;

    if state.runtime_manager.is_project_active(&project.id) {
        return Err("项目正在运行中，请先停止后再重装依赖。".to_string());
    }

    state
        .runtime_manager
        .begin_dependency_operation(&project.id, DependencyOperation::Reinstall)?;

    tauri::async_runtime::spawn(async move {
        run_reinstall_project_node_modules_task(app, project).await;
    });

    Ok(())
}

#[tauri::command]
pub async fn ensure_delete_tool() -> Result<bool, String> {
    ensure_delete_tool_ready().await
}

#[tauri::command]
pub fn confirm_app_close(app: AppHandle, state: State<ManagedState>) -> Result<(), String> {
    *state.pending_close_request.lock().map_err(lock_error)? = None;
    state.allow_window_close.store(true, std::sync::atomic::Ordering::SeqCst);
    state.runtime_manager.stop_all_sync();
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn cancel_app_close(state: State<ManagedState>) -> Result<(), String> {
    *state.pending_close_request.lock().map_err(lock_error)? = None;
    Ok(())
}
