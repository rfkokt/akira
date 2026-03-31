use crate::db::queries;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkspaceData {
    pub id: String,
    pub name: String,
    pub folder_path: String,
    pub is_active: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[tauri::command]
pub fn create_workspace(
    state: State<AppState>,
    id: String,
    name: String,
    folder_path: String,
) -> Result<WorkspaceData, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    queries::create_workspace(&conn, &id, &name, &folder_path)
        .map(|w| WorkspaceData {
            id: w.id,
            name: w.name,
            folder_path: w.folder_path,
            is_active: w.is_active,
            created_at: w.created_at,
            updated_at: w.updated_at,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_workspaces(state: State<AppState>) -> Result<Vec<WorkspaceData>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    queries::get_all_workspaces(&conn)
        .map(|workspaces| {
            workspaces
                .into_iter()
                .map(|w| WorkspaceData {
                    id: w.id,
                    name: w.name,
                    folder_path: w.folder_path,
                    is_active: w.is_active,
                    created_at: w.created_at,
                    updated_at: w.updated_at,
                })
                .collect()
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_active_workspace(state: State<AppState>) -> Result<Option<WorkspaceData>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    queries::get_active_workspace(&conn)
        .map(|opt| {
            opt.map(|w| WorkspaceData {
                id: w.id,
                name: w.name,
                folder_path: w.folder_path,
                is_active: w.is_active,
                created_at: w.created_at,
                updated_at: w.updated_at,
            })
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_active_workspace(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::set_active_workspace(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_workspace(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::delete_workspace(&conn, &id).map_err(|e| e.to_string())
}
