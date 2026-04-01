use tauri::State;
use crate::state::AppState;

#[tauri::command]
pub async fn spawn_pty_session(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    session_id: String,
    binary: String,
    args: Vec<String>,
    cwd: String,
) -> Result<(), String> {
    let pty_manager = state.pty_manager.clone();
    let session_id_clone = session_id.clone();
    let binary_clone = binary.clone();
    let args_clone = args.clone();
    let cwd_clone = cwd.clone();
    
    // Set app handle first
    {
        let mut pm = pty_manager.write().map_err(|e| e.to_string())?;
        pm.set_app_handle(app_handle);
    }
    
    tokio::task::spawn_blocking(move || {
        let pm = pty_manager.read().map_err(|e| e.to_string())?;
        pm.spawn(session_id_clone, binary_clone, args_clone, cwd_clone)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pty_write(
    state: State<'_, AppState>, 
    session_id: String, 
    data: String
) -> Result<(), String> {
    let pty_manager = state.pty_manager.clone();
    tokio::task::spawn_blocking(move || {
        let pm = pty_manager.read().map_err(|e| e.to_string())?;
        pm.write(&session_id, &data)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pty_resize(
    state: State<'_, AppState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let pty_manager = state.pty_manager.clone();
    tokio::task::spawn_blocking(move || {
        let pm = pty_manager.read().map_err(|e| e.to_string())?;
        pm.resize(&session_id, rows, cols)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pty_kill(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let pty_manager = state.pty_manager.clone();
    tokio::task::spawn_blocking(move || {
        let pm = pty_manager.read().map_err(|e| e.to_string())?;
        pm.kill(&session_id)
    }).await.map_err(|e| e.to_string())?
}