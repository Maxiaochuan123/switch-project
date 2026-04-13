use crate::contracts::{
    ProjectAddress, ProjectAddressKind, ProjectLogEntry, ProjectLogLevel,
};

use super::{
    address::{extract_addresses_from_message, now_iso, translate_runtime_message},
    RuntimeEntry,
};

const MAX_LOG_ENTRIES: usize = 200;
const MAX_LOG_MESSAGE_LENGTH: usize = 1800;

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

#[cfg(test)]
mod tests {
    use crate::contracts::{ProjectRuntime, ProjectStatus};

    use super::{push_logs, ProjectLogEntry, ProjectLogLevel, RuntimeEntry};

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

    fn build_runtime_entry(log_sequence: u64, recent_logs: Vec<ProjectLogEntry>) -> RuntimeEntry {
        RuntimeEntry {
            pid: 1234,
            expected_stop: false,
            preview_priority: 0,
            log_sequence,
            start_timestamp_ms: 0,
            selected_node_version: "24.14.1".to_string(),
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
