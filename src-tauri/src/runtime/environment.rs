use std::{
    path::{Path, PathBuf},
    process::Command,
};

use crate::{
    contracts::{normalize_node_version, package_manager_command_name, ProjectPackageManager},
    node_versions::resolve_nvm_home,
    package_managers::is_package_manager_available,
};

use super::CREATE_NEW_CONSOLE;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

pub(super) fn resolve_project_node_directory(node_version: &str) -> PathBuf {
    let nvm_home = resolve_nvm_home().unwrap_or_default();
    nvm_home.join(format!("v{}", normalize_node_version(node_version)))
}

pub(super) fn build_project_runtime_path(node_version: &str) -> String {
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

pub(super) fn ensure_start_command_available(
    start_command: &str,
    runtime_path: &str,
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

    let output = std::process::Command::new("where.exe")
        .arg(&command_name)
        .env("PATH", runtime_path)
        .output()
        .map_err(|error| format!("检查启动命令失败: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    Err(format!(
        "未找到启动命令 {}. 请先安装后再启动项目.",
        command_name
    ))
}

pub(super) fn ensure_package_manager_available(
    package_manager: ProjectPackageManager,
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

pub(super) fn is_command_available(
    command_name: &str,
    runtime_path: Option<&str>,
) -> Result<bool, String> {
    let mut command = std::process::Command::new("where.exe");
    command.arg(command_name);

    if let Some(path) = runtime_path {
        command.env("PATH", path);
    }

    command
        .output()
        .map(|output| output.status.success())
        .map_err(|error| format!("检查命令失败: {error}"))
}

pub(super) fn resolve_global_command_path(
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
        .map_err(|error| format!("查找命令失败: {error}"))?;

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
        return Err(format!("项目路径不存在: {}", resolved_path.display()));
    }

    let node_directory = resolve_project_node_directory(node_version);
    if !node_directory.join("node.exe").exists() {
        return Err(format!(
            "本机还没有安装 Node {}",
            normalize_node_version(node_version)
        ));
    }

    let mut command = Command::new("cmd.exe");
    command.args([
        "/d",
        "/k",
        &format!(
            "cd /d \"{}\" && echo 已切换到 Node v{} && node -v",
            resolved_path.display(),
            normalize_node_version(node_version)
        ),
    ]);
    command.env("PATH", build_project_runtime_path(node_version));

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
