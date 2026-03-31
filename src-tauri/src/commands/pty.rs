use tauri::State;
use crate::state::AppState;

#[tauri::command]
pub fn spawn_pty_session(
    state: State<AppState>,
    session_id: String,
    binary: String,
    args: Vec<String>,
    cwd: String,
) -> Result<(), String> {
    state.pty_manager.spawn(&session_id, &binary, &args, &cwd)
}

#[tauri::command]
pub fn pty_write(state: State<AppState>, session_id: String, data: String) -> Result<(), String> {
    state.pty_manager.write(&session_id, &data)
}

#[tauri::command]
pub fn pty_resize(
    state: State<AppState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    state.pty_manager.resize(&session_id, rows, cols)
}

#[tauri::command]
pub fn pty_read(state: State<AppState>, session_id: String) -> Result<String, String> {
    state.pty_manager.read_output(&session_id)
}

#[tauri::command]
pub fn pty_kill(state: State<AppState>, session_id: String) -> Result<(), String> {
    state.pty_manager.kill(&session_id)
}
