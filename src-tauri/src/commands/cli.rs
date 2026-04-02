use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::thread;
use tauri::{Emitter, State};
use crate::state::AppState;

#[derive(Debug, Clone, serde::Serialize)]
struct CliOutput {
    id: String,
    line: String,
    is_error: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
struct CliComplete {
    id: String,
    success: bool,
    error_message: Option<String>,
}

#[tauri::command]
pub async fn run_cli(
    window: tauri::Window,
    _state: State<'_, AppState>,
    id: String,
    binary: String,
    args: Vec<String>,
    prompt: String,
    cwd: String,
) -> Result<(), String> {
    // Set up the command
    let mut cmd = Command::new(&binary);
    cmd.args(&args)
        .current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    
    // Spawn the process
    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn process: {}", e))?;
    
    // Get stdin and write prompt
    if let Some(mut stdin) = child.stdin.take() {
        let prompt_clone = prompt.clone();
        thread::spawn(move || {
            let _ = stdin.write_all(prompt_clone.as_bytes());
            let _ = stdin.write_all(b"\n");
        });
    }
    
    // Take stdout and stderr before moving child
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    
    // Clone window for stdout thread
    let window_stdout = window.clone();
    let id_stdout = id.clone();
    
    // Handle stdout
    if let Some(stdout) = stdout {
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(line) = line {
                    let _ = window_stdout.emit("cli-output", CliOutput {
                        id: id_stdout.clone(),
                        line,
                        is_error: false,
                    });
                }
            }
        });
    }
    
    // Clone window for stderr thread
    let window_stderr = window.clone();
    let id_stderr = id.clone();
    
    // Handle stderr
    if let Some(stderr) = stderr {
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    let _ = window_stderr.emit("cli-output", CliOutput {
                        id: id_stderr.clone(),
                        line,
                        is_error: true,
                    });
                }
            }
        });
    }
    
    // Wait for completion in a separate thread
    let window_complete = window.clone();
    let id_complete = id.clone();
    
    thread::spawn(move || {
        // Wait for the child process to complete
        let result = child.wait();
        let success = result.map(|s| s.success()).unwrap_or(false);
        
        // Emit completion event
        let _ = window_complete.emit("cli-complete", CliComplete {
            id: id_complete,
            success,
            error_message: None,
        });
    });
    
    Ok(())
}

#[tauri::command]
pub fn stop_cli(_state: State<AppState>) -> Result<(), String> {
    // Note: In the current implementation, we don't store the child process
    // so we can't stop it. In a real implementation, you'd need to store
    // the child process ID or handle in the state.
    Ok(())
}
