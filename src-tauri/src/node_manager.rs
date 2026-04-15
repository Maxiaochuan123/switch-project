use std::{
    collections::HashSet,
    env, fs,
    path::{Path, PathBuf},
    process::Command as StdCommand,
    sync::{Mutex, OnceLock},
    time::{Duration as StdDuration, Instant},
};

use regex::Regex;
use tokio::process::Command;
use tokio::time::{sleep, Duration};

use crate::contracts::{
    normalize_node_version, NodeManagerInstallAttempt, NodeManagerInstallResult,
};

const CREATE_NO_WINDOW: u32 = 0x08000000;
const WINGET_NO_APPLICABLE_UPGRADE_EXIT_CODE: i32 = -1978335189;
const NODE_MANAGER_CACHE_TTL: StdDuration = StdDuration::from_secs(5);

#[derive(Clone)]
struct TimedCacheValue<T> {
    value: T,
    cached_at: Instant,
}

impl<T> TimedCacheValue<T> {
    fn new(value: T) -> Self {
        Self {
            value,
            cached_at: Instant::now(),
        }
    }

    fn is_fresh(&self) -> bool {
        self.cached_at.elapsed() <= NODE_MANAGER_CACHE_TTL
    }
}

#[derive(Default)]
struct NodeManagerCache {
    fnm_executable: Option<TimedCacheValue<PathBuf>>,
    node_manager_version: Option<TimedCacheValue<String>>,
    active_node_version: Option<TimedCacheValue<String>>,
    installed_node_versions: Option<TimedCacheValue<Vec<String>>>,
    nvm_installed_node_versions: Option<TimedCacheValue<Vec<String>>>,
}

fn node_manager_cache() -> &'static Mutex<NodeManagerCache> {
    static NODE_MANAGER_CACHE: OnceLock<Mutex<NodeManagerCache>> = OnceLock::new();
    NODE_MANAGER_CACHE.get_or_init(|| Mutex::new(NodeManagerCache::default()))
}

pub fn clear_node_manager_cache() {
    *node_manager_cache()
        .lock()
        .expect("node manager cache poisoned") = NodeManagerCache::default();
}

pub fn is_node_manager_available() -> bool {
    resolve_node_manager_version().is_some()
}

pub fn resolve_node_manager_version() -> Option<String> {
    if let Some(version) = node_manager_cache()
        .lock()
        .expect("node manager cache poisoned")
        .node_manager_version
        .as_ref()
        .filter(|entry| entry.is_fresh())
        .map(|entry| entry.value.clone())
    {
        return Some(version);
    }

    let fnm_executable = resolve_fnm_executable()?;
    let output = StdCommand::new(fnm_executable)
        .arg("--version")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if version.is_empty() {
        return None;
    }

    node_manager_cache()
        .lock()
        .expect("node manager cache poisoned")
        .node_manager_version = Some(TimedCacheValue::new(version.clone()));

    Some(version)
}

pub fn resolve_active_node_version() -> Option<String> {
    if let Some(version) = node_manager_cache()
        .lock()
        .expect("node manager cache poisoned")
        .active_node_version
        .as_ref()
        .filter(|entry| entry.is_fresh())
        .map(|entry| entry.value.clone())
    {
        return Some(version);
    }

    let output = StdCommand::new("node").arg("-v").output().ok()?;
    if !output.status.success() {
        return None;
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let normalized = normalize_node_version(&version);
    if normalized.is_empty() {
        return None;
    }

    node_manager_cache()
        .lock()
        .expect("node manager cache poisoned")
        .active_node_version = Some(TimedCacheValue::new(normalized.clone()));

    Some(normalized)
}

pub fn list_installed_node_versions() -> Vec<String> {
    if let Some(versions) = node_manager_cache()
        .lock()
        .expect("node manager cache poisoned")
        .installed_node_versions
        .as_ref()
        .filter(|entry| entry.is_fresh())
        .map(|entry| entry.value.clone())
    {
        return versions;
    }

    let Some(fnm_executable) = resolve_fnm_executable() else {
        return Vec::new();
    };

    let output = StdCommand::new(fnm_executable).arg("list").output();
    let Ok(output) = output else {
        return Vec::new();
    };

    if !output.status.success() {
        return Vec::new();
    }

    let versions = parse_installed_versions(&String::from_utf8_lossy(&output.stdout));
    node_manager_cache()
        .lock()
        .expect("node manager cache poisoned")
        .installed_node_versions = Some(TimedCacheValue::new(versions.clone()));
    versions
}

pub fn list_nvm_installed_node_versions() -> Vec<String> {
    if let Some(versions) = node_manager_cache()
        .lock()
        .expect("node manager cache poisoned")
        .nvm_installed_node_versions
        .as_ref()
        .filter(|entry| entry.is_fresh())
        .map(|entry| entry.value.clone())
    {
        return versions;
    }

    let Some(nvm_executable) = resolve_nvm_executable() else {
        return Vec::new();
    };

    let output = StdCommand::new(nvm_executable).arg("ls").output();
    let Ok(output) = output else {
        return Vec::new();
    };

    if !output.status.success() {
        return Vec::new();
    }

    let versions = parse_installed_versions(&String::from_utf8_lossy(&output.stdout));
    node_manager_cache()
        .lock()
        .expect("node manager cache poisoned")
        .nvm_installed_node_versions = Some(TimedCacheValue::new(versions.clone()));
    versions
}

pub async fn install_node_manager() -> NodeManagerInstallResult {
    if is_node_manager_available() {
        return NodeManagerInstallResult {
            success: true,
            message: "fnm 已可用，无需重复安装。".to_string(),
            installer: None,
            version: resolve_node_manager_version(),
            attempts: Vec::new(),
        };
    }

    let installers = available_installers();
    if installers.is_empty() {
        return NodeManagerInstallResult {
            success: false,
            message: format!(
                "未检测到可用的自动安装器。当前仅支持通过 {} 自动安装 fnm，请先手动安装后再重试。",
                ["winget", "scoop", "choco"].join(" / ")
            ),
            installer: None,
            version: None,
            attempts: Vec::new(),
        };
    }

    let mut attempts = Vec::new();

    for installer in installers {
        match run_installer(&installer).await {
            Ok(output) => {
                attempts.push(build_install_attempt(&installer, &output));

                if wait_for_node_manager_detection().await {
                    return NodeManagerInstallResult {
                        success: true,
                        message: build_install_success_message(&installer, &output),
                        installer: Some(installer.label.to_string()),
                        version: resolve_node_manager_version(),
                        attempts,
                    };
                }

                if output.status.success() {
                    return NodeManagerInstallResult {
                        success: false,
                        message: format!(
                            "{} 已执行完成，但当前应用暂时没有检测到 fnm。你可以稍后点击“重新检测”，或先查看安装日志确认输出。",
                            installer.label
                        ),
                        installer: Some(installer.label.to_string()),
                        version: None,
                        attempts,
                    };
                }
            }
            Err(error) => {
                attempts.push(NodeManagerInstallAttempt {
                    installer: installer.label.to_string(),
                    command: installer.display_command(),
                    exit_code: None,
                    stdout: None,
                    stderr: Some(error.to_string()),
                });
            }
        }
    }

    let installer = attempts.last().map(|attempt| attempt.installer.clone());
    NodeManagerInstallResult {
        success: false,
        message: "自动安装 fnm 失败。可以查看安装日志确认每个安装器的输出。".to_string(),
        installer,
        version: None,
        attempts,
    }
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

    let fnm_executable = resolve_fnm_executable()
        .ok_or_else(|| "未检测到 fnm，无法自动安装 Node 版本。".to_string())?;

    let mut command = Command::new(fnm_executable);
    command
        .arg("install")
        .arg(&normalized_version)
        .arg("--corepack-enabled");

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .await
        .map_err(|error| format!("安装 Node 版本失败: {error}"))?;

    if output.status.success() {
        clear_node_manager_cache();
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

pub fn resolve_fnm_executable() -> Option<PathBuf> {
    if let Some(path) = node_manager_cache()
        .lock()
        .expect("node manager cache poisoned")
        .fnm_executable
        .as_ref()
        .filter(|entry| entry.is_fresh())
        .map(|entry| entry.value.clone())
    {
        return Some(path);
    }

    let resolved = resolve_executable_from_path("fnm")
        .or_else(resolve_fnm_executable_from_common_locations)?;

    node_manager_cache()
        .lock()
        .expect("node manager cache poisoned")
        .fnm_executable = Some(TimedCacheValue::new(resolved.clone()));

    Some(resolved)
}

fn resolve_nvm_executable() -> Option<PathBuf> {
    resolve_executable_from_path("nvm").or_else(resolve_nvm_executable_from_common_locations)
}

fn parse_installed_versions(output: &str) -> Vec<String> {
    let version_pattern =
        Regex::new(r"(?i)\bv?(?P<version>\d+\.\d+\.\d+)\b").expect("valid fnm version regex");
    let mut seen = HashSet::new();
    let mut versions = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("system") {
            continue;
        }

        let Some(captures) = version_pattern.captures(trimmed) else {
            continue;
        };

        let version = normalize_node_version(&captures["version"]);
        if seen.insert(version.clone()) {
            versions.push(version);
        }
    }

    versions.sort_by(compare_node_versions);
    versions
}

fn resolve_executable_from_path(command_name: &str) -> Option<PathBuf> {
    let output = StdCommand::new("where.exe")
        .arg(command_name)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(PathBuf::from)
        .filter(|path| path.exists())
}

fn resolve_fnm_executable_from_common_locations() -> Option<PathBuf> {
    fn dedupe_push(target: &mut Vec<PathBuf>, candidate: PathBuf) {
        if !target.iter().any(|existing| existing == &candidate) {
            target.push(candidate);
        }
    }

    let mut candidates = Vec::new();

    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        let local_app_data = Path::new(&local_app_data);
        dedupe_push(&mut candidates, local_app_data.join("fnm").join("fnm.exe"));
        dedupe_push(
            &mut candidates,
            local_app_data
                .join("Microsoft")
                .join("WinGet")
                .join("Links")
                .join("fnm.exe"),
        );
        dedupe_push(
            &mut candidates,
            local_app_data
                .join("Microsoft")
                .join("WindowsApps")
                .join("fnm.exe"),
        );

        for candidate in resolve_winget_package_candidates(local_app_data) {
            dedupe_push(&mut candidates, candidate);
        }
    }

    if let Some(home_dir) = dirs::home_dir() {
        dedupe_push(
            &mut candidates,
            home_dir.join("scoop").join("shims").join("fnm.exe"),
        );
    }

    if let Some(program_data) = env::var_os("ProgramData") {
        dedupe_push(
            &mut candidates,
            Path::new(&program_data)
                .join("chocolatey")
                .join("bin")
                .join("fnm.exe"),
        );
    }

    candidates.into_iter().find(|candidate| candidate.exists())
}

fn resolve_nvm_executable_from_common_locations() -> Option<PathBuf> {
    fn dedupe_push(target: &mut Vec<PathBuf>, candidate: PathBuf) {
        if !target.iter().any(|existing| existing == &candidate) {
            target.push(candidate);
        }
    }

    let mut candidates = Vec::new();

    if let Some(nvm_home) = env::var_os("NVM_HOME") {
        dedupe_push(&mut candidates, Path::new(&nvm_home).join("nvm.exe"));
    }

    if let Some(home_dir) = dirs::home_dir() {
        dedupe_push(
            &mut candidates,
            home_dir
                .join("AppData")
                .join("Roaming")
                .join("nvm")
                .join("nvm.exe"),
        );
        dedupe_push(&mut candidates, home_dir.join("nvm").join("nvm.exe"));
    }

    if let Some(program_files) = env::var_os("ProgramFiles") {
        dedupe_push(
            &mut candidates,
            Path::new(&program_files).join("nvm").join("nvm.exe"),
        );
    }

    if let Some(program_files_x86) = env::var_os("ProgramFiles(x86)") {
        dedupe_push(
            &mut candidates,
            Path::new(&program_files_x86).join("nvm").join("nvm.exe"),
        );
    }

    candidates.into_iter().find(|candidate| candidate.exists())
}

fn resolve_winget_package_candidates(local_app_data: &Path) -> Vec<PathBuf> {
    let packages_directory = local_app_data
        .join("Microsoft")
        .join("WinGet")
        .join("Packages");
    let Ok(entries) = fs::read_dir(packages_directory) else {
        return Vec::new();
    };

    entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let entry_path = entry.path();
            let directory_name = entry.file_name().to_string_lossy().to_string();
            if !directory_name.starts_with("Schniz.fnm_") || !entry_path.is_dir() {
                return None;
            }

            let executable_path = entry_path.join("fnm.exe");
            executable_path.exists().then_some(executable_path)
        })
        .collect()
}

fn is_command_available(command_name: &str) -> bool {
    StdCommand::new("where.exe")
        .arg(command_name)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

struct Installer<'a> {
    label: &'a str,
    command: &'a str,
    args: &'a [&'a str],
}

impl Installer<'_> {
    fn display_command(&self) -> String {
        let args = self.args.join(" ");
        if args.is_empty() {
            self.command.to_string()
        } else {
            format!("{} {}", self.command, args)
        }
    }
}

fn available_installers<'a>() -> Vec<Installer<'a>> {
    let mut installers = Vec::new();

    if is_command_available("winget") {
        installers.push(Installer {
            label: "winget",
            command: "winget",
            args: &[
                "install",
                "--id",
                "Schniz.fnm",
                "--exact",
                "--accept-source-agreements",
                "--accept-package-agreements",
            ],
        });
    }

    if is_command_available("scoop") {
        installers.push(Installer {
            label: "scoop",
            command: "scoop",
            args: &["install", "fnm"],
        });
    }

    if is_command_available("choco") {
        installers.push(Installer {
            label: "choco",
            command: "choco",
            args: &["install", "fnm", "-y"],
        });
    }

    installers
}

async fn run_installer(installer: &Installer<'_>) -> Result<std::process::Output, std::io::Error> {
    let mut command = Command::new(installer.command);
    command.args(installer.args);

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    command.output().await
}

async fn wait_for_node_manager_detection() -> bool {
    for _ in 0..6 {
        clear_node_manager_cache();
        if is_node_manager_available() {
            return true;
        }

        sleep(Duration::from_millis(500)).await;
    }

    false
}

fn build_install_attempt(
    installer: &Installer<'_>,
    output: &std::process::Output,
) -> NodeManagerInstallAttempt {
    NodeManagerInstallAttempt {
        installer: installer.label.to_string(),
        command: installer.display_command(),
        exit_code: output.status.code(),
        stdout: non_empty_output(&output.stdout),
        stderr: non_empty_output(&output.stderr),
    }
}

fn non_empty_output(bytes: &[u8]) -> Option<String> {
    let value = String::from_utf8_lossy(bytes).trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn build_install_success_message(
    installer: &Installer<'_>,
    output: &std::process::Output,
) -> String {
    if output.status.success() {
        return format!("fnm 已通过 {} 安装完成。", installer.label);
    }

    if installer.label == "winget"
        && output.status.code() == Some(WINGET_NO_APPLICABLE_UPGRADE_EXIT_CODE)
    {
        return "系统里已经有 fnm 了，这次直接复用了现有安装。".to_string();
    }

    format!("fnm 已可用，已通过 {} 检测到现有安装。", installer.label)
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
