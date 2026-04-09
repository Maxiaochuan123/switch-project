use std::{
    env, fs,
    path::{Path, PathBuf},
};

use crate::contracts::normalize_node_version;
use tokio::process::Command;

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn resolve_nvm_home() -> Option<PathBuf> {
    let explicit = env::var("NVM_HOME").ok().map(PathBuf::from);
    let default = env::var("USERPROFILE")
        .ok()
        .map(|home| Path::new(&home).join("AppData").join("Local").join("nvm"));

    explicit
        .or(default)
        .filter(|path| path.exists() && path.is_dir())
}

pub fn list_installed_node_versions() -> Vec<String> {
    let Some(nvm_home) = resolve_nvm_home() else {
        return Vec::new();
    };

    let mut versions = fs::read_dir(nvm_home)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.flatten())
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            if !file_type.is_dir() {
                return None;
            }

            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with('v') {
                return None;
            }

            let version = normalize_node_version(&name);
            if version.split('.').count() == 3 {
                Some(version)
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    versions.sort_by(compare_node_versions);
    versions
}

pub fn resolve_active_node_version() -> Option<String> {
    let output = std::process::Command::new("node").arg("-v").output().ok()?;
    if !output.status.success() {
        return None;
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let normalized = normalize_node_version(&version);
    (!normalized.is_empty()).then_some(normalized)
}

pub async fn install_node_version(version: &str) -> Result<(), String> {
    let normalized_version = normalize_node_version(version);
    if normalized_version.trim().is_empty() {
        return Err("Node 版本不能为空。".to_string());
    }

    if list_installed_node_versions()
        .iter()
        .any(|current| current == &normalized_version)
    {
        return Ok(());
    }

    let nvm_executable = resolve_nvm_executable()
        .ok_or_else(|| "未检测到 nvm-windows，无法自动安装 Node 版本。".to_string())?;

    let mut command = Command::new(nvm_executable);
    command.arg("install").arg(&normalized_version);

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .await
        .map_err(|error| format!("安装 Node 版本失败: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    Err(if !stderr.is_empty() {
        format!("安装 Node 版本失败: {stderr}")
    } else if !stdout.is_empty() {
        format!("安装 Node 版本失败: {stdout}")
    } else {
        "安装 Node 版本失败。".to_string()
    })
}

fn resolve_nvm_executable() -> Option<PathBuf> {
    let nvm_home = resolve_nvm_home()?;
    let executable = nvm_home.join("nvm.exe");
    executable.exists().then_some(executable)
}

fn compare_node_versions(left: &String, right: &String) -> std::cmp::Ordering {
    let left_parts = left
        .split('.')
        .map(|part| part.parse::<u32>().unwrap_or(0))
        .collect::<Vec<_>>();
    let right_parts = right
        .split('.')
        .map(|part| part.parse::<u32>().unwrap_or(0))
        .collect::<Vec<_>>();

    for index in 0..left_parts.len().max(right_parts.len()) {
        let left_part = *left_parts.get(index).unwrap_or(&0);
        let right_part = *right_parts.get(index).unwrap_or(&0);

        if left_part != right_part {
            return right_part.cmp(&left_part);
        }
    }

    std::cmp::Ordering::Equal
}
