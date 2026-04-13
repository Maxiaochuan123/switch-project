use tauri::{AppHandle, Manager, State};

use crate::{lock_error, ManagedState};

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
pub fn confirm_app_close(app: AppHandle, state: State<ManagedState>) -> Result<(), String> {
    *state.pending_close_request.lock().map_err(lock_error)? = None;
    state
        .allow_window_close
        .store(true, std::sync::atomic::Ordering::SeqCst);
    state.runtime_manager.stop_all_sync();
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn cancel_app_close(state: State<ManagedState>) -> Result<(), String> {
    *state.pending_close_request.lock().map_err(lock_error)? = None;
    Ok(())
}
