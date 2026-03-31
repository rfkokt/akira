use crate::db::queries::{self, CreateTaskRequest, Task};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn create_task(state: State<AppState>, task: CreateTaskRequest) -> Result<Task, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::create_task(&conn, &task).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
pub fn get_all_tasks(state: State<AppState>) -> Result<Vec<Task>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_all_tasks(&conn).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
pub fn get_tasks_by_status(state: State<AppState>, status: String) -> Result<Vec<Task>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_tasks_by_status(&conn, &status).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
pub fn get_tasks_by_workspace(
    state: State<AppState>,
    workspaceId: String,
) -> Result<Vec<Task>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_tasks_by_workspace(&conn, &workspaceId).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
pub fn update_task_status(
    state: State<AppState>,
    id: String,
    status: String,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::update_task_status(&conn, &id, &status).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
pub fn fix_backlog_tasks(state: State<AppState>) -> Result<i32, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let count = conn.execute(
        "UPDATE tasks SET status = 'todo', updated_at = CURRENT_TIMESTAMP WHERE status = 'backlog'",
        [],
    ).map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(count as i32)
}

#[tauri::command]
pub fn delete_task(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::delete_task(&conn, &id).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
pub fn update_task_pr_info(
    state: State<AppState>,
    id: String,
    pr_branch: String,
    pr_url: Option<String>,
    remote: Option<String>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::update_task_pr_info(&conn, &id, &pr_branch, pr_url.as_deref(), remote.as_deref())
        .map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
pub fn update_task_merge_info(
    state: State<AppState>,
    id: String,
    is_merged: bool,
    merge_source_branch: Option<String>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::update_task_merge_info(&conn, &id, is_merged, merge_source_branch.as_deref())
        .map_err(|e: rusqlite::Error| e.to_string())
}
