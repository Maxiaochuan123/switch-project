use chrono::Utc;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::time::{sleep, Duration};

use crate::contracts::{
    DependencyOperation, ProjectAddressKind, ProjectLogLevel, ProjectRuntime, ProjectStatus,
};

use super::{
    entry::{push_logs, push_startup_timing_summary, StartupTimingSummaryKind},
    events::emit_runtime_update,
    failure::{build_runtime_failure_message, classify_runtime_failure},
    RuntimeManager,
};

impl RuntimeManager {
    pub fn finish_runtime_after_exit(
        &self,
        app: &AppHandle,
        project_id: &str,
        exit_code: Option<i32>,
        wait_error: Option<String>,
    ) {
        let expected_stop = self
            .entries
            .lock()
            .expect("runtime entries poisoned")
            .get(project_id)
            .map(|entry| entry.expected_stop)
            .unwrap_or(false);
        let (status, message) = resolve_process_exit_outcome(expected_stop, exit_code, wait_error);

        self.finish_runtime(app, project_id, status, exit_code, message);
    }

    pub fn stop_project(&self, app: &AppHandle, project_id: &str) -> Result<(), String> {
        let pid = {
            let mut entries = self.entries.lock().expect("runtime entries poisoned");
            let Some(entry) = entries.get_mut(project_id) else {
                return Ok(());
            };
            entry.expected_stop = true;
            entry.pid
        };

        let output = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output()
            .map_err(|error| format!("停止项目失败: {error}"))?;

        if output.status.success() {
            self.finish_runtime(
                app,
                project_id,
                ProjectStatus::Stopped,
                None,
                Some("已从面板停止项目。".to_string()),
            );
            return Ok(());
        }

        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let message = format!("停止项目失败: {}", stderr.trim().if_empty(stdout.trim()));

        if message.contains("not found") || message.contains("There is no running instance") {
            self.finish_runtime(
                app,
                project_id,
                ProjectStatus::Stopped,
                None,
                Some("项目已经结束。".to_string()),
            );
            return Ok(());
        }

        Err(message)
    }

    pub fn stop_all_sync(&self) {
        let entries = self
            .entries
            .lock()
            .expect("runtime entries poisoned")
            .values()
            .map(|entry| entry.pid)
            .collect::<Vec<_>>();

        for pid in entries {
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .output();
        }
    }

    pub fn begin_dependency_operation(
        &self,
        project_id: &str,
        _operation: DependencyOperation,
    ) -> Result<(), String> {
        let mut operations = self
            .dependency_operations
            .lock()
            .expect("dependency operations poisoned");

        if !operations.insert(project_id.to_string()) {
            return Err("当前项目正在处理依赖，请稍候。".to_string());
        }

        Ok(())
    }

    pub fn finish_dependency_operation(&self, project_id: &str, _operation: DependencyOperation) {
        self.dependency_operations
            .lock()
            .expect("dependency operations poisoned")
            .remove(project_id);
    }

    pub fn finish_runtime(
        &self,
        app: &AppHandle,
        project_id: &str,
        status: ProjectStatus,
        exit_code: Option<i32>,
        message: Option<String>,
    ) {
        self.pending_auto_open
            .lock()
            .expect("pending auto open poisoned")
            .remove(project_id);

        let next_runtime = {
            let mut entries = self.entries.lock().expect("runtime entries poisoned");
            let Some(mut entry) = entries.remove(project_id) else {
                return;
            };

            if let Some(text) = message.clone() {
                push_logs(&mut entry, ProjectLogLevel::System, vec![text.clone()]);
                entry.runtime.last_message = Some(text);
            }

            entry.runtime.status = status;
            entry.runtime.exit_code = exit_code;
            if entry.runtime.last_success_at.is_none() {
                push_startup_timing_summary(
                    &mut entry,
                    Utc::now().timestamp_millis(),
                    StartupTimingSummaryKind::Interrupted,
                );
            }
            if status == ProjectStatus::Error {
                let failure_text = [
                    entry.runtime.last_message.clone().unwrap_or_default(),
                    entry
                        .runtime
                        .recent_logs
                        .iter()
                        .map(|log| log.message.clone())
                        .collect::<Vec<_>>()
                        .join("\n"),
                ]
                .join("\n");
                let (failure_code, suggested_node_version) =
                    classify_runtime_failure(&failure_text, &entry.selected_node_version);
                entry.runtime.failure_message = Some(build_runtime_failure_message(&entry.runtime));
                entry.runtime.failure_code = failure_code;
                entry.runtime.suggested_node_version = suggested_node_version;
            } else {
                entry.runtime.failure_message = None;
                entry.runtime.failure_code = None;
                entry.runtime.suggested_node_version = None;
            }
            entry.runtime.clone()
        };

        emit_runtime_update(app, &next_runtime);
    }

    pub fn schedule_runtime_update(&self, app: &AppHandle, project_id: &str) {
        let should_schedule = {
            let mut scheduled = self
                .scheduled_runtime_updates
                .lock()
                .expect("scheduled runtime updates poisoned");

            scheduled.insert(project_id.to_string())
        };

        if !should_schedule {
            return;
        }

        let app_handle = app.clone();
        let project_id = project_id.to_string();

        tauri::async_runtime::spawn(async move {
            sleep(Duration::from_millis(120)).await;

            let state = app_handle.state::<crate::ManagedState>();
            state
                .runtime_manager
                .scheduled_runtime_updates
                .lock()
                .expect("scheduled runtime updates poisoned")
                .remove(&project_id);

            let runtime = state
                .runtime_manager
                .entries
                .lock()
                .expect("runtime entries poisoned")
                .get(&project_id)
                .map(|entry| entry.runtime.clone());

            if let Some(runtime) = runtime {
                emit_runtime_update(&app_handle, &runtime);
            }
        });
    }

    pub fn try_auto_open_local_url(
        &self,
        app: &AppHandle,
        project_id: &str,
        runtime: &ProjectRuntime,
    ) {
        let local_address = runtime
            .detected_addresses
            .iter()
            .find(|address| address.kind == ProjectAddressKind::Local)
            .map(|address| address.url.clone());

        let Some(local_url) = local_address else {
            if runtime.status == ProjectStatus::Stopped || runtime.status == ProjectStatus::Error {
                self.pending_auto_open
                    .lock()
                    .expect("pending auto open poisoned")
                    .remove(project_id);
            }
            return;
        };

        let should_open = self
            .pending_auto_open
            .lock()
            .expect("pending auto open poisoned")
            .remove(project_id);

        if should_open {
            let _ = app.opener().open_url(local_url, None::<&str>);
        }
    }
}

trait EmptyFallback {
    fn if_empty(self, fallback: &str) -> String;
}

impl EmptyFallback for &str {
    fn if_empty(self, fallback: &str) -> String {
        if self.trim().is_empty() {
            fallback.to_string()
        } else {
            self.to_string()
        }
    }
}

fn resolve_process_exit_outcome(
    expected_stop: bool,
    exit_code: Option<i32>,
    wait_error: Option<String>,
) -> (ProjectStatus, Option<String>) {
    if expected_stop {
        let message = if wait_error.is_some() {
            "项目已停止，但未能确认退出状态。".to_string()
        } else {
            "已从面板停止项目。".to_string()
        };

        return (ProjectStatus::Stopped, Some(message));
    }

    if let Some(error) = wait_error {
        return (
            ProjectStatus::Error,
            Some(format!("读取进程退出状态失败: {error}")),
        );
    }

    match exit_code {
        Some(0) => (ProjectStatus::Stopped, Some("进程已结束。".to_string())),
        Some(code) => (
            ProjectStatus::Error,
            Some(format!("进程异常退出，退出码 {code}。")),
        ),
        None => (
            ProjectStatus::Error,
            Some("进程异常结束，未返回退出码。".to_string()),
        ),
    }
}

#[cfg(test)]
mod tests {
    use crate::contracts::ProjectStatus;

    use super::resolve_process_exit_outcome;

    #[test]
    fn resolve_process_exit_outcome_treats_wait_errors_as_runtime_errors() {
        let (status, message) =
            resolve_process_exit_outcome(false, None, Some("access denied".to_string()));

        assert_eq!(status, ProjectStatus::Error);
        assert_eq!(message.as_deref(), Some("读取进程退出状态失败: access denied"));
    }

    #[test]
    fn resolve_process_exit_outcome_keeps_expected_stops_as_stopped() {
        let (status, message) = resolve_process_exit_outcome(true, Some(1), None);

        assert_eq!(status, ProjectStatus::Stopped);
        assert_eq!(message.as_deref(), Some("已从面板停止项目。"));
    }

    #[test]
    fn resolve_process_exit_outcome_marks_missing_exit_code_as_error() {
        let (status, message) = resolve_process_exit_outcome(false, None, None);

        assert_eq!(status, ProjectStatus::Error);
        assert_eq!(message.as_deref(), Some("进程异常结束，未返回退出码。"));
    }
}
