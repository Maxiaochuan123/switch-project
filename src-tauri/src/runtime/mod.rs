mod address;
mod dependencies;
mod environment;
mod events;
mod process;

use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    process::Stdio,
    sync::Mutex,
};

use chrono::Utc;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::process::Command;

use crate::contracts::{
    normalize_node_version, DependencyOperation, ProjectAddress, ProjectAddressKind, ProjectConfig,
    ProjectLogEntry, ProjectLogLevel, ProjectRuntime, ProjectStatus,
};

use self::{
    address::{extract_addresses_from_message, now_iso, strip_ansi, translate_runtime_message},
    dependencies::install_project_dependencies_if_missing_with_logs,
    environment::{
        build_project_runtime_path, ensure_package_manager_available,
        ensure_start_command_available, resolve_project_node_directory,
    },
    events::emit_runtime_update,
    process::{read_stream, wait_for_exit},
};

pub use self::{
    dependencies::{
        ensure_delete_tool_ready, is_delete_tool_ready, run_delete_project_node_modules_task,
        run_reinstall_project_node_modules_task,
    },
    environment::open_project_terminal,
};

const MAX_LOG_ENTRIES: usize = 200;
const MAX_LOG_MESSAGE_LENGTH: usize = 1800;
pub(super) const CREATE_NO_WINDOW: u32 = 0x08000000;
pub(super) const CREATE_NEW_CONSOLE: u32 = 0x00000010;

pub struct RuntimeManager {
    entries: Mutex<HashMap<String, RuntimeEntry>>,
    pending_auto_open: Mutex<HashSet<String>>,
    dependency_operations: Mutex<HashSet<String>>,
}

#[derive(Clone)]
pub(super) struct RuntimeEntry {
    pid: u32,
    expected_stop: bool,
    preview_priority: i32,
    log_sequence: u64,
    start_timestamp_ms: i64,
    runtime: ProjectRuntime,
}

impl RuntimeManager {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            pending_auto_open: Mutex::new(HashSet::new()),
            dependency_operations: Mutex::new(HashSet::new()),
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
            self.emit_start_error(app, &project.id, started_at, start_timestamp_ms, message.clone());
            return Err(message);
        }

        let node_directory = resolve_project_node_directory(&project.node_version);
        if !node_directory.join("node.exe").exists() {
            let message = format!(
                "本机还没有通过 nvm-windows 安装 Node {}",
                normalize_node_version(&project.node_version)
            );
            self.emit_start_error(app, &project.id, started_at, start_timestamp_ms, message.clone());
            return Err(message);
        }

        let runtime_path = build_project_runtime_path(&project.node_version);
        ensure_package_manager_available(project.package_manager, &runtime_path)?;
        ensure_start_command_available(&project.start_command, &runtime_path)?;

        let mut entry = RuntimeEntry {
            pid: 0,
            expected_stop: false,
            preview_priority: 0,
            log_sequence: 0,
            start_timestamp_ms,
            runtime: ProjectRuntime {
                project_id: project.id.clone(),
                status: ProjectStatus::Starting,
                pid: None,
                started_at: Some(started_at.clone()),
                exit_code: None,
                last_message: Some("正在准备启动...".to_string()),
                detected_url: None,
                detected_addresses: Vec::new(),
                startup_duration_ms: None,
                last_success_at: None,
                recent_logs: Vec::new(),
            },
        };

        self.push_logs(
            &mut entry,
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
            .insert(project.id.clone(), entry.clone());
        emit_runtime_update(app, &entry.runtime);

        let existing_logs = self
            .entries
            .lock()
            .expect("runtime entries poisoned")
            .get(&project.id)
            .map(|entry| entry.runtime.recent_logs.clone())
            .unwrap_or_default();

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

        let mut entry = RuntimeEntry {
            pid,
            expected_stop: false,
            preview_priority: 0,
            log_sequence: 0,
            start_timestamp_ms,
            runtime: ProjectRuntime {
                project_id: project.id.clone(),
                status: ProjectStatus::Running,
                pid: Some(pid),
                started_at: Some(started_at),
                exit_code: None,
                last_message: Some("启动命令执行中...".to_string()),
                detected_url: None,
                detected_addresses: Vec::new(),
                startup_duration_ms: None,
                last_success_at: None,
                recent_logs: existing_logs,
            },
        };

        self.push_logs(
            &mut entry,
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
            .insert(project.id.clone(), entry.clone());
        emit_runtime_update(app, &entry.runtime);

        let app_for_stdout = app.clone();
        let app_for_stderr = app.clone();
        let app_for_wait = app.clone();
        let project_id_for_stdout = project.id.clone();
        let project_id_for_stderr = project.id.clone();
        let project_id_for_wait = project.id.clone();

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

        Ok(())
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
                Some("已从面板停止。".to_string()),
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

            self.push_logs(entry, level, vec![normalized_line.clone()]);
            let added_local = self.collect_addresses(entry, &normalized_line);
            self.update_preview(entry, level, &normalized_line);

            if added_local && entry.runtime.last_success_at.is_none() {
                entry.runtime.last_success_at = Some(now_iso());
                entry.runtime.startup_duration_ms =
                    Some((Utc::now().timestamp_millis() - entry.start_timestamp_ms).max(0) as u64);
            }

            entry.runtime.clone()
        };

        self.try_auto_open_local_url(app, project_id, &next_runtime);
        emit_runtime_update(app, &next_runtime);
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
                self.push_logs(&mut entry, ProjectLogLevel::System, vec![text.clone()]);
                entry.runtime.last_message = Some(text);
            }

            entry.runtime.status = status;
            entry.runtime.exit_code = exit_code;
            entry.runtime.clone()
        };

        emit_runtime_update(app, &next_runtime);
    }

    fn emit_start_error(
        &self,
        app: &AppHandle,
        project_id: &str,
        started_at: String,
        _start_timestamp_ms: i64,
        message: String,
    ) {
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

    fn push_logs(&self, entry: &mut RuntimeEntry, level: ProjectLogLevel, messages: Vec<String>) {
        entry.log_sequence += 1;
        entry.runtime.recent_logs.push(ProjectLogEntry {
            id: format!("{}-{}", entry.runtime.project_id, entry.log_sequence),
            at: now_iso(),
            level,
            message: messages.join("\n").chars().take(MAX_LOG_MESSAGE_LENGTH).collect(),
        });

        if entry.runtime.recent_logs.len() > MAX_LOG_ENTRIES {
            let excess = entry.runtime.recent_logs.len() - MAX_LOG_ENTRIES;
            entry.runtime.recent_logs.drain(0..excess);
        }
    }

    fn collect_addresses(&self, entry: &mut RuntimeEntry, message: &str) -> bool {
        let extracted = extract_addresses_from_message(message);
        let mut added_local = false;

        for address in extracted {
            let same_kind_exists = entry
                .runtime
                .detected_addresses
                .iter()
                .any(|current| current.kind == address.kind);
            let same_url_exists = entry
                .runtime
                .detected_addresses
                .iter()
                .any(|current| current.url == address.url);

            if same_kind_exists || same_url_exists {
                continue;
            }

            if address.kind == ProjectAddressKind::Local {
                added_local = true;
            }

            entry.runtime.detected_addresses.push(ProjectAddress {
                url: address.url,
                kind: address.kind,
                label: match address.kind {
                    ProjectAddressKind::Local => "本地地址".to_string(),
                    ProjectAddressKind::Network => "局域网地址".to_string(),
                    ProjectAddressKind::Other => "其他地址".to_string(),
                },
                discovered_at: now_iso(),
            });
        }

        entry.runtime
            .detected_addresses
            .sort_by_key(|address| match address.kind {
                ProjectAddressKind::Local => 0,
                ProjectAddressKind::Network => 1,
                ProjectAddressKind::Other => 2,
            });
        entry.runtime.detected_url = entry
            .runtime
            .detected_addresses
            .iter()
            .find(|address| address.kind == ProjectAddressKind::Local)
            .or_else(|| entry.runtime.detected_addresses.first())
            .map(|address| address.url.clone());

        added_local
    }

    fn update_preview(&self, entry: &mut RuntimeEntry, level: ProjectLogLevel, message: &str) {
        if let Some(address) = entry
            .runtime
            .detected_addresses
            .iter()
            .find(|address| address.kind == ProjectAddressKind::Local)
        {
            entry.preview_priority = 2;
            entry.runtime.last_message = Some(format!("已检测到本地地址: {}", address.url));
            return;
        }

        let priority = if level == ProjectLogLevel::Stderr { 2 } else { 1 };
        if priority >= entry.preview_priority {
            entry.preview_priority = priority;
            entry.runtime.last_message = Some(translate_runtime_message(message));
        }
    }

    fn try_auto_open_local_url(
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
