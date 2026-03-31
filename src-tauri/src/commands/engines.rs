use crate::db::{self, queries};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn create_engine(
    state: State<AppState>,
    engine: queries::CreateEngineRequest,
) -> Result<queries::Engine, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::create_engine(&conn, &engine).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
pub fn get_all_engines(state: State<AppState>) -> Result<Vec<queries::Engine>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_all_engines(&conn).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
pub fn update_engine_enabled(state: State<AppState>, id: i64, enabled: bool) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::update_engine_enabled(&conn, id, enabled).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
pub fn delete_engine(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::delete_engine(&conn, id).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
pub fn seed_default_engines(state: State<AppState>) -> Result<Vec<queries::Engine>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::seed_default_engines(&conn).map_err(|e| e.to_string())?;
    queries::get_all_engines(&conn).map_err(|e: rusqlite::Error| e.to_string())
}
