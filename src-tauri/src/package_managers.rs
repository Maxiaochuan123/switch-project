use std::path::Path;

use crate::contracts::{package_manager_command_name, ProjectPackageManager};

pub fn list_available_package_managers() -> Vec<ProjectPackageManager> {
    [
        ProjectPackageManager::Npm,
        ProjectPackageManager::Pnpm,
        ProjectPackageManager::Cnpm,
        ProjectPackageManager::Yarn,
    ]
    .into_iter()
    .filter(|package_manager| is_package_manager_available(*package_manager, None))
    .collect()
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
