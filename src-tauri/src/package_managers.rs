use std::{
    path::Path,
    sync::{Mutex, OnceLock},
    time::{Duration as StdDuration, Instant},
};

use crate::contracts::{package_manager_command_name, ProjectPackageManager};

const PACKAGE_MANAGER_CACHE_TTL: StdDuration = StdDuration::from_secs(5);

#[derive(Clone)]
struct TimedPackageManagers {
    value: Vec<ProjectPackageManager>,
    cached_at: Instant,
}

impl TimedPackageManagers {
    fn new(value: Vec<ProjectPackageManager>) -> Self {
        Self {
            value,
            cached_at: Instant::now(),
        }
    }

    fn is_fresh(&self) -> bool {
        self.cached_at.elapsed() <= PACKAGE_MANAGER_CACHE_TTL
    }
}

fn available_package_managers_cache() -> &'static Mutex<Option<TimedPackageManagers>> {
    static PACKAGE_MANAGER_CACHE: OnceLock<Mutex<Option<TimedPackageManagers>>> = OnceLock::new();
    PACKAGE_MANAGER_CACHE.get_or_init(|| Mutex::new(None))
}

pub fn list_available_package_managers() -> Vec<ProjectPackageManager> {
    if let Some(cached) = available_package_managers_cache()
        .lock()
        .expect("package manager cache poisoned")
        .as_ref()
        .filter(|entry| entry.is_fresh())
        .map(|entry| entry.value.clone())
    {
        return cached;
    }

    let available = [
        ProjectPackageManager::Npm,
        ProjectPackageManager::Pnpm,
        ProjectPackageManager::Cnpm,
        ProjectPackageManager::Yarn,
    ]
    .into_iter()
    .filter(|package_manager| is_package_manager_available(*package_manager, None))
    .collect::<Vec<_>>();

    *available_package_managers_cache()
        .lock()
        .expect("package manager cache poisoned") =
        Some(TimedPackageManagers::new(available.clone()));

    available
}

pub fn detect_project_package_manager(path: &Path) -> ProjectPackageManager {
    if path.join("pnpm-lock.yaml").exists() {
        return ProjectPackageManager::Pnpm;
    }

    if path.join("yarn.lock").exists() {
        return ProjectPackageManager::Yarn;
    }

    ProjectPackageManager::Npm
}

pub fn is_package_manager_available(
    package_manager: ProjectPackageManager,
    runtime_path: Option<&str>,
) -> bool {
    let mut command = std::process::Command::new("where.exe");
    command.arg(package_manager_command_name(package_manager));

    if let Some(path) = runtime_path {
        command.env("PATH", path);
    }

    command
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}
