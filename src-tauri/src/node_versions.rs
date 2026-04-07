use std::{
    env,
    fs,
    path::{Path, PathBuf},
};

use crate::contracts::normalize_node_version;

pub fn resolve_nvm_home() -> Option<PathBuf> {
    let explicit = env::var("NVM_HOME").ok().map(PathBuf::from);
    let default = env::var("USERPROFILE")
        .ok()
        .map(|home| Path::new(&home).join("AppData").join("Local").join("nvm"));

    explicit
        .or(default)
        .filter(|path| path.exists() && path.is_dir())
}

pub fn list_installed_node_versions() -> Vec<String> {
    let Some(nvm_home) = resolve_nvm_home() else {
        return Vec::new();
    };

    let mut versions = fs::read_dir(nvm_home)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.flatten())
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            if !file_type.is_dir() {
                return None;
            }

            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with('v') {
                return None;
            }

            let version = normalize_node_version(&name);
            if version.split('.').count() == 3 {
                Some(version)
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    versions.sort_by(compare_node_versions);
    versions
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
