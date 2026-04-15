use std::collections::HashSet;

use tauri::{AppHandle, State};

use crate::{
    lock_error,
    contracts::{
        ImportProjectsResult, ProjectConfig, ProjectDiagnosis, ProjectDirectoryInspection,
        ProjectPanelSnapshot, ProjectStartPreflight,
    },
    project_directory::inspect_project_directory as inspect_project_directory_impl,
    ManagedState,
};

use super::common::{
    assess_project_start, build_project_diagnosis, build_project_panel_snapshot,
    cache_project_start_assessment, clear_project_start_assessment_cache, get_project,
};

#[tauri::command]
pub fn list_projects(state: State<ManagedState>) -> Result<Vec<ProjectConfig>, String> {
    Ok(state.store.lock().map_err(lock_error)?.list_projects())
}

#[tauri::command]
pub fn get_project_panel_snapshot(
    state: State<ManagedState>,
) -> Result<ProjectPanelSnapshot, String> {
    let (projects, startup_settings) = {
        let store = state.store.lock().map_err(lock_error)?;
        (store.list_projects(), store.get_app_startup_settings())
    };
    let runtimes = state.runtime_manager.list_runtimes();

    build_project_panel_snapshot(projects, startup_settings, runtimes)
}

#[tauri::command]
pub fn save_project(state: State<ManagedState>, project: ProjectConfig) -> Result<(), String> {
    let project_id = project.id.clone();
    state.store.lock().map_err(lock_error)?.save_project(project)?;
    clear_project_start_assessment_cache(&state, &project_id)
}

#[tauri::command]
pub fn delete_project(
    app: AppHandle,
    state: State<ManagedState>,
    project_id: String,
) -> Result<(), String> {
    state.runtime_manager.stop_project(&app, &project_id)?;
    state.store.lock().map_err(lock_error)?.delete_project(&project_id)?;
    clear_project_start_assessment_cache(&state, &project_id)
}

#[tauri::command]
pub fn diagnose_project(
    state: State<ManagedState>,
    project_id: String,
) -> Result<ProjectDiagnosis, String> {
    let project = get_project(&state, &project_id)?;
    Ok(build_project_diagnosis(project))
}

#[tauri::command]
pub fn diagnose_projects(
    state: State<ManagedState>,
    project_ids: Vec<String>,
) -> Result<Vec<ProjectDiagnosis>, String> {
    let projects = state.store.lock().map_err(lock_error)?.list_projects();
    let requested_ids = project_ids.into_iter().collect::<HashSet<_>>();

    Ok(projects
        .into_iter()
        .filter(|project| requested_ids.contains(&project.id))
        .map(build_project_diagnosis)
        .collect())
}

#[tauri::command]
pub fn preflight_project_start(
    state: State<ManagedState>,
    project_id: String,
) -> Result<ProjectStartPreflight, String> {
    let project = get_project(&state, &project_id)?;
    let assessment = assess_project_start(&project);
    cache_project_start_assessment(&state, &project, &assessment)?;
    Ok(assessment.preflight)
}

#[tauri::command]
pub fn inspect_project_directory(project_path: String) -> Result<ProjectDirectoryInspection, String> {
    Ok(inspect_project_directory_impl(
        &project_path,
        &crate::node_manager::list_installed_node_versions(),
    ))
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
