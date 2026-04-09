use tauri::{AppHandle, Emitter};

use crate::contracts::{
    backend_error, BackendErrorCode, DependencyOperation, OperationEvent, OperationStatus,
    OperationType, ProjectConfig, ProjectRuntime,
};

pub(super) fn emit_runtime_update(app: &AppHandle, runtime: &ProjectRuntime) {
    let _ = app.emit("runtime-update", runtime.clone());
}

pub(super) fn emit_dependency_operation(
    app: &AppHandle,
    project: &ProjectConfig,
    operation: DependencyOperation,
    status: OperationStatus,
    title: &str,
    message: Option<String>,
    error: Option<String>,
) {
    emit_operation(
        app,
        OperationEvent {
            operation_id: dependency_operation_id(&project.id, operation),
            operation_type: dependency_operation_type(operation),
            status,
            title: title.to_string(),
            project_id: Some(project.id.clone()),
            project_name: Some(project.name.clone()),
            message: message.clone(),
            error: error.map(|value| {
                let mut backend = backend_error(BackendErrorCode::Unknown, value);
                backend.detail = message.clone();
                backend
            }),
        },
    );
}

fn dependency_operation_type(operation: DependencyOperation) -> OperationType {
    match operation {
        DependencyOperation::Delete => OperationType::DependencyDelete,
        DependencyOperation::Reinstall => OperationType::DependencyReinstall,
    }
}

fn dependency_operation_id(project_id: &str, operation: DependencyOperation) -> String {
    let operation_type = match operation {
        DependencyOperation::Delete => "dependency-delete",
        DependencyOperation::Reinstall => "dependency-reinstall",
    };

    format!("{operation_type}:{project_id}")
}

fn emit_operation(app: &AppHandle, event: OperationEvent) {
    let _ = app.emit("operation", event);
}
