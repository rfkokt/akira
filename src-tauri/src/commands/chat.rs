use crate::db::queries;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn create_chat_message(
    state: State<AppState>,
    task_id: String,
    role: String,
    content: String,
    engine_alias: String,
) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Ensure task exists before inserting chat message
    let task_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE id = ?1",
            [&task_id],
            |row| row.get::<_, i32>(0),
        )
        .unwrap_or(0)
        > 0;

    if !task_exists {
        // Create placeholder task with minimal info
        conn.execute(
            "INSERT OR IGNORE INTO tasks (id, title, status) VALUES (?1, ?2, ?3)",
            rusqlite::params![
                &task_id,
                format!("Task {}", &task_id[..8.min(task_id.len())]),
                "todo"
            ],
        )
        .map_err(|e: rusqlite::Error| e.to_string())?;
    }

    queries::create_chat_message(&conn, &task_id, &role, &content, &engine_alias)
        .map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
pub fn get_chat_history(
    state: State<AppState>,
    task_id: String,
) -> Result<Vec<queries::ChatMessage>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_chat_history(&conn, &task_id).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
pub fn clear_chat_history(state: State<AppState>, task_id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::clear_chat_history(&conn, &task_id).map_err(|e: rusqlite::Error| e.to_string())
}
