mod commands;
mod contracts;
mod node_versions;
mod package_managers;
mod project_directory;
mod runtime;
mod store;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

use contracts::AppCloseRequest;
use runtime::RuntimeManager;
use store::AppStore;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};

pub(crate) struct ManagedState {
    pub(crate) store: Mutex<AppStore>,
    pub(crate) runtime_manager: RuntimeManager,
    pub(crate) pending_close_request: Mutex<Option<AppCloseRequest>>,
    pub(crate) allow_window_close: AtomicBool,
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
            setup_tray(app)?;

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
                if should_allow_window_close(window.app_handle().clone()) {
                    return;
                }

                api.prevent_close();
                let _ = emit_app_close_request(&window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::save_project,
            commands::delete_project,
            commands::list_runtimes,
            commands::diagnose_project,
            commands::inspect_project_directory,
            commands::get_environment,
            commands::import_projects,
            commands::export_projects,
            commands::install_node_version,
            commands::get_app_startup_settings,
            commands::save_app_startup_settings,
            commands::start_project,
            commands::stop_project,
            commands::open_project_directory,
            commands::open_project_terminal,
            commands::open_external,
            commands::minimize_app_to_tray,
            commands::ensure_delete_tool,
            commands::delete_project_node_modules,
            commands::reinstall_project_node_modules,
            commands::confirm_app_close,
            commands::cancel_app_close
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

fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItemBuilder::with_id("show", "显示面板").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出软件").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&show_item, &quit_item]).build()?;

    let icon = app.default_window_icon().cloned();
    let mut tray_builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(
            |app: &AppHandle, event: tauri::menu::MenuEvent| match event.id().as_ref() {
                "show" => {
                    let _ = show_main_window(app);
                }
                "quit" => {
                    if app.get_webview_window("main").is_some() {
                        let _ = show_main_window(app);

                        if should_allow_window_close(app.clone()) {
                            app.exit(0);
                        } else {
                            let _ = emit_app_close_request(app);
                        }
                    }
                }
                _ => {}
            },
        )
        .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event: TrayIconEvent| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = icon {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder.build(app)?;
    Ok(())
}

fn show_main_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .show()
            .map_err(|error| format!("显示主窗口失败: {error}"))?;
        let _ = window.unminimize();
        let _ = window.set_focus();
    }

    Ok(())
}

fn should_allow_window_close(app: AppHandle) -> bool {
    let state = app.state::<ManagedState>();
    state.allow_window_close.load(Ordering::SeqCst)
}

fn emit_app_close_request(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<ManagedState>();

    let active_project_ids = state.runtime_manager.active_project_ids();
    if active_project_ids.is_empty() {
        state.runtime_manager.stop_all_sync();
        state.allow_window_close.store(true, Ordering::SeqCst);
        if let Some(window) = app.get_webview_window("main") {
            window
                .close()
                .map_err(|error| format!("关闭窗口失败: {error}"))?;
        }
        return Ok(());
    }

    let mut pending_close_request = state.pending_close_request.lock().map_err(lock_error)?;
    if pending_close_request.is_some() {
        return Ok(());
    }

    let active_project_names = state
        .store
        .lock()
        .map_err(lock_error)?
        .list_projects()
        .into_iter()
        .filter(|project| active_project_ids.iter().any(|id| id == &project.id))
        .map(|project| project.name)
        .take(3)
        .collect::<Vec<_>>();

    let request = AppCloseRequest {
        active_project_count: active_project_ids.len(),
        active_project_names,
    };

    *pending_close_request = Some(request.clone());
    app.emit("app-close-requested", request)
        .map_err(|error| format!("发送退出确认失败: {error}"))?;

    Ok(())
}

async fn run_project_autostart(app: AppHandle) {
    let projects = {
        let state = app.state::<ManagedState>();
        let loaded_projects = match state.store.lock() {
            Ok(store) => store
                .list_projects()
                .into_iter()
                .filter(|project| project.auto_start_on_app_launch)
                .collect::<Vec<_>>(),
            Err(_) => Vec::new(),
        };
        loaded_projects
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

pub(crate) fn lock_error<T>(_: std::sync::PoisonError<T>) -> String {
    "应用内部状态异常，请重试。".to_string()
}
