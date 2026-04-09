use std::{
    path::{Path, PathBuf},
    process::Stdio,
};

use tauri::{AppHandle, Manager};
use tokio::{process::Command, task};

use crate::contracts::{
    build_install_command, DependencyOperation, OperationStatus, ProjectConfig, ProjectLogLevel,
};

use super::{
    environment::{
        build_project_runtime_path, ensure_package_manager_available, is_command_available,
        resolve_global_command_path,
    },
    events::emit_dependency_operation,
    RuntimeManager, CREATE_NO_WINDOW,
};

async fn ensure_rimraf_available_with_event(
    app: &AppHandle,
    project: &ProjectConfig,
    operation: DependencyOperation,
) -> Result<String, String> {
    if !is_delete_tool_ready()? {
        emit_dependency_operation(
            app,
            project,
            operation,
            OperationStatus::Running,
            "正在安装删除工具",
            Some("未检测到 rimraf，正在全局安装删除工具。".to_string()),
            None,
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
            &project,
            operation,
            OperationStatus::Running,
            "正在删除依赖",
            Some("正在删除依赖，请稍候。".to_string()),
            None,
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
            &project,
            operation,
            OperationStatus::Success,
            "依赖已删除",
            Some("依赖目录已经删除。".to_string()),
            None,
        ),
        Err(message) => emit_dependency_operation(
            &app,
            &project,
            operation,
            OperationStatus::Error,
            "删除依赖失败",
            Some(message.clone()),
            Some(message),
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
                &project,
                operation,
                OperationStatus::Running,
                "正在删除旧依赖",
                Some("正在删除旧依赖，请稍候。".to_string()),
                None,
            );

            remove_node_modules_directory_with_command(&node_modules_path, &rimraf_command).await?;
        }

        emit_dependency_operation(
            &app,
            &project,
            operation,
            OperationStatus::Running,
            "正在安装依赖",
            Some("正在安装依赖，请稍候。".to_string()),
            None,
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
            &project,
            operation,
            OperationStatus::Success,
            "依赖已重装",
            Some("依赖已经重新安装完成。".to_string()),
            None,
        ),
        Err(message) => emit_dependency_operation(
            &app,
            &project,
            operation,
            OperationStatus::Error,
            "重装依赖失败",
            Some(message.clone()),
            Some(message),
        ),
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

pub(super) async fn install_project_dependencies_if_missing(
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
        .map_err(|error| format!("安装依赖失败: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(if stderr.is_empty() { stdout } else { stderr })
}

pub(super) async fn install_project_dependencies_if_missing_with_logs(
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
        .map_err(|error| format!("自动安装依赖失败: {error}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    for line in stdout.lines().map(str::trim).filter(|line| !line.is_empty()) {
        runtime_manager.consume_output(app, &project.id, ProjectLogLevel::Stdout, line.to_string());
    }

    for line in stderr.lines().map(str::trim).filter(|line| !line.is_empty()) {
        runtime_manager.consume_output(app, &project.id, ProjectLogLevel::Stderr, line.to_string());
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
        .map_err(|error| format!("安装 rimraf 失败: {error}"))?;

    if output.status.success() {
        if let Some(command_path) = resolve_global_command_path("rimraf", None)? {
            return Ok(command_path);
        }
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err("安装 rimraf 失败。".to_string())
    } else {
        Err(format!("安装 rimraf 失败: {stderr}"))
    }
}
