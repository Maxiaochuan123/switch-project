use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::contracts::{
    default_project_package_manager, normalize_node_version, AppStartupSettings,
    ImportProjectsResult, ProjectConfig, ProjectGroup, ProjectGroupsExport, ProjectPackageManager,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoreData {
    #[serde(default)]
    projects: Vec<ProjectConfig>,
    #[serde(default)]
    project_groups: Vec<ProjectGroup>,
    #[serde(default)]
    app_startup_settings: AppStartupSettings,
}

impl Default for StoreData {
    fn default() -> Self {
        Self {
            projects: Vec::new(),
            project_groups: Vec::new(),
            app_startup_settings: AppStartupSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyProjectConfig {
    id: Option<String>,
    name: Option<String>,
    path: Option<String>,
    group_id: Option<String>,
    node_version: Option<String>,
    package_manager: Option<ProjectPackageManager>,
    start_command: Option<String>,
    auto_start_on_app_launch: Option<bool>,
    auto_open_local_url_on_start: Option<bool>,
    #[serde(alias = "startOnAppLogin")]
    start_on_app_login: Option<bool>,
    #[serde(alias = "openLocalUrlOnAppLogin")]
    open_local_url_on_app_login: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyStoreData {
    #[serde(default)]
    projects: Vec<LegacyProjectConfig>,
    #[serde(default)]
    project_groups: Vec<ProjectGroup>,
    #[serde(default)]
    app_startup_settings: AppStartupSettings,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
enum ImportedProjectsFile {
    Projects(Vec<ProjectConfig>),
    Export(ProjectGroupsExport),
    Wrapped { projects: Vec<ProjectConfig> },
}

pub struct AppStore {
    path: PathBuf,
    data: StoreData,
}

impl AppStore {
    pub fn load() -> Result<Self, String> {
        let store_path = resolve_store_path()?;
        let data = if store_path.exists() {
            read_store_data(&store_path)?
        } else if let Some(legacy_path) = resolve_legacy_store_path() {
            if legacy_path.exists() {
                migrate_legacy_store(&legacy_path)
            } else {
                StoreData::default()
            }
        } else {
            StoreData::default()
        };

        let mut store = Self {
            path: store_path,
            data,
        };
        store.normalize();
        store.persist()?;
        Ok(store)
    }

    pub fn list_projects(&self) -> Vec<ProjectConfig> {
        self.data.projects.clone()
    }

    pub fn list_project_groups(&self) -> Vec<ProjectGroup> {
        let mut groups = self.data.project_groups.clone();
        normalize_project_group_orders(&mut groups);
        groups
    }

    pub fn get_project(&self, project_id: &str) -> Option<ProjectConfig> {
        self.data
            .projects
            .iter()
            .find(|project| project.id == project_id)
            .cloned()
    }

    pub fn save_project(&mut self, project: ProjectConfig) -> Result<(), String> {
        let next_project = normalize_project(project)?;
        validate_project_group_reference(
            &self.data.project_groups,
            next_project.group_id.as_deref(),
        )?;

        if let Some(index) = self
            .data
            .projects
            .iter()
            .position(|current| current.id == next_project.id)
        {
            self.data.projects[index] = next_project;
        } else if let Some(index) = self
            .data
            .projects
            .iter()
            .position(|current| current.path.eq_ignore_ascii_case(&next_project.path))
        {
            self.data.projects[index] = ProjectConfig {
                id: self.data.projects[index].id.clone(),
                ..next_project
            };
        } else {
            self.data.projects.push(next_project);
        }

        self.persist()
    }

    pub fn delete_project(&mut self, project_id: &str) -> Result<(), String> {
        self.data
            .projects
            .retain(|project| project.id != project_id);
        self.persist()
    }

    pub fn create_project_group(&mut self, name: &str) -> Result<ProjectGroup, String> {
        let normalized_name = normalize_project_group_name(name)?;
        ensure_project_group_name_available(&self.data.project_groups, &normalized_name, None)?;

        let group = ProjectGroup {
            id: uuid::Uuid::new_v4().to_string(),
            name: normalized_name,
            order: self.data.project_groups.len() as u32,
        };

        self.data.project_groups.push(group.clone());
        normalize_project_group_orders(&mut self.data.project_groups);
        self.persist()?;

        Ok(group)
    }

    pub fn update_project_group(&mut self, group: ProjectGroup) -> Result<ProjectGroup, String> {
        let normalized_name = normalize_project_group_name(&group.name)?;
        ensure_project_group_name_available(
            &self.data.project_groups,
            &normalized_name,
            Some(group.id.as_str()),
        )?;

        let Some(existing_group_index) = self
            .data
            .project_groups
            .iter()
            .position(|current| current.id == group.id)
        else {
            return Err("分组不存在。".to_string());
        };

        self.data.project_groups[existing_group_index].name = normalized_name;
        self.persist()?;

        Ok(self.data.project_groups[existing_group_index].clone())
    }

    pub fn delete_project_group(&mut self, group_id: &str) -> Result<(), String> {
        let initial_length = self.data.project_groups.len();
        self.data
            .project_groups
            .retain(|group| group.id != group_id);

        if self.data.project_groups.len() == initial_length {
            return Err("分组不存在。".to_string());
        }

        for project in &mut self.data.projects {
            if project.group_id.as_deref() == Some(group_id) {
                project.group_id = None;
            }
        }

        normalize_project_group_orders(&mut self.data.project_groups);
        self.persist()
    }

    pub fn reorder_project_groups(
        &mut self,
        group_ids: &[String],
    ) -> Result<Vec<ProjectGroup>, String> {
        if group_ids.len() != self.data.project_groups.len() {
            return Err("分组排序数据不完整。".to_string());
        }

        let mut next_groups = Vec::with_capacity(self.data.project_groups.len());

        for (index, group_id) in group_ids.iter().enumerate() {
            let Some(group) = self
                .data
                .project_groups
                .iter()
                .find(|current| current.id == *group_id)
                .cloned()
            else {
                return Err("存在未知分组，无法排序。".to_string());
            };

            next_groups.push(ProjectGroup {
                order: index as u32,
                ..group
            });
        }

        self.data.project_groups = next_groups;
        normalize_project_group_orders(&mut self.data.project_groups);
        self.persist()?;

        Ok(self.list_project_groups())
    }

    pub fn import_projects(&mut self, path: &str) -> Result<ImportProjectsResult, String> {
        let imported = read_import_projects(path)?;
        let mut result = ImportProjectsResult {
            added: 0,
            updated: 0,
            skipped: 0,
        };

        let imported_group_id_map = self.merge_imported_project_groups(imported.project_groups)?;

        for project in imported.projects {
            let Ok(mut normalized_project) = normalize_project(project) else {
                result.skipped += 1;
                continue;
            };

            normalized_project.group_id =
                remap_imported_group_id(normalized_project.group_id.take(), &imported_group_id_map);

            if validate_project_group_reference(
                &self.data.project_groups,
                normalized_project.group_id.as_deref(),
            )
            .is_err()
            {
                result.skipped += 1;
                continue;
            }

            if let Some(index) = self
                .data
                .projects
                .iter()
                .position(|current| current.id == normalized_project.id)
            {
                self.data.projects[index] = normalized_project;
                result.updated += 1;
                continue;
            }

            if let Some(index) = self
                .data
                .projects
                .iter()
                .position(|current| current.path.eq_ignore_ascii_case(&normalized_project.path))
            {
                let existing_id = self.data.projects[index].id.clone();
                self.data.projects[index] = ProjectConfig {
                    id: existing_id,
                    ..normalized_project
                };
                result.updated += 1;
                continue;
            }

            self.data.projects.push(normalized_project);
            result.added += 1;
        }

        self.persist()?;
        Ok(result)
    }

    pub fn export_projects(&self, path: &str) -> Result<(), String> {
        let export_path = PathBuf::from(path);
        if let Some(parent) = export_path.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("创建备份目录失败: {error}"))?;
        }

        let contents = serde_json::to_string_pretty(&ProjectGroupsExport {
            project_groups: self.list_project_groups(),
            projects: self.data.projects.clone(),
        })
        .map_err(|error| format!("序列化备份数据失败: {error}"))?;

        fs::write(&export_path, contents).map_err(|error| format!("创建备份文件失败: {error}"))
    }

    pub fn get_app_startup_settings(&self) -> AppStartupSettings {
        self.data.app_startup_settings.clone()
    }

    pub fn save_app_startup_settings(
        &mut self,
        settings: AppStartupSettings,
    ) -> Result<(), String> {
        self.data.app_startup_settings = settings;
        self.persist()
    }

    fn normalize(&mut self) {
        normalize_project_group_orders(&mut self.data.project_groups);
        self.data.projects = self
            .data
            .projects
            .clone()
            .into_iter()
            .filter_map(|project| normalize_project(project).ok())
            .map(|mut project| {
                if !group_exists(&self.data.project_groups, project.group_id.as_deref()) {
                    project.group_id = None;
                }
                project
            })
            .collect();
    }

    fn merge_imported_project_groups(
        &mut self,
        groups: Vec<ProjectGroup>,
    ) -> Result<HashMap<String, String>, String> {
        let mut changed = false;
        let mut group_id_map = HashMap::new();

        for group in groups {
            let normalized_name = normalize_project_group_name(&group.name)?;
            let imported_group_id = group.id;

            if let Some(existing_group_index) = self
                .data
                .project_groups
                .iter()
                .position(|current| current.id == imported_group_id)
            {
                let name_available = self.data.project_groups.iter().all(|current| {
                    current.id == imported_group_id
                        || !current.name.eq_ignore_ascii_case(&normalized_name)
                });
                let existing_group = &mut self.data.project_groups[existing_group_index];

                if existing_group.order != group.order {
                    existing_group.order = group.order;
                    changed = true;
                }

                if name_available && existing_group.name != normalized_name {
                    existing_group.name = normalized_name;
                    changed = true;
                }

                group_id_map.insert(imported_group_id.clone(), existing_group.id.clone());
                continue;
            }

            if let Some(existing_group) = self
                .data
                .project_groups
                .iter()
                .find(|current| current.name.eq_ignore_ascii_case(&normalized_name))
            {
                group_id_map.insert(imported_group_id, existing_group.id.clone());
                continue;
            }

            self.data.project_groups.push(ProjectGroup {
                id: imported_group_id.clone(),
                name: normalized_name,
                order: self.data.project_groups.len() as u32,
            });
            group_id_map.insert(imported_group_id.clone(), imported_group_id);
            changed = true;
        }

        if changed {
            normalize_project_group_orders(&mut self.data.project_groups);
        }

        Ok(group_id_map)
    }

    fn persist(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("创建数据目录失败: {error}"))?;
        }

        let contents = serde_json::to_string_pretty(&self.data)
            .map_err(|error| format!("序列化配置失败: {error}"))?;

        fs::write(&self.path, contents).map_err(|error| format!("写入配置失败: {error}"))
    }
}

fn resolve_store_path() -> Result<PathBuf, String> {
    let data_dir = dirs::data_dir().ok_or_else(|| "无法定位系统数据目录。".to_string())?;
    Ok(data_dir.join("switch-project-panel").join("state.json"))
}

fn resolve_legacy_store_path() -> Option<PathBuf> {
    dirs::config_dir().map(|config_dir| config_dir.join("switch-project-panel").join("config.json"))
}

fn read_store_data(path: &Path) -> Result<StoreData, String> {
    let contents = fs::read_to_string(path).map_err(|error| format!("读取配置失败: {error}"))?;
    serde_json::from_str::<StoreData>(&contents).map_err(|error| format!("解析配置失败: {error}"))
}

fn read_import_projects(path: &str) -> Result<ProjectGroupsExport, String> {
    let contents =
        fs::read_to_string(path).map_err(|error| format!("读取备份文件失败: {error}"))?;
    let parsed = serde_json::from_str::<ImportedProjectsFile>(&contents)
        .map_err(|error| format!("解析备份文件失败: {error}"))?;

    Ok(match parsed {
        ImportedProjectsFile::Projects(projects) => ProjectGroupsExport {
            project_groups: Vec::new(),
            projects,
        },
        ImportedProjectsFile::Export(export) => export,
        ImportedProjectsFile::Wrapped { projects } => ProjectGroupsExport {
            project_groups: Vec::new(),
            projects,
        },
    })
}

fn migrate_legacy_store(path: &Path) -> StoreData {
    let contents = fs::read_to_string(path).unwrap_or_default();
    let legacy = serde_json::from_str::<LegacyStoreData>(&contents).unwrap_or(LegacyStoreData {
        projects: Vec::new(),
        project_groups: Vec::new(),
        app_startup_settings: AppStartupSettings::default(),
    });

    StoreData {
        project_groups: legacy.project_groups,
        projects: legacy
            .projects
            .into_iter()
            .filter_map(|project| {
                normalize_project(ProjectConfig {
                    id: project.id.unwrap_or_default(),
                    name: project.name.unwrap_or_default(),
                    path: project.path.unwrap_or_default(),
                    group_id: project.group_id,
                    node_version: project.node_version.unwrap_or_default(),
                    package_manager: project
                        .package_manager
                        .unwrap_or_else(default_project_package_manager),
                    start_command: project.start_command.unwrap_or_default(),
                    auto_start_on_app_launch: project
                        .auto_start_on_app_launch
                        .unwrap_or(project.start_on_app_login.unwrap_or(false)),
                    auto_open_local_url_on_start: project
                        .auto_open_local_url_on_start
                        .unwrap_or(project.open_local_url_on_app_login.unwrap_or(false)),
                })
                .ok()
            })
            .collect(),
        app_startup_settings: legacy.app_startup_settings,
    }
}

fn normalize_project(project: ProjectConfig) -> Result<ProjectConfig, String> {
    if project.id.trim().is_empty()
        || project.name.trim().is_empty()
        || project.path.trim().is_empty()
        || project.node_version.trim().is_empty()
        || project.start_command.trim().is_empty()
    {
        return Err("项目配置不完整。".to_string());
    }

    let absolute_path = make_absolute_path(&project.path)?;

    let normalized_group_id = project
        .group_id
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    Ok(ProjectConfig {
        id: project.id.trim().to_string(),
        name: project.name.trim().to_string(),
        path: absolute_path,
        group_id: normalized_group_id,
        node_version: normalize_node_version(&project.node_version),
        package_manager: infer_project_package_manager(&project),
        start_command: project.start_command.trim().to_string(),
        auto_start_on_app_launch: project.auto_start_on_app_launch,
        auto_open_local_url_on_start: project.auto_open_local_url_on_start,
    })
}

fn infer_project_package_manager(project: &ProjectConfig) -> ProjectPackageManager {
    let command_name = project
        .start_command
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .trim()
        .trim_matches('"')
        .to_ascii_lowercase();

    match command_name.as_str() {
        "pnpm" => ProjectPackageManager::Pnpm,
        "cnpm" => ProjectPackageManager::Cnpm,
        "yarn" => ProjectPackageManager::Yarn,
        "npm" => ProjectPackageManager::Npm,
        _ => project.package_manager,
    }
}

fn make_absolute_path(raw_path: &str) -> Result<String, String> {
    let path = PathBuf::from(raw_path.trim());
    if path.is_absolute() {
        return Ok(path.to_string_lossy().to_string());
    }

    let current_dir =
        std::env::current_dir().map_err(|error| format!("读取当前目录失败: {error}"))?;
    Ok(current_dir.join(path).to_string_lossy().to_string())
}

fn normalize_project_group_name(name: &str) -> Result<String, String> {
    let normalized_name = name.trim();

    if normalized_name.is_empty() {
        return Err("分组名称不能为空。".to_string());
    }

    if normalized_name.eq_ignore_ascii_case("未分组") {
        return Err("“未分组”是系统保留名称，请换一个分组名。".to_string());
    }

    Ok(normalized_name.to_string())
}

fn ensure_project_group_name_available(
    groups: &[ProjectGroup],
    name: &str,
    current_group_id: Option<&str>,
) -> Result<(), String> {
    if groups.iter().any(|group| {
        group.name.eq_ignore_ascii_case(name)
            && current_group_id.is_none_or(|group_id| group.id != group_id)
    }) {
        return Err("分组名称已存在，请换一个名字。".to_string());
    }

    Ok(())
}

fn normalize_project_group_orders(groups: &mut [ProjectGroup]) {
    groups.sort_by(|left, right| {
        left.order
            .cmp(&right.order)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    for (index, group) in groups.iter_mut().enumerate() {
        group.order = index as u32;
    }
}

fn remap_imported_group_id(
    group_id: Option<String>,
    group_id_map: &HashMap<String, String>,
) -> Option<String> {
    group_id.map(|current_group_id| {
        group_id_map
            .get(&current_group_id)
            .cloned()
            .unwrap_or(current_group_id)
    })
}

fn group_exists(groups: &[ProjectGroup], group_id: Option<&str>) -> bool {
    let Some(group_id) = group_id else {
        return true;
    };

    groups.iter().any(|group| group.id == group_id)
}

fn validate_project_group_reference(
    groups: &[ProjectGroup],
    group_id: Option<&str>,
) -> Result<(), String> {
    if group_exists(groups, group_id) {
        Ok(())
    } else {
        Err("所选分组不存在，请重新选择。".to_string())
    }
}

#[cfg(test)]
mod tests {
    use std::{env, fs};

    use crate::contracts::{
        AppStartupSettings, ProjectConfig, ProjectGroupsExport, ProjectPackageManager,
    };

    use super::{group_exists, normalize_project_group_orders, AppStore, ProjectGroup, StoreData};

    fn build_project(id: &str, path: &str, group_id: Option<&str>) -> ProjectConfig {
        ProjectConfig {
            id: id.to_string(),
            name: format!("Project {id}"),
            path: path.to_string(),
            group_id: group_id.map(str::to_string),
            node_version: "20.0.0".to_string(),
            package_manager: ProjectPackageManager::Npm,
            start_command: "npm run dev".to_string(),
            auto_start_on_app_launch: false,
            auto_open_local_url_on_start: false,
        }
    }

    #[test]
    fn normalize_project_group_orders_compacts_order_values() {
        let mut groups = vec![
            ProjectGroup {
                id: "b".to_string(),
                name: "B".to_string(),
                order: 4,
            },
            ProjectGroup {
                id: "a".to_string(),
                name: "A".to_string(),
                order: 1,
            },
        ];

        normalize_project_group_orders(&mut groups);

        assert_eq!(groups[0].id, "a");
        assert_eq!(groups[0].order, 0);
        assert_eq!(groups[1].id, "b");
        assert_eq!(groups[1].order, 1);
    }

    #[test]
    fn group_exists_treats_missing_group_as_ungrouped() {
        let store = StoreData::default();
        assert!(group_exists(&store.project_groups, None));
    }

    #[test]
    fn import_projects_reuses_existing_group_ids_for_same_named_groups() {
        let temp_dir = env::temp_dir();
        let store_path = temp_dir.join(format!(
            "switch-project-store-{}.json",
            uuid::Uuid::new_v4()
        ));
        let import_path = temp_dir.join(format!(
            "switch-project-backup-{}.json",
            uuid::Uuid::new_v4()
        ));
        let project_path = temp_dir
            .join(format!("switch-project-app-{}", uuid::Uuid::new_v4()))
            .to_string_lossy()
            .to_string();

        let mut store = AppStore {
            path: store_path.clone(),
            data: StoreData {
                projects: Vec::new(),
                project_groups: vec![ProjectGroup {
                    id: "local-group".to_string(),
                    name: "Frontend".to_string(),
                    order: 0,
                }],
                app_startup_settings: AppStartupSettings::default(),
            },
        };

        let backup = ProjectGroupsExport {
            project_groups: vec![ProjectGroup {
                id: "backup-group".to_string(),
                name: "Frontend".to_string(),
                order: 0,
            }],
            projects: vec![build_project(
                "project-1",
                &project_path,
                Some("backup-group"),
            )],
        };

        fs::write(&import_path, serde_json::to_string_pretty(&backup).unwrap()).unwrap();

        let result = store
            .import_projects(import_path.to_str().unwrap())
            .unwrap();
        let restored_projects = store.list_projects();

        assert_eq!(result.added, 1);
        assert_eq!(result.updated, 0);
        assert_eq!(result.skipped, 0);
        assert_eq!(store.list_project_groups().len(), 1);
        assert_eq!(restored_projects.len(), 1);
        assert_eq!(
            restored_projects[0].group_id.as_deref(),
            Some("local-group")
        );

        let _ = fs::remove_file(import_path);
        let _ = fs::remove_file(store_path);
    }
}
