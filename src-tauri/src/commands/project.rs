use serde::{Serialize, Deserialize};
use tauri::State;
use crate::state::AppState;
use crate::db::queries;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfigData {
    pub id: Option<i64>,
    pub workspace_id: String,
    pub md_persona: String,
    pub md_tech_stack: String,
    pub md_rules: String,
    pub md_tone: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[tauri::command]
pub fn get_project_config(
    state: State<AppState>,
    workspaceId: String,
) -> Result<Option<ProjectConfigData>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    queries::get_project_config(&conn, &workspaceId)
        .map(|opt| opt.map(|c| ProjectConfigData {
            id: c.id,
            workspace_id: c.workspace_id,
            md_persona: c.md_persona,
            md_tech_stack: c.md_tech_stack,
            md_rules: c.md_rules,
            md_tone: c.md_tone,
            created_at: c.created_at,
            updated_at: c.updated_at,
        }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_project_config(
    state: State<AppState>,
    config: ProjectConfigData,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    let db_config = queries::ProjectConfig {
        id: config.id,
        workspace_id: config.workspace_id,
        md_persona: config.md_persona,
        md_tech_stack: config.md_tech_stack,
        md_rules: config.md_rules,
        md_tone: config.md_tone,
        created_at: config.created_at,
        updated_at: config.updated_at,
    };
    
    queries::save_project_config(&conn, &db_config)
        .map_err(|e| e.to_string())
}
