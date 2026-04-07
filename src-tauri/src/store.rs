use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::contracts::{normalize_node_version, AppStartupSettings, ProjectConfig};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoreData {
    #[serde(default)]
    projects: Vec<ProjectConfig>,
    #[serde(default)]
    app_startup_settings: AppStartupSettings,
}

impl Default for StoreData {
    fn default() -> Self {
        Self {
            projects: Vec::new(),
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
    node_version: Option<String>,
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
    app_startup_settings: AppStartupSettings,
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

        let mut store = Self { path: store_path, data };
        store.normalize();
        store.persist()?;
        Ok(store)
    }

    pub fn list_projects(&self) -> Vec<ProjectConfig> {
        self.data.projects.clone()
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

        if let Some(index) = self
            .data
            .projects
            .iter()
            .position(|current| current.id == next_project.id)
        {
            self.data.projects[index] = next_project;
        } else {
            self.data.projects.push(next_project);
        }

        self.persist()
    }

    pub fn delete_project(&mut self, project_id: &str) -> Result<(), String> {
        self.data.projects.retain(|project| project.id != project_id);
        self.persist()
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
        self.data.projects = self
            .data
            .projects
            .clone()
            .into_iter()
            .filter_map(|project| normalize_project(project).ok())
            .collect();
    }

    fn persist(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("创建数据目录失败: {error}"))?;
        }

        let contents = serde_json::to_string_pretty(&self.data)
            .map_err(|error| format!("序列化配置失败: {error}"))?;

        fs::write(&self.path, contents).map_err(|error| format!("写入配置失败: {error}"))
    }
}

fn resolve_store_path() -> Result<PathBuf, String> {
    let data_dir = dirs::data_dir().ok_or_else(|| "无法定位系统数据目录".to_string())?;
    Ok(data_dir
        .join("switch-project-panel")
        .join("state.json"))
}

fn resolve_legacy_store_path() -> Option<PathBuf> {
    dirs::config_dir().map(|config_dir| {
        config_dir
            .join("switch-project-panel")
            .join("config.json")
    })
}

fn read_store_data(path: &Path) -> Result<StoreData, String> {
    let contents = fs::read_to_string(path).map_err(|error| format!("读取配置失败: {error}"))?;
    serde_json::from_str::<StoreData>(&contents).map_err(|error| format!("解析配置失败: {error}"))
}

fn migrate_legacy_store(path: &Path) -> StoreData {
    let contents = fs::read_to_string(path).unwrap_or_default();
    let legacy = serde_json::from_str::<LegacyStoreData>(&contents).unwrap_or(LegacyStoreData {
        projects: Vec::new(),
        app_startup_settings: AppStartupSettings::default(),
    });

    StoreData {
        projects: legacy
            .projects
            .into_iter()
            .filter_map(|project| {
                normalize_project(ProjectConfig {
                    id: project.id.unwrap_or_default(),
                    name: project.name.unwrap_or_default(),
                    path: project.path.unwrap_or_default(),
                    node_version: project.node_version.unwrap_or_default(),
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
        return Err("项目配置不完整".to_string());
    }

    let absolute_path = make_absolute_path(&project.path)?;

    Ok(ProjectConfig {
        id: project.id.trim().to_string(),
        name: project.name.trim().to_string(),
        path: absolute_path,
        node_version: normalize_node_version(&project.node_version),
        start_command: project.start_command.trim().to_string(),
        auto_start_on_app_launch: project.auto_start_on_app_launch,
        auto_open_local_url_on_start: project.auto_open_local_url_on_start,
    })
}

fn make_absolute_path(raw_path: &str) -> Result<String, String> {
    let path = PathBuf::from(raw_path.trim());
    if path.is_absolute() {
        return Ok(path.to_string_lossy().to_string());
    }

    let current_dir = std::env::current_dir().map_err(|error| format!("读取当前目录失败: {error}"))?;
    Ok(current_dir.join(path).to_string_lossy().to_string())
}
