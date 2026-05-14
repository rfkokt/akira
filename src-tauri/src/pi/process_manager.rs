use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::{timeout, Duration};

use tauri::{AppHandle, Emitter};

use super::types::{PiCommand, PiError, PiEvent};

/// Payload emitted as a Tauri event on the `"pi-event"` channel.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiEventPayload {
    pub task_id: String,
    pub event: PiEvent,
}

/// Represents a running Pi subprocess associated with a task.
pub struct PiProcess {
    child: Child,
    stdin: ChildStdin,
    stdout_task: JoinHandle<()>,
    pub task_id: String,
    pub session_id: Option<String>,
}

/// Manages Pi subprocess lifecycle — spawning, communication, and termination.
/// Holds a map of task_id → active Pi process.
pub struct PiProcessManager {
    processes: Arc<Mutex<HashMap<String, PiProcess>>>,
    pi_binary_path: PathBuf,
    app_handle: AppHandle,
}

impl PiProcessManager {
    /// Create a new PiProcessManager.
    pub fn new(pi_binary_path: PathBuf, app_handle: AppHandle) -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            pi_binary_path,
            app_handle,
        }
    }

    /// Spawn a Pi subprocess for a task. Sets cwd to workspace path.
    /// Args: --mode rpc --no-session (or --session <id> for resume)
    pub async fn spawn(
        &self,
        task_id: &str,
        cwd: &Path,
        session_id: Option<&str>,
    ) -> Result<(), PiError> {
        // Validate workspace path exists and is a directory
        if !cwd.exists() || !cwd.is_dir() {
            return Err(PiError::InvalidWorkspace {
                path: cwd.to_path_buf(),
            });
        }

        // Ensure at most one process per task
        {
            let processes = self.processes.lock().await;
            if processes.contains_key(task_id) {
                // Already running for this task — terminate old one first
                drop(processes);
                self.terminate(task_id).await?;
            }
        }

        // Build command arguments
        let mut args = vec!["--mode".to_string(), "rpc".to_string()];
        if let Some(sid) = session_id {
            args.push("--session".to_string());
            args.push(sid.to_string());
        } else {
            args.push("--no-session".to_string());
        }

        // Spawn the Pi subprocess
        let mut child = Command::new(&self.pi_binary_path)
            .args(&args)
            .current_dir(cwd)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| PiError::StdinWriteFailed {
                task_id: task_id.to_string(),
                reason: format!("Failed to spawn Pi process: {}", e),
            })?;

        let stdin = child.stdin.take().ok_or_else(|| PiError::StdinWriteFailed {
            task_id: task_id.to_string(),
            reason: "Failed to capture stdin".to_string(),
        })?;

        let stdout = child.stdout.take().ok_or_else(|| PiError::StdinWriteFailed {
            task_id: task_id.to_string(),
            reason: "Failed to capture stdout".to_string(),
        })?;

        let stderr = child.stderr.take();

        // Spawn the stdout reader task
        let task_id_clone = task_id.to_string();
        let app_handle_clone = self.app_handle.clone();
        let processes_clone = self.processes.clone();

        let stdout_task = tokio::spawn(async move {
            Self::stdout_reader_loop(
                stdout,
                stderr,
                &task_id_clone,
                &app_handle_clone,
                processes_clone,
            )
            .await;
        });

        // Store the process
        let pi_process = PiProcess {
            child,
            stdin,
            stdout_task,
            task_id: task_id.to_string(),
            session_id: session_id.map(|s| s.to_string()),
        };

        let mut processes = self.processes.lock().await;
        processes.insert(task_id.to_string(), pi_process);

        Ok(())
    }

    /// Send a JSON command to the Pi process for a given task.
    pub async fn send_command(
        &self,
        task_id: &str,
        command: PiCommand,
    ) -> Result<(), PiError> {
        let mut processes = self.processes.lock().await;
        let process = processes.get_mut(task_id).ok_or_else(|| {
            PiError::ProcessNotRunning {
                task_id: task_id.to_string(),
            }
        })?;

        let json = serde_json::to_string(&command).map_err(|e| PiError::StdinWriteFailed {
            task_id: task_id.to_string(),
            reason: format!("Failed to serialize command: {}", e),
        })?;

        let line = format!("{}\n", json);
        process
            .stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| PiError::StdinWriteFailed {
                task_id: task_id.to_string(),
                reason: format!("Write failed: {}", e),
            })?;

        process.stdin.flush().await.map_err(|e| PiError::StdinWriteFailed {
            task_id: task_id.to_string(),
            reason: format!("Flush failed: {}", e),
        })?;

        Ok(())
    }

    /// Send abort command with priority (bypasses pending writes).
    /// This directly writes to stdin without going through any queue.
    pub async fn send_abort(&self, task_id: &str) -> Result<(), PiError> {
        let mut processes = self.processes.lock().await;
        let process = processes.get_mut(task_id).ok_or_else(|| {
            PiError::ProcessNotRunning {
                task_id: task_id.to_string(),
            }
        })?;

        // Priority write: serialize abort command and write directly
        let abort_cmd = PiCommand::Abort;
        let json =
            serde_json::to_string(&abort_cmd).map_err(|e| PiError::StdinWriteFailed {
                task_id: task_id.to_string(),
                reason: format!("Failed to serialize abort: {}", e),
            })?;

        let line = format!("{}\n", json);
        process
            .stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| PiError::StdinWriteFailed {
                task_id: task_id.to_string(),
                reason: format!("Abort write failed: {}", e),
            })?;

        process.stdin.flush().await.map_err(|e| PiError::StdinWriteFailed {
            task_id: task_id.to_string(),
            reason: format!("Abort flush failed: {}", e),
        })?;

        Ok(())
    }

    /// Gracefully terminate a Pi process: close stdin, wait 5s, SIGKILL.
    pub async fn terminate(&self, task_id: &str) -> Result<(), PiError> {
        let mut processes = self.processes.lock().await;
        let mut process = processes.remove(task_id).ok_or_else(|| {
            PiError::ProcessNotRunning {
                task_id: task_id.to_string(),
            }
        })?;

        // Drop stdin to signal EOF to the child process
        drop(process.stdin);

        // Wait up to 5 seconds for graceful exit
        let wait_result = timeout(Duration::from_secs(5), process.child.wait()).await;

        match wait_result {
            Ok(Ok(_)) => {
                // Process exited gracefully
            }
            Ok(Err(_)) | Err(_) => {
                // Timeout or error waiting — force kill
                let _ = process.child.kill().await;
            }
        }

        // Abort the stdout reader task
        process.stdout_task.abort();

        Ok(())
    }

    /// Terminate all active processes (app shutdown). 3s timeout before SIGKILL.
    pub async fn terminate_all(&self) {
        let mut processes = self.processes.lock().await;
        let task_ids: Vec<String> = processes.keys().cloned().collect();

        // Remove all processes and close their stdin handles to signal EOF
        let mut children: Vec<(String, Child, JoinHandle<()>)> = Vec::new();
        for task_id in &task_ids {
            if let Some(process) = processes.remove(task_id) {
                // Drop stdin to signal EOF
                drop(process.stdin);
                children.push((task_id.clone(), process.child, process.stdout_task));
            }
        }

        // Drop the lock before waiting
        drop(processes);

        // Wait up to 3 seconds total for all processes to exit, then force kill remaining
        for (_, ref mut child, ref stdout_task) in &mut children {
            let wait_result = timeout(Duration::from_secs(3), child.wait()).await;
            match wait_result {
                Ok(Ok(_)) => {
                    // Process exited gracefully
                }
                _ => {
                    // Timeout or error — force kill
                    let _ = child.kill().await;
                }
            }
            stdout_task.abort();
        }
    }

    /// Check if a process is running for a task.
    pub fn is_running(&self, task_id: &str) -> bool {
        // Use try_lock to avoid blocking; if lock is held, assume running
        match self.processes.try_lock() {
            Ok(processes) => processes.contains_key(task_id),
            Err(_) => true, // Lock is held, conservatively assume running
        }
    }

    /// Internal stdout reader loop that reads lines from Pi's stdout,
    /// parses them as JSON PiEvents, and emits Tauri events.
    /// On unexpected exit, emits an error event with exit code and stderr.
    async fn stdout_reader_loop(
        stdout: tokio::process::ChildStdout,
        stderr: Option<tokio::process::ChildStderr>,
        task_id: &str,
        app_handle: &AppHandle,
        processes: Arc<Mutex<HashMap<String, PiProcess>>>,
    ) {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut line_number: usize = 0;

        loop {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    line_number += 1;

                    if line.trim().is_empty() {
                        continue;
                    }

                    // DEBUG: Emit raw line as a debug event so frontend can see all Pi output
                    let _ = app_handle.emit("pi-debug", &serde_json::json!({
                        "taskId": task_id,
                        "line": line_number,
                        "raw": if line.len() > 1000 { &line[..1000] } else { &line },
                    }));

                    // Parse as raw JSON Value first, then try to deserialize as PiEvent
                    let raw_value = match serde_json::from_str::<serde_json::Value>(&line) {
                        Ok(v) => v,
                        Err(e) => {
                            log::warn!("[Pi stdout] Invalid JSON (line {}): {} | raw: {}", line_number, e, if line.len() > 200 { &line[..200] } else { &line });
                            continue;
                        }
                    };

                    // Try to deserialize as PiEvent
                    match serde_json::from_value::<PiEvent>(raw_value.clone()) {
                        Ok(event) => {
                            let payload = PiEventPayload {
                                task_id: task_id.to_string(),
                                event,
                            };
                            let _ = app_handle.emit("pi-event", &payload);
                        }
                        Err(parse_err) => {
                            let type_hint = raw_value.get("type")
                                .and_then(|t| t.as_str())
                                .unwrap_or("unknown");

                            // Only log as warning for truly unknown types, not for types we just don't handle
                            log::debug!(
                                "[Pi stdout] Unhandled event type '{}' (line {}): {}",
                                type_hint, line_number, parse_err
                            );
                            // Don't emit error for unknown event types — just skip them
                        }
                    }
                }
                Ok(None) => {
                    // EOF — process has closed stdout (likely exited)
                    break;
                }
                Err(e) => {
                    log::error!("Error reading Pi stdout for task {}: {}", task_id, e);
                    break;
                }
            }
        }

        // Process has exited — read stderr and emit error event
        let stderr_content = if let Some(stderr) = stderr {
            let mut stderr_reader = BufReader::new(stderr);
            let mut content = String::new();
            let _ = tokio::io::AsyncReadExt::read_to_string(&mut stderr_reader, &mut content).await;
            // Truncate to 4096 chars
            if content.len() > 4096 {
                content.truncate(4096);
            }
            content
        } else {
            String::new()
        };

        // Try to get exit code from the child process
        let exit_code = {
            let mut procs = processes.lock().await;
            if let Some(process) = procs.get_mut(task_id) {
                match process.child.try_wait() {
                    Ok(Some(status)) => status.code(),
                    _ => None,
                }
            } else {
                None
            }
        };

        // Only emit unexpected exit if the process wasn't intentionally terminated
        // (i.e., it's still in the map — intentional termination removes it first)
        let still_in_map = {
            let procs = processes.lock().await;
            procs.contains_key(task_id)
        };

        if still_in_map {
            let error_event = PiEvent::Response {
                command: "process_exit".to_string(),
                success: false,
                data: None,
                error: Some(format!(
                    "Pi subprocess exited unexpectedly: code={:?}, stderr={}",
                    exit_code, stderr_content
                )),
            };

            let payload = PiEventPayload {
                task_id: task_id.to_string(),
                event: error_event,
            };
            let _ = app_handle.emit("pi-event", &payload);

            // Remove the dead process from the map
            let mut procs = processes.lock().await;
            procs.remove(task_id);
        }
    }
}
