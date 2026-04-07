use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Mutex, OnceLock},
};

use chrono::Utc;
use regex::Regex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, BufReader},
    process::{Child, Command},
    task,
};
use url::Url;

use crate::{
    contracts::{
        build_install_command, normalize_node_version, package_manager_command_name,
        DependencyOperation, DependencyOperationEvent, DependencyOperationStatus, ProjectAddress,
        ProjectAddressKind, ProjectConfig, ProjectLogEntry, ProjectLogLevel, ProjectRuntime,
        ProjectStatus,
    },
    node_versions::resolve_nvm_home,
    package_managers::is_package_manager_available,
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const MAX_LOG_ENTRIES: usize = 200;
const MAX_LOG_MESSAGE_LENGTH: usize = 1800;
const CREATE_NO_WINDOW: u32 = 0x08000000;
const CREATE_NEW_CONSOLE: u32 = 0x00000010;

pub struct RuntimeManager {
    entries: Mutex<HashMap<String, RuntimeEntry>>,
    pending_auto_open: Mutex<HashSet<String>>,
    dependency_operations: Mutex<HashSet<String>>,
}

#[derive(Clone)]
struct RuntimeEntry {
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

    pub async fn start_project(
        &self,
        app: &AppHandle,
        project: ProjectConfig,
    ) -> Result<(), String> {
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
            let message = format!("椤圭洰璺緞涓嶅瓨鍦? {}", project_path.display());
            self.emit_start_error(app, &project.id, started_at, start_timestamp_ms, message.clone());
            return Err(message);
        }

        let node_directory = resolve_project_node_directory(&project.node_version);
        if !node_directory.join("node.exe").exists() {
            let message = format!(
                "鏈満鏈€氳繃 nvm-windows 瀹夎 Node {}",
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
                last_message: Some("姝ｅ湪鍑嗗鍚姩...".to_string()),
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
                format!("鍚姩鍛戒护: {}", project.start_command),
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
                "鏈娴嬪埌 node_modules锛屾鍦ㄨ嚜鍔ㄥ畨瑁呬緷璧?..".to_string(),
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
                    let message = format!("鑷姩瀹夎渚濊禆澶辫触: {error}");
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
                "渚濊禆瀹夎瀹屾垚锛屾鍦ㄥ惎鍔ㄩ」鐩?..".to_string(),
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
            .map_err(|error| format!("鍚姩椤圭洰澶辫触: {error}"))?;

        let pid = child.id().ok_or_else(|| "鏃犳硶璇诲彇椤圭洰杩涚▼ PID".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "鏃犳硶璇诲彇鏍囧噯杈撳嚭".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "鏃犳硶璇诲彇鏍囧噯閿欒".to_string())?;

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
                last_message: Some("鍚姩鍛戒护鎵ц涓?..".to_string()),
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
                format!("鍚姩鍛戒护: {}", project.start_command),
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
            read_stream(app_for_stdout, project_id_for_stdout, stdout, ProjectLogLevel::Stdout).await;
        });

        tauri::async_runtime::spawn(async move {
            read_stream(app_for_stderr, project_id_for_stderr, stderr, ProjectLogLevel::Stderr).await;
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
            .map_err(|error| format!("鍋滄椤圭洰澶辫触: {error}"))?;

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
        let message = format!("鍋滄椤圭洰澶辫触: {}", stderr.trim().if_empty(stdout.trim()));

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
        operation: DependencyOperation,
    ) -> Result<(), String> {
        let key = dependency_operation_key(project_id, operation);
        let mut operations = self
            .dependency_operations
            .lock()
            .expect("dependency operations poisoned");

        if !operations.insert(key) {
            return Err(match operation {
                DependencyOperation::Delete => "当前项目正在删除依赖，请稍候。".to_string(),
                DependencyOperation::Reinstall => "当前项目正在重装依赖，请稍候。".to_string(),
            });
        }

        Ok(())
    }

    pub fn finish_dependency_operation(
        &self,
        project_id: &str,
        operation: DependencyOperation,
    ) {
        self.dependency_operations
            .lock()
            .expect("dependency operations poisoned")
            .remove(&dependency_operation_key(project_id, operation));
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
                entry.runtime.startup_duration_ms = Some(
                    (Utc::now().timestamp_millis() - entry.start_timestamp_ms).max(0) as u64,
                );
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

    fn push_logs(
        &self,
        entry: &mut RuntimeEntry,
        level: ProjectLogLevel,
        messages: Vec<String>,
    ) {
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
                    ProjectAddressKind::Local => "鏈湴鍦板潃".to_string(),
                    ProjectAddressKind::Network => "灞€鍩熺綉鍦板潃".to_string(),
                    ProjectAddressKind::Other => "鍏朵粬鍦板潃".to_string(),
                },
                discovered_at: now_iso(),
            });
        }

        entry.runtime.detected_addresses.sort_by_key(|address| match address.kind {
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

    fn update_preview(
        &self,
        entry: &mut RuntimeEntry,
        level: ProjectLogLevel,
        message: &str,
    ) {
        if let Some(address) = entry
            .runtime
            .detected_addresses
            .iter()
            .find(|address| address.kind == ProjectAddressKind::Local)
        {
            entry.preview_priority = 2;
            entry.runtime.last_message = Some(format!("宸叉娴嬪埌鏈湴鍦板潃: {}", address.url));
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

async fn read_stream<R>(
    app: AppHandle,
    project_id: String,
    stream: R,
    level: ProjectLogLevel,
) where
    R: AsyncRead + Unpin + Send + 'static,
{
    let mut lines = BufReader::new(stream).lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let state = app.state::<crate::ManagedState>();
        state
            .runtime_manager
            .consume_output(&app, &project_id, level, line);
    }
}

async fn wait_for_exit(app: AppHandle, project_id: String, mut child: Child) {
    let exit_code = child.wait().await.ok().and_then(|status| status.code());
    let state = app.state::<crate::ManagedState>();
    let message = if exit_code == Some(0) || exit_code.is_none() {
        Some("进程已结束。".to_string())
    } else {
        Some(format!("进程异常退出，退出码 {}。", exit_code.unwrap_or(-1)))
    };

    state.runtime_manager.finish_runtime(
        &app,
        &project_id,
        if exit_code == Some(0) || exit_code.is_none() {
            ProjectStatus::Stopped
        } else {
            ProjectStatus::Error
        },
        exit_code,
        message,
    );
}

fn emit_runtime_update(app: &AppHandle, runtime: &ProjectRuntime) {
    let _ = app.emit("runtime-update", runtime.clone());
}

fn emit_dependency_operation(app: &AppHandle, event: DependencyOperationEvent) {
    let _ = app.emit("dependency-operation", event);
}

fn dependency_operation_key(project_id: &str, operation: DependencyOperation) -> String {
    let operation_name = match operation {
        DependencyOperation::Delete => "delete",
        DependencyOperation::Reinstall => "reinstall",
    };

    format!("{project_id}:{operation_name}")
}

async fn ensure_rimraf_available_with_event(
    app: &AppHandle,
    project: &ProjectConfig,
    operation: DependencyOperation,
) -> Result<String, String> {
    if !is_delete_tool_ready()? {
        emit_dependency_operation(
            app,
            DependencyOperationEvent {
                project_id: project.id.clone(),
                project_name: project.name.clone(),
                operation,
                status: DependencyOperationStatus::InstallingDeleteTool,
                message: Some("未检测到 rimraf，正在全局安装删除工具。".to_string()),
            },
        );
    }

    ensure_rimraf_available().await
}

async fn remove_node_modules_directory_with_command(
    node_modules_path: &Path,
    rimraf_command: &str,
) -> Result<(), String> {
    if !node_modules_path.exists() {
        return Ok(());
    }

    let mut command = if rimraf_command.to_ascii_lowercase().ends_with(".cmd")
        || rimraf_command.to_ascii_lowercase().ends_with(".bat")
    {
        let mut cmd = Command::new("cmd.exe");
        cmd.args([
            "/d",
            "/s",
            "/c",
            &format!("\"{}\" \"{}\"", rimraf_command, node_modules_path.display()),
        ]);
        cmd
    } else {
        let mut cmd = Command::new(rimraf_command);
        cmd.arg(node_modules_path);
        cmd
    };

    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .await
        .map_err(|error| format!("删除依赖失败: {error}"))?;

    if output.status.success() || !node_modules_path.exists() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let fallback_path = node_modules_path.to_path_buf();

    task::spawn_blocking(move || std::fs::remove_dir_all(&fallback_path))
        .await
        .map_err(|error| format!("删除依赖失败: {error}"))?
        .map_err(|error| {
            if stderr.is_empty() {
                format!("删除依赖失败: {error}")
            } else {
                format!("删除依赖失败: {stderr}")
            }
        })
}

pub async fn run_delete_project_node_modules_task(app: AppHandle, project: ProjectConfig) {
    let operation = DependencyOperation::Delete;

    let result = async {
        let project_path = PathBuf::from(project.path.trim());
        if !project_path.exists() || !project_path.is_dir() {
            return Err(format!("项目路径不存在: {}", project_path.display()));
        }

        let node_modules_path = project_path.join("node_modules");
        if !node_modules_path.exists() {
            return Ok(());
        }

        let rimraf_command = ensure_rimraf_available_with_event(&app, &project, operation).await?;

        emit_dependency_operation(
            &app,
            DependencyOperationEvent {
                project_id: project.id.clone(),
                project_name: project.name.clone(),
                operation,
                status: DependencyOperationStatus::Running,
                message: Some("正在删除依赖，请稍候。".to_string()),
            },
        );

        remove_node_modules_directory_with_command(&node_modules_path, &rimraf_command).await
    }
    .await;

    let state = app.state::<crate::ManagedState>();
    state
        .runtime_manager
        .finish_dependency_operation(&project.id, operation);

    match result {
        Ok(()) => emit_dependency_operation(
            &app,
            DependencyOperationEvent {
                project_id: project.id,
                project_name: project.name,
                operation,
                status: DependencyOperationStatus::Success,
                message: Some("依赖目录已经删除。".to_string()),
            },
        ),
        Err(message) => emit_dependency_operation(
            &app,
            DependencyOperationEvent {
                project_id: project.id,
                project_name: project.name,
                operation,
                status: DependencyOperationStatus::Error,
                message: Some(message),
            },
        ),
    }
}

pub async fn run_reinstall_project_node_modules_task(app: AppHandle, project: ProjectConfig) {
    let operation = DependencyOperation::Reinstall;

    let result = async {
        let project_path = PathBuf::from(project.path.trim());
        if !project_path.exists() || !project_path.is_dir() {
            return Err(format!("项目路径不存在: {}", project_path.display()));
        }

        let node_modules_path = project_path.join("node_modules");
        if node_modules_path.exists() {
            let rimraf_command =
                ensure_rimraf_available_with_event(&app, &project, operation).await?;

            emit_dependency_operation(
                &app,
                DependencyOperationEvent {
                    project_id: project.id.clone(),
                    project_name: project.name.clone(),
                    operation,
                    status: DependencyOperationStatus::Running,
                    message: Some("正在删除旧依赖，请稍候。".to_string()),
                },
            );

            remove_node_modules_directory_with_command(&node_modules_path, &rimraf_command).await?;
        }

        emit_dependency_operation(
            &app,
            DependencyOperationEvent {
                project_id: project.id.clone(),
                project_name: project.name.clone(),
                operation,
                status: DependencyOperationStatus::Running,
                message: Some("正在安装依赖，请稍候。".to_string()),
            },
        );

        let runtime_path = build_project_runtime_path(&project.node_version);
        install_project_dependencies_if_missing(&project, &project_path, &runtime_path).await
    }
    .await;

    let state = app.state::<crate::ManagedState>();
    state
        .runtime_manager
        .finish_dependency_operation(&project.id, operation);

    match result {
        Ok(()) => emit_dependency_operation(
            &app,
            DependencyOperationEvent {
                project_id: project.id,
                project_name: project.name,
                operation,
                status: DependencyOperationStatus::Success,
                message: Some("依赖已经重新安装完成。".to_string()),
            },
        ),
        Err(message) => emit_dependency_operation(
            &app,
            DependencyOperationEvent {
                project_id: project.id,
                project_name: project.name,
                operation,
                status: DependencyOperationStatus::Error,
                message: Some(message),
            },
        ),
    }
}

fn resolve_project_node_directory(node_version: &str) -> PathBuf {
    let nvm_home = resolve_nvm_home().unwrap_or_default();
    nvm_home.join(format!("v{}", normalize_node_version(node_version)))
}

fn build_project_runtime_path(node_version: &str) -> String {
    let current_path = std::env::var("PATH").unwrap_or_default();
    let node_directory = resolve_project_node_directory(node_version)
        .to_string_lossy()
        .to_string();
    let node_directory_lower = node_directory.to_lowercase();
    let nvm_home = resolve_nvm_home()
        .map(|path| path.to_string_lossy().to_string().to_lowercase())
        .unwrap_or_default();
    let nvm_symlink = std::env::var("NVM_SYMLINK").unwrap_or_default();

    let filtered = current_path
        .split(';')
        .filter(|segment| !segment.trim().is_empty())
        .filter(|segment| {
            let normalized = segment.to_lowercase();
            if normalized == node_directory_lower {
                return false;
            }

            if !nvm_home.is_empty() && normalized.starts_with(&format!("{nvm_home}\\v")) {
                return false;
            }

            true
        })
        .map(str::to_string)
        .collect::<Vec<_>>();

    let mut paths = vec![node_directory];

    if !nvm_symlink.trim().is_empty()
        && !paths
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(&nvm_symlink))
    {
        paths.push(nvm_symlink);
    }

    for segment in filtered {
        if !paths
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(&segment))
        {
            paths.push(segment);
        }
    }

    paths.join(";")
}

fn ensure_start_command_available(start_command: &str, runtime_path: &str) -> Result<(), String> {
    let command_name = extract_command_name(start_command);
    if command_name.is_empty() {
        return Ok(());
    }

    let builtin = matches!(
        command_name.to_ascii_lowercase().as_str(),
        "assoc"
            | "break"
            | "call"
            | "cd"
            | "chdir"
            | "cls"
            | "color"
            | "copy"
            | "date"
            | "del"
            | "dir"
            | "echo"
            | "erase"
            | "exit"
            | "for"
            | "if"
            | "md"
            | "mkdir"
            | "move"
            | "path"
            | "pause"
            | "popd"
            | "prompt"
            | "pushd"
            | "rd"
            | "rem"
            | "ren"
            | "rename"
            | "rmdir"
            | "set"
            | "shift"
            | "start"
            | "time"
            | "title"
            | "type"
            | "ver"
    );

    if builtin || command_name.contains('\\') || command_name.contains('/') || Path::new(&command_name).is_absolute() {
        return Ok(());
    }

    let output = std::process::Command::new("where.exe")
        .arg(&command_name)
        .env("PATH", runtime_path)
        .output()
        .map_err(|error| format!("妫€鏌ュ惎鍔ㄥ懡浠ゅけ璐? {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    Err(format!(
        "未找到启动命令 {}. 请先安装后再启动项目.",
        command_name
    ))
}

fn ensure_package_manager_available(
    package_manager: crate::contracts::ProjectPackageManager,
    runtime_path: &str,
) -> Result<(), String> {
    if is_package_manager_available(package_manager, Some(runtime_path)) {
        return Ok(());
    }

    Err(format!(
        "未找到包管理器 {}. 请先安装后再继续.",
        package_manager_command_name(package_manager)
    ))
}

fn extract_command_name(command: &str) -> String {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if let Some(stripped) = trimmed.strip_prefix('"') {
        return stripped
            .split('"')
            .next()
            .unwrap_or_default()
            .to_string();
    }

    if let Some(stripped) = trimmed.strip_prefix('\'') {
        return stripped
            .split('\'')
            .next()
            .unwrap_or_default()
            .to_string();
    }

    trimmed.split_whitespace().next().unwrap_or_default().to_string()
}

fn translate_runtime_message(message: &str) -> String {
    let trimmed = message.trim();
    if trimmed.contains("Module not found") {
        return "依赖或模块缺失，请先检查项目安装状态。".to_string();
    }
    if trimmed.contains("Failed to compile") {
        return "编译失败，请打开终端查看详情。".to_string();
    }
    trimmed.to_string()
}

fn extract_addresses_from_message(message: &str) -> Vec<NormalizedAddress> {
    if message.trim().is_empty() || message.trim().eq_ignore_ascii_case("- Network: unavailable") {
        return Vec::new();
    }

    url_regex()
        .find_iter(message)
        .filter_map(|match_value| normalize_detected_address(match_value.as_str()))
        .collect()
}

fn normalize_detected_address(raw_url: &str) -> Option<NormalizedAddress> {
    let sanitized = raw_url.trim_end_matches([',', ')', ';', '.']);
    let mut parsed = Url::parse(sanitized).ok()?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return None;
    }

    let host = parsed.host_str()?.to_lowercase();
    let path = parsed.path().to_lowercase();
    if ignored_address_path_regex().is_match(&path) {
        return None;
    }

    let kind = match host.as_str() {
        "localhost" | "127.0.0.1" | "::1" => ProjectAddressKind::Local,
        "0.0.0.0" => {
            parsed.set_host(Some("localhost")).ok()?;
            ProjectAddressKind::Local
        }
        value if value.starts_with("192.168.") => ProjectAddressKind::Network,
        _ => return None,
    };

    parsed.set_path("/");
    parsed.set_query(None);
    parsed.set_fragment(None);

    Some(NormalizedAddress {
        url: parsed.to_string(),
        kind,
    })
}

fn strip_ansi(value: &str) -> String {
    ansi_regex().replace_all(value, "").to_string()
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn ansi_regex() -> &'static Regex {
    static ANSI_REGEX: OnceLock<Regex> = OnceLock::new();
    ANSI_REGEX.get_or_init(|| Regex::new(r"\u{001B}\[[0-9;]*m").expect("valid ansi regex"))
}

fn url_regex() -> &'static Regex {
    static URL_REGEX: OnceLock<Regex> = OnceLock::new();
    URL_REGEX.get_or_init(|| Regex::new(r"https?://[^\s]+").expect("valid url regex"))
}

fn ignored_address_path_regex() -> &'static Regex {
    static IGNORED_REGEX: OnceLock<Regex> = OnceLock::new();
    IGNORED_REGEX.get_or_init(|| {
        Regex::new(r"/(?:_?unocss|sockjs-node|webpack-dev-server|__vite_ping|@vite|@id)(?:/|$)")
            .expect("valid ignored address path regex")
    })
}

struct NormalizedAddress {
    url: String,
    kind: ProjectAddressKind,
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

async fn install_project_dependencies_if_missing(
    project: &ProjectConfig,
    project_path: &Path,
    runtime_path: &str,
) -> Result<(), String> {
    ensure_package_manager_available(project.package_manager, runtime_path)?;

    let install_command = build_install_command(project.package_manager);
    let mut command = Command::new("cmd.exe");
    command
        .args(["/d", "/s", "/c", install_command.as_str()])
        .current_dir(project_path)
        .env("PATH", runtime_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .await
        .map_err(|error| format!("閹笛嗩攽鐎瑰顥婇崨鎴掓姢婢惰精瑙? {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(if stderr.is_empty() { stdout } else { stderr })
}

async fn install_project_dependencies_if_missing_with_logs(
    runtime_manager: &RuntimeManager,
    app: &AppHandle,
    project: &ProjectConfig,
    project_path: &Path,
    runtime_path: &str,
) -> Result<(), String> {
    ensure_package_manager_available(project.package_manager, runtime_path)?;

    let install_command = build_install_command(project.package_manager);
    let mut command = Command::new("cmd.exe");
    command
        .args(["/d", "/s", "/c", install_command.as_str()])
        .current_dir(project_path)
        .env("PATH", runtime_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .await
        .map_err(|error| format!("鑷姩瀹夎渚濊禆澶辫触: {error}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    for line in stdout.lines().map(str::trim).filter(|line| !line.is_empty()) {
        runtime_manager.consume_output(
            app,
            &project.id,
            ProjectLogLevel::Stdout,
            line.to_string(),
        );
    }

    for line in stderr.lines().map(str::trim).filter(|line| !line.is_empty()) {
        runtime_manager.consume_output(
            app,
            &project.id,
            ProjectLogLevel::Stderr,
            line.to_string(),
        );
    }

    if output.status.success() {
        Ok(())
    } else if !stderr.is_empty() {
        Err(stderr)
    } else {
        Err(stdout)
    }
}

async fn ensure_rimraf_available() -> Result<String, String> {
    if let Some(command_path) = resolve_global_command_path("rimraf", None)? {
        return Ok(command_path);
    }

    if !is_command_available("npm", None)? {
        return Err("未找到 npm，无法自动安装 rimraf。".to_string());
    }

    let mut command = Command::new("cmd.exe");
    command
        .args(["/d", "/s", "/c", "npm install -g rimraf"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .await
        .map_err(|error| format!("瀹夎 rimraf 澶辫触: {error}"))?;

    if output.status.success() {
        if let Some(command_path) = resolve_global_command_path("rimraf", None)? {
            return Ok(command_path);
        }
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err("安装 rimraf 失败。".to_string())
    } else {
        Err(format!("瀹夎 rimraf 澶辫触: {stderr}"))
    }
}

pub async fn ensure_delete_tool_ready() -> Result<bool, String> {
    if resolve_global_command_path("rimraf", None)?.is_some() {
        return Ok(false);
    }

    ensure_rimraf_available().await.map(|_| true)
}

pub fn is_delete_tool_ready() -> Result<bool, String> {
    Ok(resolve_global_command_path("rimraf", None)?.is_some())
}

fn is_command_available(command_name: &str, runtime_path: Option<&str>) -> Result<bool, String> {
    let mut command = std::process::Command::new("where.exe");
    command.arg(command_name);

    if let Some(path) = runtime_path {
        command.env("PATH", path);
    }

    command
        .output()
        .map(|output| output.status.success())
        .map_err(|error| format!("妫€鏌ュ懡浠ゅけ璐? {error}"))
}

fn resolve_global_command_path(
    command_name: &str,
    runtime_path: Option<&str>,
) -> Result<Option<String>, String> {
    let mut command = std::process::Command::new("where.exe");
    command.arg(command_name);

    if let Some(path) = runtime_path {
        command.env("PATH", path);
    }

    let output = command
        .output()
        .map_err(|error| format!("濡偓閺屻儱鎳℃禒銈呫亼鐠? {error}"))?;

    if !output.status.success() {
        return Ok(None);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut matches = stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !line.to_ascii_lowercase().contains("\\node_modules\\.bin\\"))
        .collect::<Vec<_>>();

    matches.sort_by_key(|path| {
        let lowered = path.to_ascii_lowercase();
        if lowered.ends_with(".cmd") {
            0
        } else if lowered.ends_with(".exe") {
            1
        } else if lowered.ends_with(".bat") {
            2
        } else {
            3
        }
    });

    Ok(matches.first().map(|path| (*path).to_string()))
}

pub fn open_project_terminal(project_path: &str, node_version: &str) -> Result<(), String> {
    let resolved_path = PathBuf::from(project_path);
    if !resolved_path.exists() || !resolved_path.is_dir() {
        return Err(format!("椤圭洰璺緞涓嶅瓨鍦? {}", resolved_path.display()));
    }

    let node_directory = resolve_project_node_directory(node_version);
    if !node_directory.join("node.exe").exists() {
        return Err(format!("鏈満鏈畨瑁?Node {}", normalize_node_version(node_version)));
    }

    let mut command = std::process::Command::new("cmd.exe");
    command
        .args([
            "/d",
            "/k",
            &format!(
                "cd /d \"{}\" && echo 宸插垏鎹㈠埌 Node v{} && node -v",
                resolved_path.display(),
                normalize_node_version(node_version)
            ),
        ])
        .env("PATH", build_project_runtime_path(node_version));

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NEW_CONSOLE);

    command
        .spawn()
        .map_err(|error| format!("鎵撳紑缁堢澶辫触: {error}"))?;
    Ok(())
}

