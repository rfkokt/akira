// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Stdio, Child};
use std::io::{BufRead, BufReader, Write};
use std::sync::{Mutex, Arc};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, Emitter};
use serde::Serialize;

mod db;
use db::queries::{self, CreateEngineRequest, CreateTaskRequest, Engine, Task};

// Global state with database and running process
pub struct AppState {
    db: Mutex<rusqlite::Connection>,
    running_process: Mutex<Option<Arc<Mutex<Child>>>>,
    should_stop: Arc<AtomicBool>,
}

// ============== Basic Commands ==============

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// ============== Task Commands ==============

#[tauri::command]
fn create_task(state: tauri::State<AppState>, task: CreateTaskRequest) -> Result<Task, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::create_task(&conn, &task).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn get_all_tasks(state: tauri::State<AppState>) -> Result<Vec<Task>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_all_tasks(&conn).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn get_tasks_by_status(state: tauri::State<AppState>, status: String) -> Result<Vec<Task>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_tasks_by_status(&conn, &status).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn get_tasks_by_workspace(state: tauri::State<AppState>, workspace_id: String) -> Result<Vec<Task>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_tasks_by_workspace(&conn, &workspace_id).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn update_task_status(state: tauri::State<AppState>, id: String, status: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::update_task_status(&conn, &id, &status).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn delete_task(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::delete_task(&conn, &id).map_err(|e: rusqlite::Error| e.to_string())
}

// ============== Engine Commands ==============

#[tauri::command]
fn create_engine(state: tauri::State<AppState>, engine: CreateEngineRequest) -> Result<Engine, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::create_engine(&conn, &engine).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn get_all_engines(state: tauri::State<AppState>) -> Result<Vec<Engine>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_all_engines(&conn).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn update_engine_enabled(state: tauri::State<AppState>, id: i64, enabled: bool) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::update_engine_enabled(&conn, id, enabled).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn delete_engine(state: tauri::State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::delete_engine(&conn, id).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn seed_default_engines(state: tauri::State<AppState>) -> Result<Vec<Engine>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::seed_default_engines(&conn).map_err(|e| e.to_string())?;
    // Return all engines after seeding
    queries::get_all_engines(&conn).map_err(|e: rusqlite::Error| e.to_string())
}

// ============== CLI Runner Commands ==============

#[derive(Clone, Serialize)]
struct CliOutputEvent {
    line: String,
    is_error: bool,
}

#[derive(Clone, Serialize)]
struct CliCompleteEvent {
    success: bool,
    exit_code: Option<i32>,
    error_message: Option<String>,
}

/// Run a CLI binary with the given prompt and stream output to frontend
#[tauri::command]
async fn run_cli(
    binary: String,
    args: Vec<String>,
    prompt: String,
    cwd: Option<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    // Reset stop flag
    state.should_stop.store(false, Ordering::Relaxed);

    // Build command with working directory
    let mut cmd = Command::new(&binary);
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    
    // Set working directory if provided
    if let Some(working_dir) = cwd {
        cmd.current_dir(working_dir);
    }

    // Spawn the process
    let child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    // Store process in state
    let child_arc = Arc::new(Mutex::new(child));
    {
        let mut running = state.running_process.lock().map_err(|e| e.to_string())?;
        *running = Some(Arc::clone(&child_arc));
    }

    // Take ownership of stdio handles
    let mut child_lock = child_arc.lock().map_err(|e| e.to_string())?;
    let stdin = child_lock.stdin.take();
    let stdout = child_lock.stdout.take();
    let stderr = child_lock.stderr.take();
    drop(child_lock);

    // Write prompt to stdin in a separate thread
    let prompt_clone = prompt.clone();
    let stdin_handle = std::thread::spawn(move || {
        if let Some(mut stdin) = stdin {
            let _ = stdin.write_all(prompt_clone.as_bytes());
        }
    });

    // Stream stdout in a separate thread
    let stdout_app = app.clone();
    let stdout_stop = Arc::clone(&state.should_stop);
    let stdout_handle = std::thread::spawn(move || {
        if let Some(stdout) = stdout {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if stdout_stop.load(Ordering::Relaxed) {
                    break;
                }
                match line {
                    Ok(line) => {
                        let _ = stdout_app.emit("cli-output", CliOutputEvent {
                            line,
                            is_error: false,
                        });
                    }
                    Err(_) => break,
                }
            }
        }
    });

    // Stream stderr in a separate thread
    let stderr_app = app.clone();
    let stderr_stop = Arc::clone(&state.should_stop);
    let stderr_handle = std::thread::spawn(move || {
        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if stderr_stop.load(Ordering::Relaxed) {
                    break;
                }
                match line {
                    Ok(line) => {
                        let _ = stderr_app.emit("cli-output", CliOutputEvent {
                            line,
                            is_error: true,
                        });
                    }
                    Err(_) => break,
                }
            }
        }
    });

    // Wait for stdin to finish writing
    let _ = stdin_handle.join();

    // Wait for the process to complete
    let status = {
        let mut child_lock = child_arc.lock().map_err(|e| e.to_string())?;
        child_lock.wait()
    }.map_err(|e| format!("Failed to wait for process: {}", e))?;

    // Clear running process
    {
        let mut running = state.running_process.lock().map_err(|e| e.to_string())?;
        *running = None;
    }

    // Signal threads to stop
    state.should_stop.store(true, Ordering::Relaxed);

    // Wait for output threads to finish
    let _ = stdout_handle.join();
    let _ = stderr_handle.join();

    // Emit completion event
    let success = status.success();
    let exit_code = status.code();
    
    app.emit("cli-complete", CliCompleteEvent {
        success,
        exit_code,
        error_message: if success {
            None
        } else {
            Some(format!("Process exited with code: {:?}", exit_code))
        },
    }).map_err(|e| e.to_string())?;

    Ok(())
}

/// Stop the currently running CLI process
#[tauri::command]
fn stop_cli(state: tauri::State<'_, AppState>) -> Result<(), String> {
    // Signal stop
    state.should_stop.store(true, Ordering::Relaxed);
    
    // Kill the process if running
    let mut running = state.running_process.lock().map_err(|e| e.to_string())?;
    if let Some(child_arc) = running.take() {
        let mut child = child_arc.lock().map_err(|e| e.to_string())?;
        let _ = child.kill();
    }
    
    Ok(())
}

// ============== Chat History Commands ==============

#[tauri::command]
fn create_chat_message(
    state: tauri::State<AppState>,
    task_id: String,
    role: String,
    content: String,
    engine_alias: String,
) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::create_chat_message(&conn, &task_id, &role, &content, &engine_alias)
        .map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn get_chat_history(
    state: tauri::State<AppState>,
    task_id: String,
) -> Result<Vec<queries::ChatMessage>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_chat_history(&conn, &task_id)
        .map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn clear_chat_history(
    state: tauri::State<AppState>,
    task_id: String,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::clear_chat_history(&conn, &task_id)
        .map_err(|e: rusqlite::Error| e.to_string())
}

// ============== File System Commands ==============

use tauri_plugin_dialog::DialogExt;
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: Option<u64>,
}

#[tauri::command]
async fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let path_buf = PathBuf::from(&path);
    
    let entries = tokio::task::spawn_blocking(move || {
        fs::read_dir(&path_buf)
    }).await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    let mut files = Vec::new();
    for entry_result in entries {
        let entry = entry_result.map_err(|e| format!("Failed to read entry: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type()
            .map(|t: fs::FileType| t.is_dir())
            .unwrap_or(false);
        let size = if is_dir {
            None
        } else {
            entry.metadata().ok().map(|m: fs::Metadata| m.len())
        };
        let full_path = entry.path().to_string_lossy().to_string();
        
        files.push(FileEntry {
            path: full_path,
            name,
            is_dir,
            size,
        });
    }
    
    // Sort: directories first, then files
    files.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });
    
    Ok(files)
}

#[tauri::command]
async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
}

// ============== Task Import Commands ==============
use calamine::{Reader, Xlsx, open_workbook_from_rs, Data};
use std::io::Cursor;

#[derive(Debug, Deserialize)]
struct JsonTask {
    title: String,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
}

#[derive(Debug, Serialize)]
struct ImportResult {
    tasks: Vec<Task>,
}

#[tauri::command]
fn import_tasks_json(
    state: tauri::State<AppState>,
    content: String,
) -> Result<ImportResult, String> {
    let json_tasks: Vec<JsonTask> = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut imported_tasks = Vec::new();
    
    for json_task in json_tasks {
        let request = CreateTaskRequest {
            title: json_task.title,
            description: json_task.description,
            status: json_task.status.unwrap_or_else(|| "todo".to_string()),
            priority: json_task.priority.unwrap_or_else(|| "medium".to_string()),
            file_path: None,
            workspace_id: None,
        };
        
        match queries::create_task(&conn, &request) {
            Ok(task) => imported_tasks.push(task),
            Err(e) => eprintln!("Failed to import task: {}", e),
        }
    }
    
    Ok(ImportResult { tasks: imported_tasks })
}

#[tauri::command]
fn import_tasks_markdown(
    state: tauri::State<AppState>,
    content: String,
) -> Result<ImportResult, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut imported_tasks = Vec::new();
    let mut current_status = "todo";
    
    for line in content.lines() {
        let line = line.trim();
        
        // Parse headers for status
        if line.starts_with("## ") || line.starts_with("### ") {
            let header = line.trim_start_matches("#").trim();
            current_status = match header.to_lowercase().as_str() {
                "todo" | "to do" | "backlog" => "todo",
                "in progress" | "doing" | "wip" => "in-progress",
                "review" | "in review" => "review",
                "done" | "completed" | "finished" => "done",
                _ => "todo",
            };
            continue;
        }
        
        // Parse task items
        if line.starts_with("- [ ]") || line.starts_with("- [x]") || line.starts_with("- [X]") {
            let title = line
                .trim_start_matches("- [ ]")
                .trim_start_matches("- [x]")
                .trim_start_matches("- [X]")
                .trim();
            
            let status = if line.starts_with("- [x]") || line.starts_with("- [X]") {
                "done"
            } else {
                current_status
            };
            
            let request = CreateTaskRequest {
                title: title.to_string(),
                description: None,
                status: status.to_string(),
                priority: "medium".to_string(),
                file_path: None,
                workspace_id: None,
            };
            
            match queries::create_task(&conn, &request) {
                Ok(task) => imported_tasks.push(task),
                Err(e) => eprintln!("Failed to import task: {}", e),
            }
        }
    }
    
    Ok(ImportResult { tasks: imported_tasks })
}

#[tauri::command]
fn import_tasks_excel(
    state: tauri::State<AppState>,
    bytes: Vec<u8>,
) -> Result<ImportResult, String> {
    let cursor = Cursor::new(bytes);
    let mut workbook: Xlsx<Cursor<Vec<u8>>> = open_workbook_from_rs(cursor)
        .map_err(|e| format!("Failed to open Excel file: {}", e))?;
    
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut imported_tasks = Vec::new();
    
    // Get the first sheet
    let sheet_name = workbook.sheet_names()
        .first()
        .ok_or("Excel file has no sheets")?
        .clone();
    
    let range = workbook.worksheet_range(&sheet_name)
        .map_err(|e| format!("Failed to read sheet: {}", e))?;
    
    let mut headers: Vec<String> = Vec::new();
    let mut is_first_row = true;
    
    for row in range.rows() {
        if is_first_row {
            // Parse headers
            for cell in row {
                let header = match cell {
                    Data::String(s) => s.to_lowercase().replace(" ", "_"),
                    Data::Float(f) => f.to_string(),
                    _ => String::new(),
                };
                headers.push(header);
            }
            is_first_row = false;
            continue;
        }
        
        // Parse row data
        let mut title = String::new();
        let mut description: Option<String> = None;
        let mut status = "todo".to_string();
        let mut priority = "medium".to_string();
        
        for (idx, cell) in row.iter().enumerate() {
            if idx >= headers.len() {
                break;
            }
            
            let value = match cell {
                Data::String(s) => s.clone(),
                Data::Float(f) => f.to_string(),
                Data::Int(i) => i.to_string(),
                Data::Bool(b) => b.to_string(),
                _ => String::new(),
            };
            
            match headers[idx].as_str() {
                "title" | "task" | "name" => title = value,
                "description" | "desc" | "details" => {
                    if !value.is_empty() {
                        description = Some(value);
                    }
                }
                "status" | "state" => {
                    if !value.is_empty() {
                        status = match value.to_lowercase().as_str() {
                            "todo" | "to do" | "backlog" => "todo",
                            "in progress" | "doing" | "wip" => "in-progress",
                            "review" | "in review" => "review",
                            "done" | "completed" | "finished" => "done",
                            _ => "todo",
                        }.to_string();
                    }
                }
                "priority" | "importance" | "urgency" => {
                    if !value.is_empty() {
                        priority = match value.to_lowercase().as_str() {
                            "high" | "critical" | "urgent" => "high",
                            "medium" | "normal" => "medium",
                            "low" => "low",
                            _ => "medium",
                        }.to_string();
                    }
                }
                _ => {}
            }
        }
        
        if !title.is_empty() {
            let request = CreateTaskRequest {
                title,
                description,
                status,
                priority,
                file_path: None,
                workspace_id: None,
            };
            
            match queries::create_task(&conn, &request) {
                Ok(task) => imported_tasks.push(task),
                Err(e) => eprintln!("Failed to import task: {}", e),
            }
        }
    }

    Ok(ImportResult { tasks: imported_tasks })
}

// ============== Workspace Commands ==============

#[derive(Debug, Serialize, Deserialize)]
struct WorkspaceData {
    id: String,
    name: String,
    folder_path: String,
    is_active: bool,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[tauri::command]
fn create_workspace(
    state: tauri::State<AppState>,
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
fn get_all_workspaces(state: tauri::State<AppState>) -> Result<Vec<WorkspaceData>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    queries::get_all_workspaces(&conn)
        .map(|workspaces| {
            workspaces.into_iter().map(|w| WorkspaceData {
                id: w.id,
                name: w.name,
                folder_path: w.folder_path,
                is_active: w.is_active,
                created_at: w.created_at,
                updated_at: w.updated_at,
            }).collect()
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_active_workspace(state: tauri::State<AppState>) -> Result<Option<WorkspaceData>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    queries::get_active_workspace(&conn)
        .map(|opt| opt.map(|w| WorkspaceData {
            id: w.id,
            name: w.name,
            folder_path: w.folder_path,
            is_active: w.is_active,
            created_at: w.created_at,
            updated_at: w.updated_at,
        }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_active_workspace(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::set_active_workspace(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_workspace(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::delete_workspace(&conn, &id).map_err(|e| e.to_string())
}

// ============== Project Config Commands ==============

#[derive(Debug, Serialize, Deserialize)]
struct ProjectConfigData {
    id: Option<i64>,
    workspace_id: String,
    md_persona: String,
    md_tech_stack: String,
    md_rules: String,
    md_tone: String,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[tauri::command]
fn get_project_config(
    state: tauri::State<AppState>,
    workspace_id: String,
) -> Result<Option<ProjectConfigData>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    match queries::get_project_config(&conn, &workspace_id) {
        Ok(Some(config)) => Ok(Some(ProjectConfigData {
            id: config.id,
            workspace_id: config.workspace_id,
            md_persona: config.md_persona,
            md_tech_stack: config.md_tech_stack,
            md_rules: config.md_rules,
            md_tone: config.md_tone,
            created_at: config.created_at,
            updated_at: config.updated_at,
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_project_config(
    state: tauri::State<AppState>,
    config: ProjectConfigData,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    let db_config = queries::ProjectConfig {
        id: config.id,
        workspace_id: config.workspace_id,
        md_persona: config.md_persona,
        md_tech_stack: config.md_tech_stack,
        md_rules: config.md_rules,
        md_tone: config.md_tone,
        created_at: config.created_at,
        updated_at: config.updated_at,
    };
    
    queries::save_project_config(&conn, &db_config)
        .map_err(|e| e.to_string())
}

// ============== Git Commands ==============

#[derive(Debug, Serialize)]
struct GitBranchInfo {
    current: String,
    branches: Vec<String>,
}

/// Get current git branch and list all branches
#[tauri::command]
fn git_get_branches(cwd: String) -> Result<GitBranchInfo, String> {
    // Get current branch
    let current_output = Command::new("git")
        .args(&["branch", "--show-current"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get current branch: {}", e))?;
    
    let current = String::from_utf8_lossy(&current_output.stdout)
        .trim()
        .to_string();
    
    // Get all branches
    let branches_output = Command::new("git")
        .args(&["branch", "-a"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to list branches: {}", e))?;
    
    let branches_str = String::from_utf8_lossy(&branches_output.stdout);
    let branches: Vec<String> = branches_str
        .lines()
        .map(|line| {
            // Remove leading spaces, asterisks, and "remotes/" prefix
            line.trim()
                .trim_start_matches('*')
                .trim()
                .trim_start_matches("remotes/origin/")
                .to_string()
        })
        .filter(|b| !b.is_empty())
        .collect::<std::collections::HashSet<_>>() // Remove duplicates
        .into_iter()
        .collect();
    
    Ok(GitBranchInfo { current, branches })
}

/// Checkout to a different branch
#[tauri::command]
fn git_checkout_branch(cwd: String, branch: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(&["checkout", &branch])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to checkout branch: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git checkout failed: {}", stderr));
    }
    
    Ok(())
}

/// Create and checkout a new branch
#[tauri::command]
fn git_create_branch(cwd: String, branch: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(&["checkout", "-b", &branch])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to create branch: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git branch creation failed: {}", stderr));
    }
    
    Ok(())
}

#[derive(Debug, Serialize)]
struct GitDiffResult {
    diff: String,
    has_changes: bool,
    changed_files: Vec<String>,
}

/// Get uncommitted changes (git diff)
#[tauri::command]
fn git_get_diff(cwd: String) -> Result<GitDiffResult, String> {
    let output = Command::new("git")
        .args(&["diff", "--no-color"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get git diff: {}", e))?;
    
    let diff = String::from_utf8_lossy(&output.stdout).to_string();
    let has_changes = !diff.trim().is_empty();
    
    let changed_files: Vec<String> = diff
        .lines()
        .filter(|line| line.starts_with("diff --git"))
        .map(|line| {
            line.trim_start_matches("diff --git ")
                .split_whitespace()
                .next()
                .unwrap_or("")
                .to_string()
        })
        .filter(|f| !f.is_empty())
        .collect();
    
    Ok(GitDiffResult {
        diff,
        has_changes,
        changed_files,
    })
}

/// Get staged changes (git diff --cached)
#[tauri::command]
fn git_get_staged_diff(cwd: String) -> Result<GitDiffResult, String> {
    let output = Command::new("git")
        .args(&["diff", "--cached", "--no-color"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get staged diff: {}", e))?;
    
    let diff = String::from_utf8_lossy(&output.stdout).to_string();
    let has_changes = !diff.trim().is_empty();
    
    let changed_files: Vec<String> = diff
        .lines()
        .filter(|line| line.starts_with("diff --git"))
        .map(|line| {
            line.trim_start_matches("diff --git ")
                .split_whitespace()
                .next()
                .unwrap_or("")
                .to_string()
        })
        .filter(|f| !f.is_empty())
        .collect();
    
    Ok(GitDiffResult {
        diff,
        has_changes,
        changed_files,
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize database
            let app_dir = app.path().app_local_data_dir()
                .expect("Failed to get app local data dir");
            
            // Create app directory if it doesn't exist
            std::fs::create_dir_all(&app_dir)
                .expect("Failed to create app directory");
            
            let conn = db::init_db(&app_dir)
                .expect("Failed to initialize database");
            
            // Seed default engines (optional)
            match db::seed_default_engines(&conn) {
                Ok(_) => println!("✅ Default engines seeded successfully"),
                Err(e) => eprintln!("⚠️ Failed to seed default engines: {}", e),
            }
            
            app.manage(AppState { 
                db: Mutex::new(conn),
                running_process: Mutex::new(None),
                should_stop: Arc::new(AtomicBool::new(false)),
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            create_task,
            get_all_tasks,
            get_tasks_by_status,
            get_tasks_by_workspace,
            update_task_status,
            delete_task,
            create_engine,
            get_all_engines,
            update_engine_enabled,
            delete_engine,
            seed_default_engines,
            run_cli,
            stop_cli,
            create_chat_message,
            get_chat_history,
            clear_chat_history,
            import_tasks_json,
            import_tasks_markdown,
            import_tasks_excel,
            read_directory,
            pick_folder,
            create_workspace,
            get_all_workspaces,
            get_active_workspace,
            set_active_workspace,
            delete_workspace,
            get_project_config,
            save_project_config,
            git_get_branches,
            git_checkout_branch,
            git_create_branch,
            git_get_diff,
            git_get_staged_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
