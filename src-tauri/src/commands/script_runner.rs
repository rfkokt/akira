use serde::Serialize;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize)]
pub struct ScriptEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub data: Option<String>,
    pub code: Option<i32>,
}

// Global state to track running scripts
pub struct ScriptRunnerState {
    pub processes: Arc<Mutex<HashMap<String, Child>>>,
}

impl ScriptRunnerState {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// Run a script with streaming output
#[tauri::command]
pub async fn run_script_streaming(
    task_id: String,
    command: String,
    cwd: String,
    app: AppHandle,
    state: tauri::State<'_, ScriptRunnerState>,
) -> Result<(), String> {
    // Parse command (support for commands with arguments)
    let parts: Vec<&str> = command.split_whitespace().collect();
    if parts.is_empty() {
        return Err("Empty command".to_string());
    }

    let program = parts[0];
    let args = &parts[1..];

    // Spawn process
    let child = Command::new(program)
        .args(args)
        .current_dir(&cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let task_id_clone = task_id.clone();

    // Store process handle
    {
        let mut processes = state.processes.lock().await;
        processes.insert(task_id.clone(), child);
    }

    // Get stdout and stderr
    let mut child = {
        let mut processes = state.processes.lock().await;
        processes.remove(&task_id).unwrap()
    };

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let event_id = format!("script-event-{}", task_id_clone);

    // Stream stdout
    let stdout_handle = {
        let app = app.clone();
        let event_id = event_id.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app.emit(
                    &event_id,
                    ScriptEvent {
                        event_type: "output".to_string(),
                        data: Some(line),
                        code: None,
                    },
                );
            }
        })
    };

    // Stream stderr
    let stderr_handle = {
        let app = app.clone();
        let event_id = event_id.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app.emit(
                    &event_id,
                    ScriptEvent {
                        event_type: "error".to_string(),
                        data: Some(line),
                        code: None,
                    },
                );
            }
        })
    };

    // Wait for process to complete
    let result = tokio::select! {
        status = child.wait() => {
            match status {
                Ok(status) => {
                    let code = status.code().unwrap_or(-1);
                    let _ = app.emit(&event_id, ScriptEvent {
                        event_type: "exit".to_string(),
                        data: None,
                        code: Some(code),
                    });
                    Ok(())
                }
                Err(e) => Err(format!("Process error: {}", e)),
            }
        }
        _ = stdout_handle => Ok(()),
        _ = stderr_handle => Ok(()),
    };

    // Clean up process from state
    {
        let mut processes = state.processes.lock().await;
        processes.remove(&task_id_clone);
    }

    result
}

/// Stop a running script
#[tauri::command]
pub async fn stop_script(
    task_id: String,
    state: tauri::State<'_, ScriptRunnerState>,
) -> Result<(), String> {
    let mut processes = state.processes.lock().await;

    if let Some(mut child) = processes.remove(&task_id) {
        // Try to kill the process gracefully first
        let _ = child.kill().await;

        // Wait a bit for cleanup
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        Ok(())
    } else {
        Err("No running script found for this task".to_string())
    }
}
