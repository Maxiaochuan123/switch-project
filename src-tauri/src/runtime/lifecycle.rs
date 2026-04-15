use std::{path::PathBuf, process::Stdio};

use chrono::Utc;
use tauri::{AppHandle, Manager};
use tokio::time::{sleep, Duration};

use crate::commands::common::{assess_project_start, ProjectStartAssessment};
use crate::contracts::{
    normalize_node_version, ProjectConfig, ProjectLogLevel, ProjectRuntime, ProjectStatus,
};

use super::{
    address::now_iso,
    create_async_context_command,
    dependencies::install_project_dependencies_if_missing_with_logs,
    entry::{push_logs, push_startup_timing_summary, StartupTimingSummaryKind},
    events::emit_runtime_update,
    failure::classify_runtime_failure,
    process::{read_stream, wait_for_exit},
    RuntimeEntry, RuntimeManager, RuntimeStartupTimeline,
};

impl RuntimeManager {
    pub async fn start_project(
        &self,
        app: &AppHandle,
        project: ProjectConfig,
        preflight_assessment: Option<ProjectStartAssessment>,
    ) -> Result<(), String> {
        if self.has_dependency_operation(&project.id) {
            return Err("当前项目正在处理依赖，请稍后再启动。".to_string());
        }

        if self
            .entries
            .lock()
            .expect("runtime entries poisoned")
            .contains_key(&project.id)
        {
            return Ok(());
        }

        let project_path = PathBuf::from(project.path.trim());
        let start_timestamp_ms = Utc::now().timestamp_millis();
        let started_at = now_iso();
        let start_assessment =
            preflight_assessment.unwrap_or_else(|| assess_project_start(&project));
        let selected_node_version =
            normalize_node_version(&start_assessment.preflight.selected_node_version);

        if !project_path.exists() || !project_path.is_dir() {
            let message = format!("项目路径不存在: {}", project_path.display());
            self.emit_start_error(
                app,
                &project.id,
                &project.node_version,
                started_at,
                start_timestamp_ms,
                message.clone(),
            );
            return Err(message);
        }

        if !start_assessment.preflight.can_start {
            let message = start_assessment
                .preflight
                .reason_message
                .clone()
                .unwrap_or_else(|| "启动前检查未通过。".to_string());
            self.emit_start_error(
                app,
                &project.id,
                &selected_node_version,
                started_at,
                start_timestamp_ms,
                message.clone(),
            );
            return Err(message);
        }

        let mut starting_entry = RuntimeEntry {
            pid: 0,
            expected_stop: false,
            preview_priority: 0,
            log_sequence: 0,
            start_timestamp_ms,
            selected_node_version: selected_node_version.clone(),
            startup_timeline: RuntimeStartupTimeline {
                environment_ready_at_ms: Some(Utc::now().timestamp_millis()),
                ..RuntimeStartupTimeline::default()
            },
            runtime: ProjectRuntime {
                project_id: project.id.clone(),
                status: ProjectStatus::Starting,
                pid: None,
                started_at: Some(started_at.clone()),
                exit_code: None,
                failure_message: None,
                failure_code: None,
                suggested_node_version: None,
                last_message: Some("正在准备启动...".to_string()),
                detected_url: None,
                detected_addresses: Vec::new(),
                startup_duration_ms: None,
                last_success_at: None,
                recent_logs: Vec::new(),
            },
        };

        push_logs(
            &mut starting_entry,
            ProjectLogLevel::System,
            vec![
                "环境校验完成。".to_string(),
                format!("正在使用 Node v{} 启动项目。", selected_node_version),
                format!("启动命令: {}", project.start_command),
            ],
        );

        self.entries
            .lock()
            .expect("runtime entries poisoned")
            .insert(project.id.clone(), starting_entry.clone());
        emit_runtime_update(app, &starting_entry.runtime);

        if project.auto_open_local_url_on_start {
            self.pending_auto_open
                .lock()
                .expect("pending auto open poisoned")
                .insert(project.id.clone());
        }

        if !project_path.join("node_modules").exists() {
            {
                let mut entries = self.entries.lock().expect("runtime entries poisoned");
                if let Some(entry) = entries.get_mut(&project.id) {
                    entry.startup_timeline.dependency_install_required = true;
                    entry.startup_timeline.dependency_install_started_at_ms =
                        Some(Utc::now().timestamp_millis());
                }
            }

            self.consume_output(
                app,
                &project.id,
                ProjectLogLevel::System,
                "未检测到 node_modules，正在自动安装依赖...".to_string(),
            );

            install_project_dependencies_if_missing_with_logs(self, app, &project, &project_path)
                .await
                .map_err(|error| {
                    let message = format!("自动安装依赖失败: {error}");
                    self.emit_start_error(
                        app,
                        &project.id,
                        &project.node_version,
                        started_at.clone(),
                        start_timestamp_ms,
                        message.clone(),
                    );
                    message
                })?;

            {
                let mut entries = self.entries.lock().expect("runtime entries poisoned");
                if let Some(entry) = entries.get_mut(&project.id) {
                    entry.startup_timeline.dependency_install_finished_at_ms =
                        Some(Utc::now().timestamp_millis());
                }
            }

            self.consume_output(
                app,
                &project.id,
                ProjectLogLevel::System,
                "依赖安装完成，正在启动项目...".to_string(),
            );
        }

        let (existing_logs, existing_log_sequence, existing_startup_timeline) = self
            .entries
            .lock()
            .expect("runtime entries poisoned")
            .get(&project.id)
            .map(|entry| {
                (
                    entry.runtime.recent_logs.clone(),
                    entry.log_sequence,
                    entry.startup_timeline.clone(),
                )
            })
            .unwrap_or_else(|| (Vec::new(), 0, RuntimeStartupTimeline::default()));

        let mut command = create_async_context_command(
            "cmd.exe",
            vec![
                "/d".to_string(),
                "/s".to_string(),
                "/c".to_string(),
                project.start_command.clone(),
            ],
            Some(&project.node_version),
            Some(&project_path),
        )?;
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = command
            .spawn()
            .map_err(|error| format!("启动项目失败: {error}"))?;

        let pid = child
            .id()
            .ok_or_else(|| "无法读取项目进程 PID".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "无法读取标准输出".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "无法读取标准错误".to_string())?;

        if project.auto_open_local_url_on_start {
            self.pending_auto_open
                .lock()
                .expect("pending auto open poisoned")
                .insert(project.id.clone());
        }

        let running_entry = RuntimeEntry {
            pid,
            expected_stop: false,
            preview_priority: 0,
            log_sequence: existing_log_sequence,
            start_timestamp_ms,
            selected_node_version: selected_node_version.clone(),
            startup_timeline: RuntimeStartupTimeline {
                process_spawned_at_ms: Some(Utc::now().timestamp_millis()),
                ..existing_startup_timeline
            },
            runtime: ProjectRuntime {
                project_id: project.id.clone(),
                status: ProjectStatus::Starting,
                pid: Some(pid),
                started_at: Some(started_at),
                exit_code: None,
                failure_message: None,
                failure_code: None,
                suggested_node_version: None,
                last_message: Some("启动命令执行中...".to_string()),
                detected_url: None,
                detected_addresses: Vec::new(),
                startup_duration_ms: None,
                last_success_at: None,
                recent_logs: existing_logs,
            },
        };

        self.entries
            .lock()
            .expect("runtime entries poisoned")
            .insert(project.id.clone(), running_entry.clone());
        emit_runtime_update(app, &running_entry.runtime);

        let app_for_stdout = app.clone();
        let app_for_stderr = app.clone();
        let app_for_wait = app.clone();
        let app_for_promote = app.clone();
        let project_id_for_stdout = project.id.clone();
        let project_id_for_stderr = project.id.clone();
        let project_id_for_wait = project.id.clone();
        let project_id_for_promote = project.id.clone();

        tauri::async_runtime::spawn(async move {
            read_stream(
                app_for_stdout,
                project_id_for_stdout,
                stdout,
                ProjectLogLevel::Stdout,
            )
            .await;
        });

        tauri::async_runtime::spawn(async move {
            read_stream(
                app_for_stderr,
                project_id_for_stderr,
                stderr,
                ProjectLogLevel::Stderr,
            )
            .await;
        });

        tauri::async_runtime::spawn(async move {
            wait_for_exit(app_for_wait, project_id_for_wait, child).await;
        });

        tauri::async_runtime::spawn(async move {
            sleep(Duration::from_millis(1500)).await;

            let state = app_for_promote.state::<crate::ManagedState>();
            state
                .runtime_manager
                .promote_runtime_to_running(&app_for_promote, &project_id_for_promote);
        });

        Ok(())
    }

    fn emit_start_error(
        &self,
        app: &AppHandle,
        project_id: &str,
        selected_node_version: &str,
        started_at: String,
        _start_timestamp_ms: i64,
        message: String,
    ) {
        let completed_at_ms = Utc::now().timestamp_millis();
        let mut entry = self
            .entries
            .lock()
            .expect("runtime entries poisoned")
            .remove(project_id)
            .unwrap_or_else(|| RuntimeEntry {
                pid: 0,
                expected_stop: false,
                preview_priority: 0,
                log_sequence: 0,
                start_timestamp_ms: _start_timestamp_ms,
                selected_node_version: normalize_node_version(selected_node_version),
                startup_timeline: RuntimeStartupTimeline {
                    environment_ready_at_ms: Some(completed_at_ms),
                    ..RuntimeStartupTimeline::default()
                },
                runtime: ProjectRuntime {
                    project_id: project_id.to_string(),
                    status: ProjectStatus::Starting,
                    pid: None,
                    started_at: Some(started_at.clone()),
                    exit_code: None,
                    failure_message: None,
                    failure_code: None,
                    suggested_node_version: None,
                    last_message: None,
                    detected_url: None,
                    detected_addresses: Vec::new(),
                    startup_duration_ms: None,
                    last_success_at: None,
                    recent_logs: Vec::new(),
                },
            });

        push_logs(&mut entry, ProjectLogLevel::System, vec![message.clone()]);
        push_startup_timing_summary(
            &mut entry,
            completed_at_ms,
            StartupTimingSummaryKind::Interrupted,
        );

        entry.runtime.status = ProjectStatus::Error;
        entry.runtime.started_at = entry.runtime.started_at.or(Some(started_at));
        entry.runtime.exit_code = None;
        entry.runtime.last_message = Some(message.clone());
        let failure_text = [
            message.clone(),
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
            classify_runtime_failure(&failure_text, selected_node_version);

        emit_runtime_update(
            app,
            &ProjectRuntime {
                failure_message: Some(message),
                failure_code,
                suggested_node_version,
                ..entry.runtime
            },
        );
    }
}
