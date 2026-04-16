use std::time::{Duration, Instant};

use semver::{Version, VersionReq};
use tauri::State;

use crate::{
    contracts::{
        normalize_node_version, AppStartupSettings, BackendErrorCode, DesktopEnvironment,
        NodeManagerKind, ProjectConfig, ProjectDiagnosis, ProjectGroup, ProjectPanelSnapshot,
        ProjectReadiness, ProjectStartPreflight,
    },
    lock_error,
    node_manager::{
        is_node_manager_available, list_installed_node_versions, list_nvm_installed_node_versions,
    resolve_active_node_version, resolve_default_node_version, resolve_node_manager_version,
    },
    package_managers::list_available_package_managers,
    project_directory::inspect_project_directory as inspect_project_directory_impl,
    runtime::{
        ensure_package_manager_available, ensure_start_command_available, is_delete_tool_ready,
    },
    ManagedState,
};

#[derive(Clone)]
pub struct ProjectStartAssessment {
    pub inspection: crate::contracts::ProjectDirectoryInspection,
    pub preflight: ProjectStartPreflight,
}

const PROJECT_START_ASSESSMENT_TTL: Duration = Duration::from_secs(5);

#[derive(Clone)]
pub(crate) struct CachedProjectStartAssessment {
    project: ProjectConfig,
    assessment: ProjectStartAssessment,
    cached_at: Instant,
}

impl CachedProjectStartAssessment {
    fn new(project: ProjectConfig, assessment: ProjectStartAssessment) -> Self {
        Self {
            project,
            assessment,
            cached_at: Instant::now(),
        }
    }

    fn is_valid_for(&self, project: &ProjectConfig) -> bool {
        self.cached_at.elapsed() <= PROJECT_START_ASSESSMENT_TTL
            && project_configs_match(&self.project, project)
    }
}

fn project_configs_match(left: &ProjectConfig, right: &ProjectConfig) -> bool {
    left.id == right.id
        && left.name == right.name
        && left.path == right.path
        && left.node_version == right.node_version
        && left.package_manager == right.package_manager
        && left.start_command == right.start_command
        && left.auto_start_on_app_launch == right.auto_start_on_app_launch
        && left.auto_open_local_url_on_start == right.auto_open_local_url_on_start
}

pub fn cache_project_start_assessment(
    state: &State<ManagedState>,
    project: &ProjectConfig,
    assessment: &ProjectStartAssessment,
) -> Result<(), String> {
    state
        .project_start_assessments
        .lock()
        .map_err(lock_error)?
        .insert(
            project.id.clone(),
            CachedProjectStartAssessment::new(project.clone(), assessment.clone()),
        );

    Ok(())
}

pub fn get_cached_project_start_assessment(
    state: &State<ManagedState>,
    project: &ProjectConfig,
) -> Option<ProjectStartAssessment> {
    let mut cache = state.project_start_assessments.lock().ok()?;
    let cached = cache.get(&project.id)?;

    if !cached.is_valid_for(project) {
        cache.remove(&project.id);
        return None;
    }

    Some(cached.assessment.clone())
}

pub fn clear_project_start_assessment_cache(
    state: &State<ManagedState>,
    project_id: &str,
) -> Result<(), String> {
    state
        .project_start_assessments
        .lock()
        .map_err(lock_error)?
        .remove(project_id);

    Ok(())
}

pub fn get_project(state: &State<ManagedState>, project_id: &str) -> Result<ProjectConfig, String> {
    state
        .store
        .lock()
        .map_err(lock_error)?
        .get_project(project_id)
        .ok_or_else(|| "项目不存在。".to_string())
}

pub fn compare_node_versions_desc(left: &str, right: &str) -> std::cmp::Ordering {
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

pub fn major_from_node_requirement(value: &str) -> Option<String> {
    let normalized_value = normalize_node_version(value);

    if let Ok(version) = Version::parse(&normalized_value) {
        return Some(version.major.to_string());
    }

    if normalized_value
        .chars()
        .all(|character| character.is_ascii_digit() || character == '.')
    {
        return normalized_value
            .split('.')
            .find(|part| !part.trim().is_empty())
            .map(str::to_string);
    }

    if let Ok(version_req) = VersionReq::parse(&normalized_value) {
        for major in (1_u64..=30_u64).rev() {
            if version_req.matches(&Version::new(major, 0, 0)) {
                return Some(major.to_string());
            }
        }
    }

    None
}

pub fn does_node_version_satisfy_requirement(node_version: &str, requirement: &str) -> bool {
    let normalized_node_version = normalize_node_version(node_version);
    let normalized_requirement = normalize_node_version(requirement);

    if normalized_requirement.trim().is_empty() {
        return true;
    }

    if normalized_node_version == normalized_requirement {
        return true;
    }

    let Ok(parsed_version) = Version::parse(&normalized_node_version) else {
        return false;
    };

    match VersionReq::parse(&normalized_requirement) {
        Ok(version_req) => version_req.matches(&parsed_version),
        Err(_) => major_from_node_requirement(&normalized_requirement)
            .map(|major| {
                normalized_node_version
                    .split('.')
                    .next()
                    .unwrap_or_default()
                    == major
            })
            .unwrap_or(false),
    }
}

pub fn select_best_installed_node_version(
    requirement: &str,
    installed_node_versions: &[String],
) -> Option<String> {
    let normalized_requirement = normalize_node_version(requirement);
    let normalized_installed_versions = installed_node_versions
        .iter()
        .map(|version| normalize_node_version(version))
        .collect::<Vec<_>>();

    if normalized_requirement.trim().is_empty() {
        return None;
    }

    if let Some(exact_match) = normalized_installed_versions
        .iter()
        .find(|version| *version == &normalized_requirement)
    {
        return Some(exact_match.clone());
    }

    let compatible_versions = normalized_installed_versions
        .iter()
        .filter(|version| does_node_version_satisfy_requirement(version, &normalized_requirement))
        .cloned()
        .collect::<Vec<_>>();

    if compatible_versions.is_empty() {
        return None;
    }

    if let Some(requirement_major) = major_from_node_requirement(&normalized_requirement) {
        let mut same_major_versions = compatible_versions
            .iter()
            .filter(|version| version.split('.').next().unwrap_or_default() == requirement_major)
            .cloned()
            .collect::<Vec<_>>();

        same_major_versions.sort_by(|left, right| compare_node_versions_desc(left, right));

        if let Some(best_same_major_version) = same_major_versions.first() {
            return Some(best_same_major_version.clone());
        }
    }

    let mut remaining_versions = compatible_versions;
    remaining_versions.sort_by(|left, right| compare_node_versions_desc(left, right));
    remaining_versions.first().cloned()
}

pub fn build_start_preflight_result(
    can_start: bool,
    missing_dependencies: bool,
    selected_node_version: String,
    has_declared_node_requirement: bool,
    suggested_node_version: Option<String>,
    install_node_version: Option<String>,
    reason_code: Option<BackendErrorCode>,
    reason_message: Option<String>,
) -> ProjectStartPreflight {
    ProjectStartPreflight {
        can_start,
        missing_dependencies,
        selected_node_version,
        has_declared_node_requirement,
        suggested_node_version,
        install_node_version,
        reason_code,
        reason_message,
    }
}

pub fn assess_project_start(project: &ProjectConfig) -> ProjectStartAssessment {
    let installed_node_versions = list_installed_node_versions();
    let inspection = inspect_project_directory_impl(&project.path, &installed_node_versions);
    let selected_node_version = normalize_node_version(&project.node_version);
    let declared_node_requirement = inspection
        .node_version_hint
        .as_ref()
        .map(|value| normalize_node_version(value))
        .filter(|value| !value.trim().is_empty());
    let has_declared_node_requirement = declared_node_requirement.is_some();
    let missing_dependencies = inspection.exists
        && inspection.is_directory
        && inspection.has_package_json
        && !inspection.has_node_modules;

    let preflight = if !inspection.exists || !inspection.is_directory {
        build_start_preflight_result(
            false,
            missing_dependencies,
            selected_node_version,
            has_declared_node_requirement,
            None,
            None,
            Some(BackendErrorCode::ProjectPathMissing),
            Some("项目路径不存在或不是可用目录。".to_string()),
        )
    } else if !inspection.has_package_json {
        build_start_preflight_result(
            false,
            missing_dependencies,
            selected_node_version,
            has_declared_node_requirement,
            None,
            None,
            Some(BackendErrorCode::InvalidProject),
            Some("当前目录缺少 package.json，暂时无法启动。".to_string()),
        )
    } else if project.start_command.trim().is_empty() {
        build_start_preflight_result(
            false,
            missing_dependencies,
            selected_node_version,
            has_declared_node_requirement,
            None,
            None,
            Some(BackendErrorCode::StartCommandMissing),
            Some("请先配置启动命令后再启动项目。".to_string()),
        )
    } else if !is_node_manager_available() {
        build_start_preflight_result(
            false,
            missing_dependencies,
            selected_node_version,
            has_declared_node_requirement,
            None,
            None,
            Some(BackendErrorCode::NodeManagerMissing),
            Some("未检测到 fnm，请先完成 fnm 初始化。".to_string()),
        )
    } else if selected_node_version.trim().is_empty() {
        let install_node_version = declared_node_requirement.clone().or_else(|| {
            inspection
                .recommended_node_version
                .as_ref()
                .map(|value| normalize_node_version(value))
        });

        build_start_preflight_result(
            false,
            missing_dependencies,
            selected_node_version,
            has_declared_node_requirement,
            None,
            install_node_version,
            Some(BackendErrorCode::NodeVersionMissing),
            Some("请先选择可用的 Node 版本。".to_string()),
        )
    } else if let Some(requirement) = declared_node_requirement.as_ref() {
        if !does_node_version_satisfy_requirement(&selected_node_version, requirement) {
            let suggested_node_version =
                select_best_installed_node_version(requirement, &installed_node_versions)
                    .filter(|version| version != &selected_node_version);
            let install_node_version = if suggested_node_version.is_none() {
                inspection
                    .recommended_node_version
                    .as_ref()
                    .map(|value| normalize_node_version(value))
                    .or_else(|| Some(requirement.clone()))
            } else {
                None
            };

            build_start_preflight_result(
                false,
                missing_dependencies,
                selected_node_version,
                true,
                suggested_node_version,
                install_node_version,
                Some(BackendErrorCode::NodeVersionMismatch),
                Some("当前选择的 Node 版本不满足项目要求。".to_string()),
            )
        } else {
            build_start_preflight_after_node_check(
                project,
                &inspection,
                &installed_node_versions,
                selected_node_version,
                has_declared_node_requirement,
                missing_dependencies,
            )
        }
    } else {
        build_start_preflight_after_node_check(
            project,
            &inspection,
            &installed_node_versions,
            selected_node_version,
            has_declared_node_requirement,
            missing_dependencies,
        )
    };

    ProjectStartAssessment {
        inspection,
        preflight,
    }
}

pub fn build_project_diagnosis(project: ProjectConfig) -> ProjectDiagnosis {
    let assessment = assess_project_start(&project);
    let installed_node_versions = list_installed_node_versions();
    let selected_node_version = normalize_node_version(&project.node_version);
    let node_installed = !selected_node_version.trim().is_empty()
        && installed_node_versions
            .iter()
            .map(|version| normalize_node_version(version))
            .any(|version| version == selected_node_version);
    let package_manager_available = resolve_package_manager_availability(
        &project,
        &assessment.inspection,
        node_installed,
        &selected_node_version,
    );
    let warnings = build_diagnosis_warnings(&assessment.preflight);

    ProjectDiagnosis {
        project_id: project.id,
        project_name: project.name,
        readiness: ProjectReadiness {
            node_installed,
            package_manager_available,
            has_node_modules: assessment.inspection.has_node_modules,
            can_start: assessment.preflight.can_start,
            warnings,
        },
        path_exists: assessment.inspection.exists && assessment.inspection.is_directory,
        has_package_json: assessment.inspection.has_package_json,
        start_command_available: !project.start_command.trim().is_empty(),
        node_version: project.node_version,
        package_manager: project.package_manager,
        start_command: project.start_command,
    }
}

fn build_start_preflight_after_node_check(
    project: &ProjectConfig,
    inspection: &crate::contracts::ProjectDirectoryInspection,
    installed_node_versions: &[String],
    selected_node_version: String,
    has_declared_node_requirement: bool,
    missing_dependencies: bool,
) -> ProjectStartPreflight {
    if !installed_node_versions
        .iter()
        .map(|version| normalize_node_version(version))
        .any(|version| version == selected_node_version)
    {
        return build_start_preflight_result(
            false,
            missing_dependencies,
            selected_node_version.clone(),
            has_declared_node_requirement,
            None,
            inspection
                .node_version_hint
                .as_ref()
                .map(|value| normalize_node_version(value))
                .or_else(|| Some(selected_node_version)),
            Some(BackendErrorCode::NodeVersionMissing),
            Some("当前机器还没有安装所选的 Node 版本。".to_string()),
        );
    }

    if let Err(error) =
        ensure_package_manager_available(project.package_manager, &selected_node_version)
    {
        return build_start_preflight_result(
            false,
            missing_dependencies,
            selected_node_version,
            has_declared_node_requirement,
            None,
            None,
            Some(BackendErrorCode::PackageManagerMissing),
            Some(error),
        );
    }

    if let Err(error) =
        ensure_start_command_available(&project.start_command, &selected_node_version)
    {
        return build_start_preflight_result(
            false,
            missing_dependencies,
            selected_node_version,
            has_declared_node_requirement,
            None,
            None,
            Some(BackendErrorCode::StartCommandMissing),
            Some(error),
        );
    }

    build_start_preflight_result(
        true,
        missing_dependencies,
        selected_node_version,
        has_declared_node_requirement,
        None,
        None,
        None,
        None,
    )
}

fn resolve_package_manager_availability(
    project: &ProjectConfig,
    inspection: &crate::contracts::ProjectDirectoryInspection,
    node_installed: bool,
    selected_node_version: &str,
) -> bool {
    if inspection.exists
        && inspection.is_directory
        && inspection.has_package_json
        && node_installed
        && !selected_node_version.trim().is_empty()
    {
        return ensure_package_manager_available(project.package_manager, selected_node_version)
            .is_ok();
    }

    list_available_package_managers().contains(&project.package_manager)
}

fn build_diagnosis_warnings(preflight: &ProjectStartPreflight) -> Vec<String> {
    let mut warnings = Vec::new();

    if let Some(message) = preflight.reason_message.as_ref() {
        warnings.push(message.clone());
    }

    if preflight.missing_dependencies {
        warnings.push("当前还没有安装项目依赖，启动时会自动安装。".to_string());
    }

    warnings
}

pub fn build_desktop_environment() -> Result<DesktopEnvironment, String> {
    Ok(DesktopEnvironment {
        installed_node_versions: list_installed_node_versions(),
        nvm_installed_node_versions: list_nvm_installed_node_versions(),
        active_node_version: resolve_active_node_version(),
        default_node_version: resolve_default_node_version(),
        available_package_managers: list_available_package_managers(),
        rimraf_installed: is_delete_tool_ready()?,
        node_manager: NodeManagerKind::Fnm,
        node_manager_available: is_node_manager_available(),
        node_manager_version: resolve_node_manager_version(),
    })
}

pub fn build_project_panel_snapshot(
    projects: Vec<ProjectConfig>,
    project_groups: Vec<ProjectGroup>,
    startup_settings: AppStartupSettings,
    runtimes: Vec<crate::contracts::ProjectRuntime>,
) -> Result<ProjectPanelSnapshot, String> {
    Ok(ProjectPanelSnapshot {
        projects,
        project_groups,
        runtimes,
        environment: build_desktop_environment()?,
        startup_settings,
    })
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{Duration, Instant},
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::contracts::{
        BackendErrorCode, ProjectConfig, ProjectDirectoryInspection, ProjectPackageManager,
        ProjectReadiness, ProjectStartPreflight,
    };

    use super::{
        assess_project_start, build_project_diagnosis, CachedProjectStartAssessment,
        ProjectStartAssessment, PROJECT_START_ASSESSMENT_TTL,
    };

    #[test]
    fn diagnosis_allows_custom_saved_start_command() {
        let Some(node_version) = installed_node_version() else {
            return;
        };

        let temp_dir = create_temp_project_dir("custom-start-command");
        write_package_json(
            &temp_dir,
            r#"{ "name": "custom-start", "version": "1.0.0" }"#,
        );

        let project = build_project(&temp_dir, &node_version, r#"node -e "console.log('ok')""#);

        let assessment = assess_project_start(&project);
        let diagnosis = build_project_diagnosis(project);

        assert!(assessment.preflight.can_start);
        assert!(diagnosis.readiness.can_start);
    }

    #[test]
    fn diagnosis_keeps_missing_dependencies_as_warning_only() {
        let Some(node_version) = installed_node_version() else {
            return;
        };

        let temp_dir = create_temp_project_dir("missing-dependencies");
        write_package_json(
            &temp_dir,
            r#"{ "name": "missing-deps", "version": "1.0.0", "scripts": { "dev": "node -e \"console.log('ok')\"" } }"#,
        );

        let project = build_project(&temp_dir, &node_version, "npm run dev");

        let assessment = assess_project_start(&project);
        let diagnosis = build_project_diagnosis(project);

        assert!(assessment.preflight.can_start);
        assert!(assessment.preflight.missing_dependencies);
        assert!(diagnosis.readiness.can_start);
        assert!(!diagnosis.readiness.has_node_modules);
        assert!(diagnosis
            .readiness
            .warnings
            .iter()
            .any(|warning| warning.contains("自动安装")));
    }

    #[test]
    fn diagnosis_blocks_start_when_selected_node_is_not_installed() {
        if !crate::node_manager::is_node_manager_available() {
            return;
        }

        let temp_dir = create_temp_project_dir("missing-selected-node");
        write_package_json(
            &temp_dir,
            r#"{ "name": "missing-node", "version": "1.0.0", "scripts": { "dev": "node -e \"console.log('ok')\"" } }"#,
        );

        let project = build_project(&temp_dir, "999.0.0", "npm run dev");

        let assessment = assess_project_start(&project);
        let diagnosis = build_project_diagnosis(project);

        assert!(!assessment.preflight.can_start);
        assert!(matches!(
            assessment.preflight.reason_code,
            Some(BackendErrorCode::NodeVersionMissing)
        ));
        assert!(!diagnosis.readiness.node_installed);
        assert!(!diagnosis.readiness.can_start);
    }

    #[test]
    fn cached_project_start_assessment_rejects_changed_project_config() {
        let project = build_project(Path::new("C:\\workspace\\demo"), "24.14.1", "npm run dev");
        let cached = CachedProjectStartAssessment::new(project.clone(), build_assessment(true));
        let changed_project = ProjectConfig {
            start_command: "pnpm dev".to_string(),
            ..project
        };

        assert!(!cached.is_valid_for(&changed_project));
    }

    #[test]
    fn cached_project_start_assessment_expires_after_ttl() {
        let project = build_project(Path::new("C:\\workspace\\demo"), "24.14.1", "npm run dev");
        let mut cached = CachedProjectStartAssessment::new(project.clone(), build_assessment(true));
        cached.cached_at = Instant::now() - PROJECT_START_ASSESSMENT_TTL - Duration::from_millis(1);

        assert!(!cached.is_valid_for(&project));
    }

    #[test]
    fn cached_project_start_assessment_accepts_matching_fresh_project() {
        let project = build_project(Path::new("C:\\workspace\\demo"), "24.14.1", "npm run dev");
        let cached = CachedProjectStartAssessment::new(project.clone(), build_assessment(true));

        assert!(cached.is_valid_for(&project));
    }

    fn installed_node_version() -> Option<String> {
        crate::node_manager::list_installed_node_versions()
            .into_iter()
            .next()
    }

    fn build_project(path: &Path, node_version: &str, start_command: &str) -> ProjectConfig {
        ProjectConfig {
            id: "test-project".to_string(),
            name: "Test Project".to_string(),
            path: path.to_string_lossy().to_string(),
            group_id: None,
            node_version: node_version.to_string(),
            package_manager: ProjectPackageManager::Npm,
            start_command: start_command.to_string(),
            auto_start_on_app_launch: false,
            auto_open_local_url_on_start: false,
        }
    }

    fn build_assessment(can_start: bool) -> ProjectStartAssessment {
        ProjectStartAssessment {
            inspection: ProjectDirectoryInspection {
                exists: true,
                is_directory: true,
                has_package_json: true,
                has_node_modules: true,
                suggested_name: Some("Test Project".to_string()),
                recommended_node_version: Some("24.14.1".to_string()),
                node_version_hint: Some("24.14.1".to_string()),
                node_version_source: None,
                package_manager: Some(ProjectPackageManager::Npm),
                recommended_start_command: Some("npm run dev".to_string()),
                available_start_commands: Vec::new(),
                readiness: ProjectReadiness {
                    node_installed: true,
                    package_manager_available: true,
                    has_node_modules: true,
                    can_start,
                    warnings: Vec::new(),
                },
            },
            preflight: ProjectStartPreflight {
                can_start,
                missing_dependencies: false,
                selected_node_version: "24.14.1".to_string(),
                has_declared_node_requirement: true,
                suggested_node_version: None,
                install_node_version: None,
                reason_code: None,
                reason_message: None,
            },
        }
    }

    fn create_temp_project_dir(label: &str) -> PathBuf {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_millis();
        let path = std::env::temp_dir().join(format!("switch-project-panel-{label}-{millis}"));
        fs::create_dir_all(&path).expect("temp project dir should be created");
        path
    }

    fn write_package_json(dir: &Path, contents: &str) {
        fs::write(dir.join("package.json"), contents).expect("package.json should be written");
    }
}
