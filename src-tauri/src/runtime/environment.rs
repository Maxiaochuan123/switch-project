use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Command,
    sync::{Mutex, OnceLock},
    time::{Duration as StdDuration, Instant},
};
use tokio::process::Command as TokioCommand;

use crate::{
    contracts::{normalize_node_version, package_manager_command_name, ProjectPackageManager},
    node_manager::resolve_fnm_executable,
};

use super::{CREATE_NEW_CONSOLE, CREATE_NO_WINDOW};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const COMMAND_RESOLUTION_CACHE_TTL: StdDuration = StdDuration::from_secs(5);

#[derive(Clone)]
struct TimedCommandValue<T> {
    value: T,
    cached_at: Instant,
}

impl<T> TimedCommandValue<T> {
    fn new(value: T) -> Self {
        Self {
            value,
            cached_at: Instant::now(),
        }
    }

    fn is_fresh(&self) -> bool {
        self.cached_at.elapsed() <= COMMAND_RESOLUTION_CACHE_TTL
    }
}

#[derive(Default)]
struct CommandResolutionCache {
    availability: HashMap<String, TimedCommandValue<bool>>,
    global_paths: HashMap<String, TimedCommandValue<Option<String>>>,
}

fn command_resolution_cache() -> &'static Mutex<CommandResolutionCache> {
    static COMMAND_RESOLUTION_CACHE: OnceLock<Mutex<CommandResolutionCache>> = OnceLock::new();
    COMMAND_RESOLUTION_CACHE.get_or_init(|| Mutex::new(CommandResolutionCache::default()))
}

pub(crate) fn clear_command_resolution_cache() {
    *command_resolution_cache()
        .lock()
        .expect("command resolution cache poisoned") = CommandResolutionCache::default();
}

pub(crate) fn ensure_start_command_available(
    start_command: &str,
    node_version: &str,
) -> Result<(), String> {
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

    if builtin
        || command_name.contains('\\')
        || command_name.contains('/')
        || Path::new(&command_name).is_absolute()
    {
        return Ok(());
    }

    if is_command_available(&command_name, Some(node_version))? {
        return Ok(());
    }

    Err(format!(
        "未找到启动命令 {}. 请先安装后再启动项目.",
        command_name
    ))
}

pub(crate) fn ensure_package_manager_available(
    package_manager: ProjectPackageManager,
    node_version: &str,
) -> Result<(), String> {
    if is_command_available(package_manager_command_name(package_manager), Some(node_version))? {
        return Ok(());
    }

    Err(format!(
        "未找到包管理器 {}. 请先安装后再继续.",
        package_manager_command_name(package_manager)
    ))
}

pub(super) fn create_context_command(
    program: &str,
    args: Vec<String>,
    node_version: Option<&str>,
    working_dir: Option<&Path>,
) -> Result<Command, String> {
    let (executable, invocation_args) = build_context_invocation(program, args, node_version)?;
    let mut command = Command::new(executable);
    command.args(invocation_args);

    if let Some(working_dir) = working_dir {
        command.current_dir(working_dir);
    }

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    Ok(command)
}

pub(crate) fn create_async_context_command(
    program: &str,
    args: Vec<String>,
    node_version: Option<&str>,
    working_dir: Option<&Path>,
) -> Result<TokioCommand, String> {
    let (executable, invocation_args) = build_context_invocation(program, args, node_version)?;
    let mut command = TokioCommand::new(executable);
    command.args(invocation_args);

    if let Some(working_dir) = working_dir {
        command.current_dir(working_dir);
    }

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    Ok(command)
}

pub(super) fn is_command_available(
    command_name: &str,
    node_version: Option<&str>,
) -> Result<bool, String> {
    let cache_key = build_command_cache_key(command_name, node_version);
    if let Some(result) = command_resolution_cache()
        .lock()
        .expect("command resolution cache poisoned")
        .availability
        .get(&cache_key)
        .filter(|entry| entry.is_fresh())
        .map(|entry| entry.value)
    {
        return Ok(result);
    }

    let output = create_context_command(
        "where.exe",
        vec![command_name.to_string()],
        node_version,
        None,
    )?
        .output()
        .map_err(|error| format!("检查命令失败: {error}"))?;

    let is_available =
        output.status.success()
            && String::from_utf8_lossy(&output.stdout)
                .lines()
                .any(|line| !line.trim().is_empty());

    command_resolution_cache()
        .lock()
        .expect("command resolution cache poisoned")
        .availability
        .insert(cache_key, TimedCommandValue::new(is_available));

    Ok(is_available)
}

pub(super) fn resolve_global_command_path(
    command_name: &str,
    node_version: Option<&str>,
) -> Result<Option<String>, String> {
    let cache_key = build_command_cache_key(command_name, node_version);
    if let Some(result) = command_resolution_cache()
        .lock()
        .expect("command resolution cache poisoned")
        .global_paths
        .get(&cache_key)
        .filter(|entry| entry.is_fresh())
        .map(|entry| entry.value.clone())
    {
        return Ok(result);
    }

    let output = create_context_command(
        "where.exe",
        vec![command_name.to_string()],
        node_version,
        None,
    )?
        .output()
        .map_err(|error| format!("查找命令失败: {error}"))?;

    if !output.status.success() {
        command_resolution_cache()
            .lock()
            .expect("command resolution cache poisoned")
            .global_paths
            .insert(cache_key, TimedCommandValue::new(None));
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

    let resolved_path = matches.first().map(|path| (*path).to_string());
    command_resolution_cache()
        .lock()
        .expect("command resolution cache poisoned")
        .global_paths
        .insert(cache_key, TimedCommandValue::new(resolved_path.clone()));

    Ok(resolved_path)
}

pub fn open_project_terminal(project_path: &str, node_version: &str) -> Result<(), String> {
    let resolved_path = PathBuf::from(project_path);
    if !resolved_path.exists() || !resolved_path.is_dir() {
        return Err(format!("项目路径不存在: {}", resolved_path.display()));
    }

    let script = format!(
        "Write-Host \"已切换到 Node v{}\"\nnode -v\n",
        normalize_node_version(node_version)
    );
    let mut command = create_context_command(
        "powershell.exe",
        vec![
            "-NoLogo".to_string(),
            "-NoExit".to_string(),
            "-ExecutionPolicy".to_string(),
            "Bypass".to_string(),
            "-Command".to_string(),
            script,
        ],
        Some(node_version),
        Some(&resolved_path),
    )?;

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NEW_CONSOLE);

    command
        .spawn()
        .map_err(|error| format!("打开终端失败: {error}"))?;
    Ok(())
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

    trimmed
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_string()
}

fn build_context_invocation(
    program: &str,
    args: Vec<String>,
    node_version: Option<&str>,
) -> Result<(PathBuf, Vec<String>), String> {
    let Some(node_version) = node_version else {
        return Ok((PathBuf::from(program), args));
    };

    let fnm_executable =
        resolve_fnm_executable().ok_or_else(|| "未检测到 fnm，请先安装 fnm。".to_string())?;
    let normalized_version = normalize_node_version(node_version);
    let mut invocation_args = Vec::with_capacity(args.len() + 4);
    invocation_args.push("exec".to_string());
    invocation_args.push(format!("--using={normalized_version}"));
    invocation_args.push("--log-level=error".to_string());
    invocation_args.push(program.to_string());
    invocation_args.extend(args);

    Ok((fnm_executable, invocation_args))
}

fn build_command_cache_key(command_name: &str, node_version: Option<&str>) -> String {
    let normalized_version = node_version
        .map(normalize_node_version)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "system".to_string());

    format!(
        "{}::{}",
        normalized_version,
        command_name.trim().to_ascii_lowercase()
    )
}
