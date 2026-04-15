use std::{
    fs,
    path::{Path, PathBuf},
};

use semver::{Version, VersionReq};
use serde::Deserialize;

use crate::contracts::{
    build_run_command as build_package_run_command, normalize_node_version,
    ProjectCommandSuggestion, ProjectDirectoryInspection, ProjectNodeVersionSource,
    ProjectPackageManager, ProjectReadiness,
};
use crate::package_managers::{detect_project_package_manager, list_available_package_managers};

const SCRIPT_PRIORITY: [&str; 2] = ["dev", "start"];
const STABLE_NODE_MAJORS: [u64; 8] = [24, 22, 20, 18, 16, 14, 12, 10];

#[derive(Debug, Deserialize)]
struct PackageJsonShape {
    scripts: Option<std::collections::HashMap<String, String>>,
    engines: Option<PackageJsonEngines>,
    volta: Option<PackageJsonVolta>,
}

#[derive(Debug, Deserialize)]
struct PackageJsonEngines {
    node: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PackageJsonVolta {
    node: Option<String>,
}

struct NodeRecommendation {
    version: Option<String>,
    hint: Option<String>,
    source: Option<ProjectNodeVersionSource>,
}

pub fn inspect_project_directory(
    project_path: &str,
    installed_node_versions: &[String],
) -> ProjectDirectoryInspection {
    let resolved_path = PathBuf::from(project_path);

    if !resolved_path.exists() {
        return empty_inspection(false, false, false);
    }

    if !resolved_path.is_dir() {
        return empty_inspection(true, false, false);
    }

    let package_json_path = resolved_path.join("package.json");
    let package_json = read_json_file::<PackageJsonShape>(&package_json_path);
    let has_package_json = package_json.is_some();
    let has_node_modules = resolved_path.join("node_modules").exists();
    let package_manager = detect_project_package_manager(&resolved_path);
    let available_package_managers = list_available_package_managers();
    let node_recommendation = resolve_node_recommendation(
        &resolved_path,
        package_json.as_ref(),
        installed_node_versions,
    );
    let available_start_commands = build_command_suggestions(
        package_json
            .as_ref()
            .and_then(|value| value.scripts.as_ref()),
        package_manager,
    );
    let recommended_start_command = available_start_commands
        .iter()
        .find(|suggestion| suggestion.recommended)
        .map(|suggestion| suggestion.command.clone());

    let readiness = build_readiness(
        true,
        true,
        has_package_json,
        has_node_modules,
        node_recommendation.version.as_deref(),
        Some(package_manager),
        recommended_start_command.as_deref(),
        installed_node_versions,
        &available_package_managers,
    );

    ProjectDirectoryInspection {
        exists: true,
        is_directory: true,
        has_package_json,
        has_node_modules,
        suggested_name: Some(resolve_suggested_name(&resolved_path)),
        recommended_node_version: node_recommendation.version,
        node_version_hint: node_recommendation.hint,
        node_version_source: node_recommendation.source,
        package_manager: Some(package_manager),
        recommended_start_command,
        available_start_commands,
        readiness,
    }
}

fn build_readiness(
    exists: bool,
    is_directory: bool,
    has_package_json: bool,
    has_node_modules: bool,
    recommended_node_version: Option<&str>,
    package_manager: Option<ProjectPackageManager>,
    recommended_start_command: Option<&str>,
    installed_node_versions: &[String],
    available_package_managers: &[ProjectPackageManager],
) -> ProjectReadiness {
    let node_installed = recommended_node_version
        .map(|value| {
            let normalized = normalize_node_version(value);
            installed_node_versions
                .iter()
                .any(|version| normalize_node_version(version) == normalized)
        })
        .unwrap_or(true);
    let package_manager_available = package_manager
        .map(|value| available_package_managers.contains(&value))
        .unwrap_or(false);

    let mut warnings = Vec::new();

    if !exists {
        warnings.push("项目路径不存在。".to_string());
    } else if !is_directory {
        warnings.push("当前路径不是目录。".to_string());
    }

    if exists && is_directory && !has_package_json {
        warnings.push("当前目录没有 package.json。".to_string());
    }

    if let Some(version) = recommended_node_version {
        if !node_installed {
            warnings.push(format!(
                "当前机器还没有安装推荐的 Node v{}。",
                normalize_node_version(version)
            ));
        }
    }

    if let Some(value) = package_manager {
        if !package_manager_available {
            warnings.push(format!(
                "当前机器还没有安装 {}。",
                package_manager_label(value)
            ));
        }
    }

    if exists && is_directory && has_package_json && recommended_start_command.is_none() {
        warnings.push("没有检测到可直接使用的启动脚本。".to_string());
    }

    if exists && is_directory && has_package_json && !has_node_modules {
        warnings.push("当前还没有安装项目依赖。".to_string());
    }

    ProjectReadiness {
        node_installed,
        package_manager_available,
        has_node_modules,
        can_start: exists
            && is_directory
            && has_package_json
            && node_installed
            && package_manager_available
            && recommended_start_command.is_some(),
        warnings,
    }
}

fn empty_inspection(
    exists: bool,
    is_directory: bool,
    has_package_json: bool,
) -> ProjectDirectoryInspection {
    ProjectDirectoryInspection {
        exists,
        is_directory,
        has_package_json,
        has_node_modules: false,
        suggested_name: None,
        recommended_node_version: None,
        node_version_hint: None,
        node_version_source: None,
        package_manager: None,
        recommended_start_command: None,
        available_start_commands: Vec::new(),
        readiness: build_readiness(
            exists,
            is_directory,
            has_package_json,
            false,
            None,
            None,
            None,
            &[],
            &[],
        ),
    }
}

fn read_json_file<T>(path: &Path) -> Option<T>
where
    T: for<'de> Deserialize<'de>,
{
    let contents = fs::read_to_string(path).ok()?;
    serde_json::from_str(&contents).ok()
}

fn read_node_version_file(path: &Path) -> Option<String> {
    let contents = fs::read_to_string(path).ok()?;
    contents
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

fn resolve_suggested_name(path: &Path) -> String {
    path.file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "project".to_string())
}

fn resolve_node_recommendation(
    path: &Path,
    package_json: Option<&PackageJsonShape>,
    installed_versions: &[String],
) -> NodeRecommendation {
    let candidates = [
        (
            ProjectNodeVersionSource::NodeVersion,
            read_node_version_file(&path.join(".node-version")),
        ),
        (
            ProjectNodeVersionSource::Nvmrc,
            read_node_version_file(&path.join(".nvmrc")),
        ),
        (
            ProjectNodeVersionSource::PackageEngines,
            package_json
                .and_then(|value| value.engines.as_ref())
                .and_then(|value| value.node.clone()),
        ),
        (
            ProjectNodeVersionSource::Volta,
            package_json
                .and_then(|value| value.volta.as_ref())
                .and_then(|value| value.node.clone()),
        ),
    ];

    for (source, raw_hint) in candidates {
        let Some(hint) = normalize_node_hint(raw_hint.as_deref()) else {
            continue;
        };

        if let Some(installed_match) = resolve_installed_node_version(&hint, installed_versions) {
            return NodeRecommendation {
                version: Some(installed_match),
                hint: Some(hint),
                source: Some(source),
            };
        }

        if let Some(installed_same_major) =
            resolve_installed_same_major_version(&hint, installed_versions)
        {
            return NodeRecommendation {
                version: Some(installed_same_major),
                hint: Some(hint),
                source: Some(source),
            };
        }

        if let Some(stable_major) = resolve_recommended_stable_major(&hint) {
            return NodeRecommendation {
                version: Some(stable_major),
                hint: Some(hint),
                source: Some(source),
            };
        }

        if let Some(exact_version) = resolve_exact_node_version(&hint) {
            return NodeRecommendation {
                version: Some(exact_version),
                hint: Some(hint),
                source: Some(source),
            };
        }

        return NodeRecommendation {
            version: None,
            hint: Some(hint),
            source: Some(source),
        };
    }

    NodeRecommendation {
        version: None,
        hint: None,
        source: None,
    }
}

fn normalize_node_hint(raw_value: Option<&str>) -> Option<String> {
    let trimmed = raw_value?.trim();
    if trimmed.is_empty() {
        return None;
    }

    Some(trimmed.trim_start_matches("node ").to_string())
}

fn resolve_installed_node_version(hint: &str, installed_versions: &[String]) -> Option<String> {
    let normalized_hint = normalize_node_version(hint);

    if let Ok(version) = Version::parse(&normalized_hint) {
        return installed_versions
            .iter()
            .find(|candidate| Version::parse(candidate).ok() == Some(version.clone()))
            .cloned();
    }

    if normalized_hint
        .chars()
        .all(|character| character.is_ascii_digit() || character == '.')
    {
        let prefix = normalized_hint.trim_end_matches('.');
        if let Some(match_version) = installed_versions
            .iter()
            .find(|candidate| candidate == &&prefix || candidate.starts_with(&format!("{prefix}.")))
        {
            return Some(match_version.clone());
        }
    }

    if let Ok(version_req) = VersionReq::parse(&normalized_hint) {
        return installed_versions
            .iter()
            .filter_map(|candidate| {
                Version::parse(candidate)
                    .ok()
                    .map(|version| (candidate, version))
            })
            .find(|(_, version)| version_req.matches(version))
            .map(|(candidate, _)| candidate.clone());
    }

    None
}

fn resolve_exact_node_version(hint: &str) -> Option<String> {
    let normalized_hint = normalize_node_version(hint);
    Version::parse(&normalized_hint)
        .ok()
        .map(|version| version.to_string())
}

fn resolve_installed_same_major_version(
    hint: &str,
    installed_versions: &[String],
) -> Option<String> {
    let major = extract_major_from_hint(hint)?;

    installed_versions.iter().find_map(|candidate| {
        let version = Version::parse(candidate).ok()?;
        (version.major == major).then(|| candidate.clone())
    })
}

fn resolve_recommended_stable_major(hint: &str) -> Option<String> {
    let normalized_hint = normalize_node_version(hint);

    if let Ok(version_req) = VersionReq::parse(&normalized_hint) {
        if let Some(major) = STABLE_NODE_MAJORS
            .iter()
            .copied()
            .find(|major| version_req.matches(&Version::new(*major, 0, 0)))
        {
            return Some(major.to_string());
        }

        if let Some(major) = (1_u64..=30_u64)
            .rev()
            .find(|major| version_req.matches(&Version::new(*major, 0, 0)))
        {
            return Some(major.to_string());
        }
    }

    extract_major_from_hint(hint).map(|major| major.to_string())
}

fn extract_major_from_hint(hint: &str) -> Option<u64> {
    let normalized_hint = normalize_node_version(hint);

    if let Ok(version) = Version::parse(&normalized_hint) {
        return Some(version.major);
    }

    if normalized_hint
        .chars()
        .all(|character| character.is_ascii_digit() || character == '.')
    {
        return normalized_hint
            .split('.')
            .find(|part| !part.trim().is_empty())
            .and_then(|part| part.parse::<u64>().ok());
    }

    if let Ok(version_req) = VersionReq::parse(&normalized_hint) {
        if let Some(major) = STABLE_NODE_MAJORS
            .iter()
            .copied()
            .find(|major| version_req.matches(&Version::new(*major, 0, 0)))
        {
            return Some(major);
        }
    }

    None
}

fn build_command_suggestions(
    scripts: Option<&std::collections::HashMap<String, String>>,
    package_manager: ProjectPackageManager,
) -> Vec<ProjectCommandSuggestion> {
    let Some(scripts) = scripts else {
        return Vec::new();
    };

    SCRIPT_PRIORITY
        .iter()
        .enumerate()
        .filter_map(|(index, script_name)| {
            scripts.get(*script_name)?;

            Some(ProjectCommandSuggestion {
                script_name: (*script_name).to_string(),
                command: build_package_run_command(package_manager, script_name),
                recommended: index == 0,
            })
        })
        .collect()
}

fn package_manager_label(value: ProjectPackageManager) -> &'static str {
    match value {
        ProjectPackageManager::Npm => "npm",
        ProjectPackageManager::Pnpm => "pnpm",
        ProjectPackageManager::Cnpm => "cnpm",
        ProjectPackageManager::Yarn => "yarn",
    }
}
