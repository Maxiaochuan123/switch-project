use tauri::{AppHandle, State};

use crate::{
    contracts::{DependencyOperation, ProjectRuntime},
    runtime::{
        ensure_delete_tool_ready, run_delete_project_node_modules_task,
        run_reinstall_project_node_modules_task,
    },
    ManagedState,
};

use super::common::{get_cached_project_start_assessment, get_project};

#[tauri::command]
pub fn list_runtimes(state: State<ManagedState>) -> Result<Vec<ProjectRuntime>, String> {
    Ok(state.runtime_manager.list_runtimes())
}

#[tauri::command]
pub async fn start_project(
    app: AppHandle,
    state: State<'_, ManagedState>,
    project_id: String,
) -> Result<(), String> {
    let project = get_project(&state, &project_id)?;
    let cached_assessment = get_cached_project_start_assessment(&state, &project);
    state
        .runtime_manager
        .start_project(&app, project, cached_assessment)
        .await
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
