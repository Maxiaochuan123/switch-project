use tauri::{AppHandle, Manager};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, BufReader},
    process::Child,
};

use crate::contracts::{ProjectLogLevel, ProjectStatus};

pub(super) async fn read_stream<R>(
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

pub(super) async fn wait_for_exit(app: AppHandle, project_id: String, mut child: Child) {
    let exit_code = child.wait().await.ok().and_then(|status| status.code());
    let state = app.state::<crate::ManagedState>();
    let message = if exit_code == Some(0) || exit_code.is_none() {
        Some("进程已结束。".to_string())
    } else {
        Some(format!(
            "进程异常退出，退出码 {}。",
            exit_code.unwrap_or(-1)
        ))
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
