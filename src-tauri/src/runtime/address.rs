use std::{net::IpAddr, sync::OnceLock};

use chrono::Utc;
use regex::Regex;
use url::Url;

use crate::contracts::ProjectAddressKind;

pub(super) fn translate_runtime_message(message: &str) -> String {
    let trimmed = message.trim();
    if trimmed.contains("Module not found") {
        return "依赖或模块缺失，请先检查项目安装状态。".to_string();
    }
    if trimmed.contains("Failed to compile") {
        return "编译失败，请打开终端查看详情。".to_string();
    }
    trimmed.to_string()
}

pub(super) fn extract_addresses_from_message(message: &str) -> Vec<NormalizedAddress> {
    if message.trim().is_empty() || message.trim().eq_ignore_ascii_case("- Network: unavailable") {
        return Vec::new();
    }

    url_regex()
        .find_iter(message)
        .filter_map(|match_value| normalize_detected_address(match_value.as_str()))
        .collect()
}

pub(super) fn strip_ansi(value: &str) -> String {
    ansi_regex().replace_all(value, "").to_string()
}

pub(super) fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn normalize_detected_address(raw_url: &str) -> Option<NormalizedAddress> {
    let sanitized = raw_url.trim_end_matches([',', ')', ';', '.']);
    let mut parsed = Url::parse(sanitized).ok()?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return None;
    }

    let host = parsed.host_str()?.to_lowercase();
    let path = parsed.path().to_lowercase();
    if ignored_address_path_regex().is_match(&path) {
        return None;
    }

    let kind = if host == "localhost" {
        ProjectAddressKind::Local
    } else if let Ok(address) = host.parse::<IpAddr>() {
        match address {
            IpAddr::V4(value) if value.is_loopback() => ProjectAddressKind::Local,
            IpAddr::V4(value) if value.is_unspecified() => {
                parsed.set_host(Some("localhost")).ok()?;
                ProjectAddressKind::Local
            }
            IpAddr::V4(value) if value.is_private() => ProjectAddressKind::Network,
            IpAddr::V6(value) if value.is_loopback() => ProjectAddressKind::Local,
            _ => return None,
        }
    } else {
        return None;
    };

    parsed.set_path("/");
    parsed.set_query(None);
    parsed.set_fragment(None);

    Some(NormalizedAddress {
        url: parsed.to_string(),
        kind,
    })
}

fn ansi_regex() -> &'static Regex {
    static ANSI_REGEX: OnceLock<Regex> = OnceLock::new();
    ANSI_REGEX.get_or_init(|| Regex::new(r"\u{001B}\[[0-9;]*m").expect("valid ansi regex"))
}

fn url_regex() -> &'static Regex {
    static URL_REGEX: OnceLock<Regex> = OnceLock::new();
    URL_REGEX.get_or_init(|| Regex::new(r"https?://[^\s]+").expect("valid url regex"))
}

fn ignored_address_path_regex() -> &'static Regex {
    static IGNORED_REGEX: OnceLock<Regex> = OnceLock::new();
    IGNORED_REGEX.get_or_init(|| {
        Regex::new(r"/(?:_?unocss|sockjs-node|webpack-dev-server|__vite_ping|@vite|@id)(?:/|$)")
            .expect("valid ignored address path regex")
    })
}

pub(super) struct NormalizedAddress {
    pub(super) url: String,
    pub(super) kind: ProjectAddressKind,
}
