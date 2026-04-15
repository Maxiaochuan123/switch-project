use crate::contracts::{
    ProjectAddress, ProjectAddressKind, ProjectLogEntry, ProjectLogLevel,
};

use super::{
    address::{extract_addresses_from_message, now_iso, translate_runtime_message},
    RuntimeEntry,
};

const MAX_LOG_ENTRIES: usize = 200;
const MAX_LOG_MESSAGE_LENGTH: usize = 1800;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum StartupTimingSummaryKind {
    Ready,
    Interrupted,
}

pub fn push_logs(entry: &mut RuntimeEntry, level: ProjectLogLevel, messages: Vec<String>) {
    entry.log_sequence += 1;
    entry.runtime.recent_logs.push(ProjectLogEntry {
        id: format!("{}-{}", entry.runtime.project_id, entry.log_sequence),
        at: now_iso(),
        level,
        message: messages.join("\n").chars().take(MAX_LOG_MESSAGE_LENGTH).collect(),
    });

    if entry.runtime.recent_logs.len() > MAX_LOG_ENTRIES {
        let excess = entry.runtime.recent_logs.len() - MAX_LOG_ENTRIES;
        entry.runtime.recent_logs.drain(0..excess);
    }
}

pub fn collect_addresses(entry: &mut RuntimeEntry, message: &str) -> bool {
    let extracted = extract_addresses_from_message(message);
    let mut added_local = false;

    for address in extracted {
        let same_kind_exists = entry
            .runtime
            .detected_addresses
            .iter()
            .any(|current| current.kind == address.kind);
        let same_url_exists = entry
            .runtime
            .detected_addresses
            .iter()
            .any(|current| current.url == address.url);

        if same_kind_exists || same_url_exists {
            continue;
        }

        if address.kind == ProjectAddressKind::Local {
            added_local = true;
        }

        entry.runtime.detected_addresses.push(ProjectAddress {
            url: address.url,
            kind: address.kind,
            label: match address.kind {
                ProjectAddressKind::Local => "本地地址".to_string(),
                ProjectAddressKind::Network => "局域网地址".to_string(),
                ProjectAddressKind::Other => "其他地址".to_string(),
            },
            discovered_at: now_iso(),
        });
    }

    entry
        .runtime
        .detected_addresses
        .sort_by_key(|address| match address.kind {
            ProjectAddressKind::Local => 0,
            ProjectAddressKind::Network => 1,
            ProjectAddressKind::Other => 2,
        });
    entry.runtime.detected_url = entry
        .runtime
        .detected_addresses
        .iter()
        .find(|address| address.kind == ProjectAddressKind::Local)
        .or_else(|| entry.runtime.detected_addresses.first())
        .map(|address| address.url.clone());

    added_local
}

pub fn update_preview(entry: &mut RuntimeEntry, level: ProjectLogLevel, message: &str) {
    if let Some(address) = entry
        .runtime
        .detected_addresses
        .iter()
        .find(|address| address.kind == ProjectAddressKind::Local)
    {
        entry.preview_priority = 2;
        entry.runtime.last_message = Some(format!("已检测到本地地址: {}", address.url));
        return;
    }

    let priority = if level == ProjectLogLevel::Stderr { 2 } else { 1 };
    if priority >= entry.preview_priority {
        entry.preview_priority = priority;
        entry.runtime.last_message = Some(translate_runtime_message(message));
    }
}

pub fn push_startup_timing_summary(
    entry: &mut RuntimeEntry,
    completed_at_ms: i64,
    kind: StartupTimingSummaryKind,
) {
    if entry.startup_timeline.summary_logged {
        return;
    }

    let summary = build_startup_timing_summary(entry, completed_at_ms, kind);
    entry.startup_timeline.summary_logged = true;
    push_logs(entry, ProjectLogLevel::System, vec![summary]);
}

fn build_startup_timing_summary(
    entry: &RuntimeEntry,
    completed_at_ms: i64,
    kind: StartupTimingSummaryKind,
) -> String {
    let timeline = &entry.startup_timeline;
    let environment_ready_at_ms = timeline
        .environment_ready_at_ms
        .unwrap_or(entry.start_timestamp_ms);
    let dependency_stage_end_at_ms = timeline
        .dependency_install_finished_at_ms
        .or(timeline.process_spawned_at_ms)
        .unwrap_or(completed_at_ms);
    let process_spawned_at_ms = timeline.process_spawned_at_ms.unwrap_or(completed_at_ms);
    let ready_or_completed_at_ms = timeline.ready_at_ms.unwrap_or(completed_at_ms);

    let preflight_ms = duration_ms(entry.start_timestamp_ms, environment_ready_at_ms);
    let dependency_ms = if timeline.dependency_install_required {
        duration_ms(
            timeline
                .dependency_install_started_at_ms
                .unwrap_or(environment_ready_at_ms),
            dependency_stage_end_at_ms,
        )
    } else {
        0
    };
    let spawn_ms = if timeline.process_spawned_at_ms.is_some() {
        duration_ms(
            timeline
                .dependency_install_finished_at_ms
                .unwrap_or(environment_ready_at_ms),
            process_spawned_at_ms,
        )
    } else {
        0
    };
    let ready_wait_ms = if timeline.process_spawned_at_ms.is_some() {
        duration_ms(process_spawned_at_ms, ready_or_completed_at_ms)
    } else {
        0
    };
    let total_ms = duration_ms(entry.start_timestamp_ms, completed_at_ms);

    let dependency_label = if timeline.dependency_install_required {
        if timeline.dependency_install_finished_at_ms.is_some() {
            format!("依赖安装 {dependency_ms}ms")
        } else {
            format!("依赖安装 {dependency_ms}ms（未完成）")
        }
    } else {
        "依赖安装 0ms（已跳过）".to_string()
    };

    let spawn_label = if timeline.process_spawned_at_ms.is_some() {
        format!("进程拉起 {spawn_ms}ms")
    } else {
        "进程拉起 0ms（未开始）".to_string()
    };

    let ready_label = if kind == StartupTimingSummaryKind::Ready {
        format!("等待服务就绪 {ready_wait_ms}ms")
    } else if timeline.process_spawned_at_ms.is_some() {
        format!("等待服务就绪 {ready_wait_ms}ms（未就绪）")
    } else {
        "等待服务就绪 0ms（未开始）".to_string()
    };

    let prefix = if kind == StartupTimingSummaryKind::Ready {
        "启动耗时拆解"
    } else {
        "启动未完成，耗时拆解"
    };

    format!(
        "{prefix}：环境校验 {preflight_ms}ms | {dependency_label} | {spawn_label} | {ready_label} | 总计 {total_ms}ms"
    )
}

fn duration_ms(start_ms: i64, end_ms: i64) -> u64 {
    (end_ms - start_ms).max(0) as u64
}

#[cfg(test)]
mod tests {
    use crate::contracts::{ProjectRuntime, ProjectStatus};

    use super::{
        push_logs, push_startup_timing_summary, ProjectLogEntry, ProjectLogLevel, RuntimeEntry,
        StartupTimingSummaryKind,
    };
    use crate::runtime::RuntimeStartupTimeline;

    #[test]
    fn push_logs_continues_existing_log_sequence() {
        let mut entry = build_runtime_entry(
            2,
            vec![
                build_log_entry("test-project-1", ProjectLogLevel::System, "startup ready"),
                build_log_entry("test-project-2", ProjectLogLevel::System, "start command"),
            ],
        );

        push_logs(
            &mut entry,
            ProjectLogLevel::Stdout,
            vec!["server ready".to_string()],
        );

        let latest_log = entry
            .runtime
            .recent_logs
            .last()
            .expect("latest log should exist");

        assert_eq!(entry.log_sequence, 3);
        assert_eq!(entry.runtime.recent_logs.len(), 3);
        assert_eq!(latest_log.id, "test-project-3");
        assert_eq!(latest_log.message, "server ready");
    }

    #[test]
    fn push_logs_keeps_recent_log_limit() {
        let existing_logs = (1..=200)
            .map(|index| {
                build_log_entry(
                    &format!("test-project-{index}"),
                    ProjectLogLevel::Stdout,
                    &format!("log-{index}"),
                )
            })
            .collect::<Vec<_>>();
        let mut entry = build_runtime_entry(200, existing_logs);

        push_logs(
            &mut entry,
            ProjectLogLevel::Stdout,
            vec!["log-201".to_string()],
        );

        assert_eq!(entry.log_sequence, 201);
        assert_eq!(entry.runtime.recent_logs.len(), 200);
        assert_eq!(entry.runtime.recent_logs.first().map(|log| log.id.as_str()), Some("test-project-2"));
        assert_eq!(entry.runtime.recent_logs.last().map(|log| log.id.as_str()), Some("test-project-201"));
    }

    #[test]
    fn push_startup_timing_summary_reports_successful_startup_breakdown() {
        let mut entry = build_runtime_entry(0, Vec::new());
        entry.start_timestamp_ms = 1000;
        entry.startup_timeline = RuntimeStartupTimeline {
            environment_ready_at_ms: Some(1060),
            dependency_install_started_at_ms: None,
            dependency_install_finished_at_ms: None,
            process_spawned_at_ms: Some(1120),
            ready_at_ms: Some(5320),
            dependency_install_required: false,
            summary_logged: false,
        };

        push_startup_timing_summary(&mut entry, 5320, StartupTimingSummaryKind::Ready);

        let message = entry
            .runtime
            .recent_logs
            .last()
            .expect("summary log should exist")
            .message
            .clone();

        assert!(message.contains("启动耗时拆解"));
        assert!(message.contains("环境校验 60ms"));
        assert!(message.contains("依赖安装 0ms（已跳过）"));
        assert!(message.contains("进程拉起 60ms"));
        assert!(message.contains("等待服务就绪 4200ms"));
        assert!(message.contains("总计 4320ms"));
    }

    #[test]
    fn push_startup_timing_summary_reports_interrupted_startup_breakdown() {
        let mut entry = build_runtime_entry(0, Vec::new());
        entry.start_timestamp_ms = 2000;
        entry.startup_timeline = RuntimeStartupTimeline {
            environment_ready_at_ms: Some(2050),
            dependency_install_started_at_ms: Some(2050),
            dependency_install_finished_at_ms: None,
            process_spawned_at_ms: None,
            ready_at_ms: None,
            dependency_install_required: true,
            summary_logged: false,
        };

        push_startup_timing_summary(&mut entry, 3250, StartupTimingSummaryKind::Interrupted);

        let message = entry
            .runtime
            .recent_logs
            .last()
            .expect("summary log should exist")
            .message
            .clone();

        assert!(message.contains("启动未完成，耗时拆解"));
        assert!(message.contains("环境校验 50ms"));
        assert!(message.contains("依赖安装 1200ms（未完成）"));
        assert!(message.contains("进程拉起 0ms（未开始）"));
        assert!(message.contains("等待服务就绪 0ms（未开始）"));
        assert!(message.contains("总计 1250ms"));
    }

    fn build_runtime_entry(log_sequence: u64, recent_logs: Vec<ProjectLogEntry>) -> RuntimeEntry {
        RuntimeEntry {
            pid: 1234,
            expected_stop: false,
            preview_priority: 0,
            log_sequence,
            start_timestamp_ms: 0,
            selected_node_version: "24.14.1".to_string(),
            startup_timeline: RuntimeStartupTimeline::default(),
            runtime: ProjectRuntime {
                project_id: "test-project".to_string(),
                status: ProjectStatus::Running,
                pid: Some(1234),
                started_at: Some("2026-04-10T00:00:00Z".to_string()),
                exit_code: None,
                last_message: None,
                failure_message: None,
                failure_code: None,
                suggested_node_version: None,
                detected_url: None,
                detected_addresses: Vec::new(),
                startup_duration_ms: None,
                last_success_at: None,
                recent_logs,
            },
        }
    }

    fn build_log_entry(id: &str, level: ProjectLogLevel, message: &str) -> ProjectLogEntry {
        ProjectLogEntry {
            id: id.to_string(),
            at: "2026-04-10T00:00:00Z".to_string(),
            level,
            message: message.to_string(),
        }
    }
}
