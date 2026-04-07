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
};
use url::Url;

use crate::{
    contracts::{
        normalize_node_version, ProjectAddress, ProjectAddressKind, ProjectConfig, ProjectLogEntry,
        ProjectLogLevel, ProjectRuntime, ProjectStatus,
    },
    node_versions::resolve_nvm_home,
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
            let message = format!("项目路径不存在: {}", project_path.display());
            self.emit_start_error(app, &project.id, started_at, start_timestamp_ms, message.clone());
            return Err(message);
        }

        let node_directory = resolve_project_node_directory(&project.node_version);
        if !node_directory.join("node.exe").exists() {
            let message = format!(
                "本机未通过 nvm-windows 安装 Node {}",
                normalize_node_version(&project.node_version)
            );
            self.emit_start_error(app, &project.id, started_at, start_timestamp_ms, message.clone());
            return Err(message);
        }

        let runtime_path = build_project_runtime_path(&project.node_version);
        ensure_start_command_available(&project.start_command, &runtime_path)?;

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

        let pid = child.id().ok_or_else(|| "无法读取项目进程 PID".to_string())?;
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
                recent_logs: Vec::new(),
            },
        };

        self.push_logs(
            &mut entry,
            ProjectLogLevel::System,
            vec![
                "校验环境完成。".to_string(),
                format!("正在使用 Node v{} 启动项目。", normalize_node_version(&project.node_version)),
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
                    ProjectAddressKind::Local => "本地地址".to_string(),
                    ProjectAddressKind::Network => "局域网地址".to_string(),
                    ProjectAddressKind::Other => "其他地址".to_string(),
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

fn resolve_project_node_directory(node_version: &str) -> PathBuf {
    let nvm_home = resolve_nvm_home().unwrap_or_default();
    nvm_home.join(format!("v{}", normalize_node_version(node_version)))
}

fn build_project_runtime_path(node_version: &str) -> String {
    let current_path = std::env::var("PATH").unwrap_or_default();
    let node_directory = resolve_project_node_directory(node_version)
        .to_string_lossy()
        .to_string();
    let nvm_home = resolve_nvm_home()
        .map(|path| path.to_string_lossy().to_string().to_lowercase())
        .unwrap_or_default();
    let nvm_symlink = std::env::var("NVM_SYMLINK")
        .unwrap_or_default()
        .to_lowercase();

    let filtered = current_path
        .split(';')
        .filter(|segment| !segment.trim().is_empty())
        .filter(|segment| {
            let normalized = segment.to_lowercase();
            if normalized == node_directory.to_lowercase() {
                return false;
            }

            if !nvm_symlink.is_empty() && normalized == nvm_symlink {
                return false;
            }

            if !nvm_home.is_empty() && normalized.starts_with(&format!("{nvm_home}\\v")) {
                return false;
            }

            true
        })
        .collect::<Vec<_>>();

    std::iter::once(node_directory)
        .chain(filtered.into_iter().map(str::to_string))
        .collect::<Vec<_>>()
        .join(";")
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
        .map_err(|error| format!("检查启动命令失败: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    Err(format!(
        "未找到启动命令: {}。请先安装后再启动项目。",
        command_name
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

pub fn open_project_terminal(project_path: &str, node_version: &str) -> Result<(), String> {
    let resolved_path = PathBuf::from(project_path);
    if !resolved_path.exists() || !resolved_path.is_dir() {
        return Err(format!("项目路径不存在: {}", resolved_path.display()));
    }

    let node_directory = resolve_project_node_directory(node_version);
    if !node_directory.join("node.exe").exists() {
        return Err(format!("本机未安装 Node {}", normalize_node_version(node_version)));
    }

    let mut command = std::process::Command::new("cmd.exe");
    command
        .args([
            "/d",
            "/k",
            &format!(
                "cd /d \"{}\" && echo 已切换到 Node v{} && node -v",
                resolved_path.display(),
                normalize_node_version(node_version)
            ),
        ])
        .env("PATH", build_project_runtime_path(node_version));

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NEW_CONSOLE);

    command
        .spawn()
        .map_err(|error| format!("打开终端失败: {error}"))?;
    Ok(())
}
