mod address;
mod control;
mod dependencies;
mod entry;
mod environment;
mod events;
mod failure;
mod lifecycle;
mod process;

use std::{
    collections::{HashMap, HashSet},
    sync::Mutex,
};

use chrono::Utc;
use tauri::AppHandle;

use crate::contracts::{ProjectLogLevel, ProjectRuntime, ProjectStatus};

use self::{
    address::{now_iso, strip_ansi},
    entry::{collect_addresses, push_logs, update_preview},
};

pub use self::{
    dependencies::{
        ensure_delete_tool_ready, is_delete_tool_ready, run_delete_project_node_modules_task,
        run_reinstall_project_node_modules_task,
    },
    environment::open_project_terminal,
};

pub(crate) use self::environment::{
    build_project_runtime_path, ensure_package_manager_available, ensure_start_command_available,
};

pub(super) const CREATE_NO_WINDOW: u32 = 0x08000000;
pub(super) const CREATE_NEW_CONSOLE: u32 = 0x00000010;

pub struct RuntimeManager {
    entries: Mutex<HashMap<String, RuntimeEntry>>,
    pending_auto_open: Mutex<HashSet<String>>,
    dependency_operations: Mutex<HashSet<String>>,
    scheduled_runtime_updates: Mutex<HashSet<String>>,
}

#[derive(Clone)]
pub(super) struct RuntimeEntry {
    pid: u32,
    expected_stop: bool,
    preview_priority: i32,
    log_sequence: u64,
    start_timestamp_ms: i64,
    selected_node_version: String,
    runtime: ProjectRuntime,
}

impl RuntimeManager {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            pending_auto_open: Mutex::new(HashSet::new()),
            dependency_operations: Mutex::new(HashSet::new()),
            scheduled_runtime_updates: Mutex::new(HashSet::new()),
        }
    }

    pub fn list_runtimes(&self) -> Vec<ProjectRuntime> {
        self.entries
            .lock()
            .expect("runtime entries poisoned")
            .values()
            .map(|entry| entry.runtime.clone())
            .collect()
    }

    pub fn active_project_ids(&self) -> Vec<String> {
        self.entries
            .lock()
            .expect("runtime entries poisoned")
            .keys()
            .cloned()
            .collect()
    }

    pub fn is_project_active(&self, project_id: &str) -> bool {
        self.entries
            .lock()
            .expect("runtime entries poisoned")
            .contains_key(project_id)
    }

    pub fn has_dependency_operation(&self, project_id: &str) -> bool {
        self.dependency_operations
            .lock()
            .expect("dependency operations poisoned")
            .contains(project_id)
    }

    pub fn consume_output(
        &self,
        app: &AppHandle,
        project_id: &str,
        level: ProjectLogLevel,
        line: String,
    ) {
        let normalized_line = strip_ansi(&line).trim().to_string();
        if normalized_line.is_empty() {
            return;
        }

        let next_runtime = {
            let mut entries = self.entries.lock().expect("runtime entries poisoned");
            let Some(entry) = entries.get_mut(project_id) else {
                return;
            };

            push_logs(entry, level, vec![normalized_line.clone()]);
            let added_local = collect_addresses(entry, &normalized_line);
            update_preview(entry, level, &normalized_line);

            if entry.runtime.status == ProjectStatus::Starting && level != ProjectLogLevel::System {
                entry.runtime.status = ProjectStatus::Running;
            }

            if added_local && entry.runtime.last_success_at.is_none() {
                entry.runtime.last_success_at = Some(now_iso());
                entry.runtime.startup_duration_ms =
                    Some((Utc::now().timestamp_millis() - entry.start_timestamp_ms).max(0) as u64);
            }

            entry.runtime.failure_message = None;
            entry.runtime.failure_code = None;
            entry.runtime.suggested_node_version = None;

            entry.runtime.clone()
        };

        self.try_auto_open_local_url(app, project_id, &next_runtime);
        self.schedule_runtime_update(app, project_id);
    }

    pub fn promote_runtime_to_running(&self, app: &AppHandle, project_id: &str) {
        let next_runtime = {
            let mut entries = self.entries.lock().expect("runtime entries poisoned");
            let Some(entry) = entries.get_mut(project_id) else {
                return;
            };

            if entry.runtime.status != ProjectStatus::Starting {
                return;
            }

            entry.runtime.status = ProjectStatus::Running;
            entry.runtime.clone()
        };

        self.try_auto_open_local_url(app, project_id, &next_runtime);
        self.schedule_runtime_update(app, project_id);
    }
}
