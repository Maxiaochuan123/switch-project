use tauri::{AppHandle, Manager};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, BufReader},
    process::Child,
};

use crate::contracts::ProjectLogLevel;

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
    let exit_result = child.wait().await;
    let exit_code = exit_result.as_ref().ok().and_then(|status| status.code());
    let state = app.state::<crate::ManagedState>();
    state.runtime_manager.finish_runtime_after_exit(
        &app,
        &project_id,
        exit_code,
        exit_result.err().map(|error| error.to_string()),
    );
}
