use std::{path::PathBuf, process::Stdio};

use chrono::Utc;
use tauri::{AppHandle, Manager};
use tokio::process::Command;
use tokio::time::{sleep, Duration};

use crate::contracts::{
    normalize_node_version, ProjectConfig, ProjectLogEntry, ProjectLogLevel, ProjectRuntime,
    ProjectStatus,
};

use super::{
    address::now_iso,
    build_project_runtime_path, ensure_package_manager_available, ensure_start_command_available,
    dependencies::install_project_dependencies_if_missing_with_logs,
    entry::push_logs,
    environment::resolve_project_node_directory,
    events::emit_runtime_update,
    failure::classify_runtime_failure,
    process::{read_stream, wait_for_exit},
    RuntimeEntry, RuntimeManager, CREATE_NO_WINDOW,
};

impl RuntimeManager {
    pub async fn start_project(
        &self,
        app: &AppHandle,
        project: ProjectConfig,
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

        let node_directory = resolve_project_node_directory(&project.node_version);
        if !node_directory.join("node.exe").exists() {
            let message = format!(
                "本机还没有通过 nvm-windows 安装 Node {}",
                normalize_node_version(&project.node_version)
            );
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

        let runtime_path = build_project_runtime_path(&project.node_version);
        ensure_package_manager_available(project.package_manager, &runtime_path)?;
        ensure_start_command_available(&project.start_command, &runtime_path)?;

        let mut starting_entry = RuntimeEntry {
            pid: 0,
            expected_stop: false,
            preview_priority: 0,
            log_sequence: 0,
            start_timestamp_ms,
            selected_node_version: normalize_node_version(&project.node_version),
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
                format!(
                    "正在使用 Node v{} 启动项目。",
                    normalize_node_version(&project.node_version)
                ),
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
            self.consume_output(
                app,
                &project.id,
                ProjectLogLevel::System,
                "未检测到 node_modules，正在自动安装依赖...".to_string(),
            );

            install_project_dependencies_if_missing_with_logs(
                self,
                app,
                &project,
                &project_path,
                &runtime_path,
            )
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

            self.consume_output(
                app,
                &project.id,
                ProjectLogLevel::System,
                "依赖安装完成，正在启动项目...".to_string(),
            );
        }

        let (existing_logs, existing_log_sequence) = self
            .entries
            .lock()
            .expect("runtime entries poisoned")
            .get(&project.id)
            .map(|entry| (entry.runtime.recent_logs.clone(), entry.log_sequence))
            .unwrap_or_default();

        let mut command = Command::new("cmd.exe");
        command
            .args(["/d", "/s", "/c", project.start_command.as_str()])
            .current_dir(&project_path)
            .env("PATH", runtime_path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NO_WINDOW);

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
            selected_node_version: normalize_node_version(&project.node_version),
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
        let (failure_code, suggested_node_version) =
            classify_runtime_failure(&message, selected_node_version);
        self.entries
            .lock()
            .expect("runtime entries poisoned")
            .remove(project_id);

        emit_runtime_update(
            app,
            &ProjectRuntime {
                project_id: project_id.to_string(),
                status: ProjectStatus::Error,
                pid: None,
                started_at: Some(started_at),
                exit_code: None,
                last_message: Some(message.clone()),
                failure_message: Some(message.clone()),
                failure_code,
                suggested_node_version,
                detected_url: None,
                detected_addresses: Vec::new(),
                startup_duration_ms: None,
                last_success_at: None,
                recent_logs: vec![ProjectLogEntry {
                    id: format!("{project_id}-0"),
                    at: now_iso(),
                    level: ProjectLogLevel::System,
                    message,
                }],
            },
        );
    }
}
