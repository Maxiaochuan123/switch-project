mod contracts;
mod node_versions;
mod project_directory;
mod runtime;
mod store;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

use contracts::{
    AppCloseRequest, AppStartupSettings, DesktopEnvironment, ProjectConfig,
    ProjectDirectoryInspection, ProjectRuntime,
};
use node_versions::{list_installed_node_versions, resolve_nvm_home};
use project_directory::inspect_project_directory as inspect_project_directory_impl;
use runtime::{open_project_terminal as open_project_terminal_window, RuntimeManager};
use store::AppStore;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_opener::OpenerExt;

pub struct ManagedState {
    store: Mutex<AppStore>,
    runtime_manager: RuntimeManager,
    pending_close_request: Mutex<Option<AppCloseRequest>>,
    allow_window_close: AtomicBool,
}

#[tauri::command]
fn list_projects(state: State<ManagedState>) -> Result<Vec<ProjectConfig>, String> {
    Ok(state.store.lock().map_err(lock_error)?.list_projects())
}

#[tauri::command]
fn save_project(state: State<ManagedState>, project: ProjectConfig) -> Result<(), String> {
    state.store.lock().map_err(lock_error)?.save_project(project)
}

#[tauri::command]
fn delete_project(
    app: AppHandle,
    state: State<ManagedState>,
    project_id: String,
) -> Result<(), String> {
    state.runtime_manager.stop_project(&app, &project_id)?;
    state.store.lock().map_err(lock_error)?.delete_project(&project_id)
}

#[tauri::command]
fn list_runtimes(state: State<ManagedState>) -> Result<Vec<ProjectRuntime>, String> {
    Ok(state.runtime_manager.list_runtimes())
}

#[tauri::command]
fn inspect_project_directory(
    project_path: String,
) -> Result<ProjectDirectoryInspection, String> {
    Ok(inspect_project_directory_impl(
        &project_path,
        &list_installed_node_versions(),
    ))
}

#[tauri::command]
fn get_environment() -> Result<DesktopEnvironment, String> {
    Ok(DesktopEnvironment {
        installed_node_versions: list_installed_node_versions(),
        nvm_home: resolve_nvm_home().map(|value| value.to_string_lossy().to_string()),
    })
}

#[tauri::command]
fn get_app_startup_settings(state: State<ManagedState>) -> Result<AppStartupSettings, String> {
    Ok(state
        .store
        .lock()
        .map_err(lock_error)?
        .get_app_startup_settings())
}

#[tauri::command]
fn save_app_startup_settings(
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
async fn start_project(
    app: AppHandle,
    state: State<'_, ManagedState>,
    project_id: String,
) -> Result<(), String> {
    let project = state
        .store
        .lock()
        .map_err(lock_error)?
        .get_project(&project_id)
        .ok_or_else(|| "项目不存在。".to_string())?;

    state.runtime_manager.start_project(&app, project).await
}

#[tauri::command]
fn stop_project(
    app: AppHandle,
    state: State<'_, ManagedState>,
    project_id: String,
) -> Result<(), String> {
    state.runtime_manager.stop_project(&app, &project_id)
}

#[tauri::command]
fn open_project_directory(app: AppHandle, project_path: String) -> Result<(), String> {
    app.opener()
        .open_path(project_path, None::<&str>)
        .map_err(|error| format!("打开目录失败: {error}"))
}

#[tauri::command]
fn open_project_terminal(
    project_path: String,
    node_version: String,
) -> Result<(), String> {
    open_project_terminal_window(&project_path, &node_version)
}

#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| format!("打开地址失败: {error}"))
}

#[tauri::command]
fn confirm_app_close(app: AppHandle, state: State<ManagedState>) -> Result<(), String> {
    *state.pending_close_request.lock().map_err(lock_error)? = None;
    state.allow_window_close.store(true, Ordering::SeqCst);
    state.runtime_manager.stop_all_sync();
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn cancel_app_close(state: State<ManagedState>) -> Result<(), String> {
    *state.pending_close_request.lock().map_err(lock_error)? = None;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--autostart"])
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(ManagedState {
            store: Mutex::new(AppStore::load().expect("failed to load app store")),
            runtime_manager: RuntimeManager::new(),
            pending_close_request: Mutex::new(None),
            allow_window_close: AtomicBool::new(false),
        })
        .setup(|app| {
            let startup_settings = {
                let state = app.state::<ManagedState>();
                let settings = state
                    .store
                    .lock()
                    .map_err(lock_error)?
                    .get_app_startup_settings();
                settings
            };

            if is_autostart_launch() && startup_settings.launch_minimized_on_login {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.minimize();
                }
            }

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                run_project_autostart(app_handle).await;
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let state = app.state::<ManagedState>();

                if state.allow_window_close.load(Ordering::SeqCst) {
                    return;
                }

                let active_project_ids = state.runtime_manager.active_project_ids();
                if active_project_ids.is_empty() {
                    state.runtime_manager.stop_all_sync();
                    state.allow_window_close.store(true, Ordering::SeqCst);
                    return;
                }

                api.prevent_close();

                let mut pending_close_request = match state.pending_close_request.lock() {
                    Ok(value) => value,
                    Err(_) => return,
                };

                if pending_close_request.is_some() {
                    return;
                }

                let active_project_names = match state.store.lock() {
                    Ok(store) => store
                        .list_projects()
                        .into_iter()
                        .filter(|project| active_project_ids.iter().any(|id| id == &project.id))
                        .map(|project| project.name)
                        .take(3)
                        .collect::<Vec<_>>(),
                    Err(_) => Vec::new(),
                };

                let request = AppCloseRequest {
                    active_project_count: active_project_ids.len(),
                    active_project_names,
                };

                *pending_close_request = Some(request.clone());
                let _ = window.emit("app-close-requested", request);
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_projects,
            save_project,
            delete_project,
            list_runtimes,
            inspect_project_directory,
            get_environment,
            get_app_startup_settings,
            save_app_startup_settings,
            start_project,
            stop_project,
            open_project_directory,
            open_project_terminal,
            open_external,
            confirm_app_close,
            cancel_app_close
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                let state = app.state::<ManagedState>();
                state.runtime_manager.stop_all_sync();
            }
        });
}

async fn run_project_autostart(app: AppHandle) {
    let projects = {
        let state = app.state::<ManagedState>();
        let projects = match state.store.lock() {
            Ok(store) => store
                .list_projects()
                .into_iter()
                .filter(|project| project.auto_start_on_app_launch)
                .collect::<Vec<_>>(),
            Err(_) => Vec::new(),
        };
        projects
    };

    for (index, project) in projects.into_iter().enumerate() {
        if index > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(900)).await;
        }

        let state = app.state::<ManagedState>();
        let _ = state.runtime_manager.start_project(&app, project).await;
    }
}

fn is_autostart_launch() -> bool {
    std::env::args().any(|arg| arg == "--autostart")
}

fn lock_error<T>(_: std::sync::PoisonError<T>) -> String {
    "应用内部状态异常，请重试。".to_string()
}
