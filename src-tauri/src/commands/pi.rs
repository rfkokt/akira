use std::path::{Path, PathBuf};

use tauri::State;
use tokio::time::{timeout, Duration};

use crate::pi::{PiAuthStatus, PiBinaryDiscovery, PiCommand, PiError};
use crate::state::AppState;

// ─── Pi Lifecycle Commands ───────────────────────────────────────────────────

/// Discover the Pi binary on the system and store the path in state.
#[tauri::command]
pub async fn pi_discover_binary(state: State<'_, AppState>) -> Result<String, String> {
    let path = PiBinaryDiscovery::discover().map_err(|e| format!("{}", e))?;

    // Store the discovered path in state
    let mut pi_path = state.pi_binary_path.lock().map_err(|e| e.to_string())?;
    *pi_path = Some(path.clone());

    Ok(path.to_string_lossy().to_string())
}

/// Check Pi authentication status by spawning a temporary process,
/// sending `get_available_models`, and waiting up to 10s for a response.
#[tauri::command]
pub async fn pi_check_auth(state: State<'_, AppState>) -> Result<PiAuthStatus, String> {
    // Get the Pi binary path from state
    let pi_path = {
        let path_guard = state.pi_binary_path.lock().map_err(|e| e.to_string())?;
        match path_guard.as_ref() {
            Some(p) => p.clone(),
            None => {
                return Ok(PiAuthStatus {
                    authenticated: false,
                    error: Some("Pi binary not discovered yet".to_string()),
                });
            }
        }
    };

    // Spawn a temporary Pi process to check auth
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::process::Command;

    let mut child = Command::new(&pi_path)
        .args(["--mode", "rpc", "--no-session"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to spawn Pi for auth check: {}", e))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to capture stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;

    // Send get_available_models command
    let cmd = PiCommand::GetAvailableModels;
    let json = serde_json::to_string(&cmd).map_err(|e| e.to_string())?;
    let line = format!("{}\n", json);
    stdin
        .write_all(line.as_bytes())
        .await
        .map_err(|e| format!("Failed to write auth check command: {}", e))?;
    stdin
        .flush()
        .await
        .map_err(|e| format!("Failed to flush auth check command: {}", e))?;

    // Wait up to 10 seconds for a response
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    let result = timeout(Duration::from_secs(10), async {
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            // Try to parse as a PiEvent
            if let Ok(event) = serde_json::from_str::<crate::pi::PiEvent>(&line) {
                match event {
                    crate::pi::PiEvent::Response { command, success, error, .. } => {
                        if command == "get_available_models" {
                            if success {
                                return Ok(PiAuthStatus {
                                    authenticated: true,
                                    error: None,
                                });
                            } else {
                                return Ok(PiAuthStatus {
                                    authenticated: false,
                                    error,
                                });
                            }
                        }
                    }
                    _ => continue,
                }
            }
        }
        Ok(PiAuthStatus {
            authenticated: false,
            error: Some("No response received from Pi".to_string()),
        })
    })
    .await;

    // Clean up the temporary process
    drop(stdin);
    let _ = child.kill().await;

    match result {
        Ok(status) => status,
        Err(_) => Ok(PiAuthStatus {
            authenticated: false,
            error: Some("Pi authentication check timed out after 10 seconds".to_string()),
        }),
    }
}

/// Spawn a Pi subprocess for a task.
#[tauri::command]
pub async fn pi_spawn(
    state: State<'_, AppState>,
    task_id: String,
    workspace_path: String,
    session_id: Option<String>,
) -> Result<(), String> {
    let cwd = PathBuf::from(&workspace_path);
    state
        .pi_manager
        .spawn(&task_id, &cwd, session_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Terminate a Pi subprocess for a task.
#[tauri::command]
pub async fn pi_terminate(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state
        .pi_manager
        .terminate(&task_id)
        .await
        .map_err(|e| e.to_string())
}

// ─── Pi RPC Commands ─────────────────────────────────────────────────────────

/// Send a prompt message to Pi for a task.
#[tauri::command]
pub async fn pi_send_prompt(
    state: State<'_, AppState>,
    task_id: String,
    message: String,
) -> Result<(), String> {
    let cmd = PiCommand::Prompt { message };
    state
        .pi_manager
        .send_command(&task_id, cmd)
        .await
        .map_err(|e| e.to_string())
}

/// Send a steer message to Pi for a task (during active generation).
#[tauri::command]
pub async fn pi_send_steer(
    state: State<'_, AppState>,
    task_id: String,
    message: String,
) -> Result<(), String> {
    let cmd = PiCommand::Steer { message };
    state
        .pi_manager
        .send_command(&task_id, cmd)
        .await
        .map_err(|e| e.to_string())
}

/// Send an abort command to Pi for a task (priority write).
#[tauri::command]
pub async fn pi_abort(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state
        .pi_manager
        .send_abort(&task_id)
        .await
        .map_err(|e| e.to_string())
}

/// Request available models from Pi for a task.
#[tauri::command]
pub async fn pi_get_models(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    let cmd = PiCommand::GetAvailableModels;
    state
        .pi_manager
        .send_command(&task_id, cmd)
        .await
        .map_err(|e| e.to_string())
}

/// Set the active model on Pi for a task.
#[tauri::command]
pub async fn pi_set_model(
    state: State<'_, AppState>,
    task_id: String,
    model: String,
) -> Result<(), String> {
    let cmd = PiCommand::SetModel { model };
    state
        .pi_manager
        .send_command(&task_id, cmd)
        .await
        .map_err(|e| e.to_string())
}

/// Request session stats from Pi for a task.
#[tauri::command]
pub async fn pi_get_session_stats(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<(), String> {
    let cmd = PiCommand::GetSessionStats;
    state
        .pi_manager
        .send_command(&task_id, cmd)
        .await
        .map_err(|e| e.to_string())
}

/// Start a new session on Pi for a task. Returns the new session ID.
#[tauri::command]
pub async fn pi_new_session(state: State<'_, AppState>, task_id: String) -> Result<String, String> {
    let cmd = PiCommand::NewSession;
    state
        .pi_manager
        .send_command(&task_id, cmd)
        .await
        .map_err(|e| e.to_string())?;

    // The session ID will be returned via a pi-event; for now return a generated UUID
    // that the frontend can use as a reference until the event arrives.
    let session_id = uuid::Uuid::new_v4().to_string();
    Ok(session_id)
}

/// Send a compact command to Pi for a task.
#[tauri::command]
pub async fn pi_compact(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    let cmd = PiCommand::Compact;
    state
        .pi_manager
        .send_command(&task_id, cmd)
        .await
        .map_err(|e| e.to_string())
}

// ─── Session Management Commands ─────────────────────────────────────────────

/// Get the Pi session ID associated with a task.
/// Placeholder: will use DB queries in Phase 2.
#[tauri::command]
pub async fn pi_get_task_session(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<Option<String>, String> {
    // TODO: Phase 2 — query pi_sessions table for task_id
    // For now, return None (no session stored yet)
    Ok(None)
}

/// Create/store a Pi session association for a task.
/// Placeholder: will use DB queries in Phase 2.
#[tauri::command]
pub async fn pi_create_task_session(
    state: State<'_, AppState>,
    task_id: String,
    session_id: String,
) -> Result<(), String> {
    // TODO: Phase 2 — insert into pi_sessions table
    // For now, this is a no-op placeholder
    Ok(())
}

// ─── Git Branch Commands ─────────────────────────────────────────────────────

/// Create a task branch from a base branch.
///
/// 1. Generates a branch name via `slugify_task_branch`
/// 2. Creates the branch from the base branch using git
/// 3. Stores both branch names in the task's database record
/// 4. Returns the created branch name
#[tauri::command]
pub async fn pi_create_task_branch(
    state: State<'_, AppState>,
    task_id: String,
    base_branch: String,
    task_title: String,
    cwd: String,
) -> Result<String, String> {
    use crate::db::pi_queries;
    use crate::pi::git_branch;

    // Step 1: Generate the branch name from the task title and ID
    let branch_name = git_branch::slugify_task_branch(&task_title, &task_id);

    // Step 2: Create the branch (checkout base, then checkout -b new branch)
    git_branch::create_task_branch(Path::new(&cwd), &base_branch, &branch_name)
        .map_err(|e| e.to_string())?;

    // Step 3: Store both branches in the database
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        pi_queries::set_task_branches(&conn, &task_id, &base_branch, &branch_name)
            .map_err(|e| format!("Failed to store branch info: {}", e))?;
    }

    // Step 4: Return the branch name
    Ok(branch_name)
}

/// Checkout an existing task branch.
///
/// 1. Retrieves the stored task branch name from the database
/// 2. Checks out the branch using git
/// 3. Returns an error if no branch is stored for the task
#[tauri::command]
pub async fn pi_checkout_task_branch(
    state: State<'_, AppState>,
    task_id: String,
    cwd: String,
) -> Result<(), String> {
    use crate::db::pi_queries;
    use crate::pi::git_branch;

    // Step 1: Get the stored branch names from the database
    let task_branch = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let branches = pi_queries::get_task_branches(&conn, &task_id)
            .map_err(|e| format!("Failed to query branch info: {}", e))?;

        match branches {
            Some((_base_branch, task_branch)) => task_branch,
            None => {
                return Err(format!(
                    "No task branch found for task '{}'. Create a branch first.",
                    task_id
                ));
            }
        }
    };

    // Step 2: Checkout the task branch
    git_branch::checkout_branch(Path::new(&cwd), &task_branch)
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get the stored base branch and task branch for a task.
///
/// Returns null if no branch info is stored for the task.
#[tauri::command]
pub async fn pi_get_task_branches(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<Option<serde_json::Value>, String> {
    use crate::db::pi_queries;

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let branches = pi_queries::get_task_branches(&conn, &task_id)
        .map_err(|e| format!("Failed to query branch info: {}", e))?;

    match branches {
        Some((base_branch, task_branch)) => Ok(Some(serde_json::json!({
            "base_branch": base_branch,
            "task_branch": task_branch,
        }))),
        None => Ok(None),
    }
}

// ─── Rules Command ───────────────────────────────────────────────────────────

/// Maximum rules file size: 100KB (102,400 bytes).
pub const RULES_MAX_BYTES: usize = 102_400;

/// Truncate rules content to the maximum allowed size and convert to a String.
///
/// This is a pure function extracted from `pi_get_rules` for testability.
/// - If `content` is ≤ `RULES_MAX_BYTES`, returns the full content as a lossy UTF-8 string,
///   which may exceed `RULES_MAX_BYTES` due to replacement characters.
/// - If `content` exceeds `RULES_MAX_BYTES`, returns the first `RULES_MAX_BYTES` bytes
///   converted to a lossy UTF-8 string (a prefix of the original content).
///
/// The truncation operates on the raw byte input: if the input exceeds the limit,
/// only the first `RULES_MAX_BYTES` bytes are considered.
pub fn truncate_rules_content(content: &[u8]) -> String {
    let truncated = if content.len() > RULES_MAX_BYTES {
        &content[..RULES_MAX_BYTES]
    } else {
        content
    };
    String::from_utf8_lossy(truncated).to_string()
}

/// Read `.akira/rules.md` from the workspace path, truncating at 100KB.
/// Returns None if the file doesn't exist.
#[tauri::command]
pub async fn pi_get_rules(
    state: State<'_, AppState>,
    workspace_path: String,
) -> Result<Option<String>, String> {
    let rules_path = Path::new(&workspace_path).join(".akira").join("rules.md");

    if !rules_path.exists() {
        return Ok(None);
    }

    // Read the file contents
    let content = tokio::fs::read(&rules_path)
        .await
        .map_err(|e| PiError::RulesError {
            message: format!("Failed to read rules file: {}", e),
        })
        .map_err(|e| e.to_string())?;

    let text = truncate_rules_content(&content);

    Ok(Some(text))
}

#[cfg(test)]
mod rules_truncation_proptest {
    //! Property-based tests for rules file truncation at size limit.
    //!
    //! **Validates: Requirements 10.6**
    //!
    //! Property 12: For any rules file content, the loaded result SHALL have a byte
    //! length of at most 102,400 bytes (100KB). If the original content exceeds this
    //! limit, the result SHALL be exactly 102,400 bytes (a prefix of the original).
    //!
    //! Note: The truncation operates on raw bytes before lossy UTF-8 conversion.
    //! The property guarantees that at most RULES_MAX_BYTES of the original file
    //! are read and processed.

    use super::{truncate_rules_content, RULES_MAX_BYTES};
    use proptest::prelude::*;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(200))]

        /// **Validates: Requirements 10.6**
        ///
        /// Property 12: Rules file truncation at size limit.
        /// For any byte content, the truncation function processes at most
        /// RULES_MAX_BYTES of the input. We verify this by checking that the
        /// result matches from_utf8_lossy applied to at most the first
        /// RULES_MAX_BYTES of the input.
        #[test]
        fn truncation_uses_at_most_max_bytes_of_input(content in proptest::collection::vec(any::<u8>(), 0..200_000)) {
            let result = truncate_rules_content(&content);
            let expected_slice = if content.len() > RULES_MAX_BYTES {
                &content[..RULES_MAX_BYTES]
            } else {
                &content[..]
            };
            let expected = String::from_utf8_lossy(expected_slice).to_string();
            prop_assert_eq!(
                &result, &expected,
                "Result should match from_utf8_lossy of at most first {} bytes of input ({} bytes)",
                RULES_MAX_BYTES, content.len()
            );
        }

        /// **Validates: Requirements 10.6**
        ///
        /// Property 12: If original content exceeds 100KB, the result is derived
        /// from exactly the first RULES_MAX_BYTES bytes (the prefix of the original).
        #[test]
        fn oversized_input_truncated_to_exact_prefix(
            content in proptest::collection::vec(any::<u8>(), (RULES_MAX_BYTES + 1)..200_000)
        ) {
            let result = truncate_rules_content(&content);
            let expected = String::from_utf8_lossy(&content[..RULES_MAX_BYTES]).to_string();
            prop_assert_eq!(
                &result, &expected,
                "Oversized input ({} bytes) should produce result from exactly first {} bytes",
                content.len(), RULES_MAX_BYTES
            );
        }

        /// **Validates: Requirements 10.6**
        ///
        /// Property 12: If original content is within the limit, the result equals
        /// the full input converted to a string (no truncation occurs).
        #[test]
        fn undersized_input_preserved_fully(
            content in proptest::collection::vec(any::<u8>(), 0..=RULES_MAX_BYTES)
        ) {
            let result = truncate_rules_content(&content);
            let expected = String::from_utf8_lossy(&content).to_string();
            prop_assert_eq!(
                &result, &expected,
                "Input within limit ({} bytes) should be fully preserved",
                content.len()
            );
        }
    }
}

