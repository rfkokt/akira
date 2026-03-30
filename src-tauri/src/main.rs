// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Stdio, Child};
use std::io::{BufRead, BufReader, Write};
use std::sync::{Mutex, Arc};
use std::sync::atomic::{AtomicBool, Ordering};
use std::path::PathBuf;
use std::fs;
use std::collections::HashMap;
use tauri::{Manager, Emitter};
use serde::{Serialize, Deserialize};

mod db;
mod cli_router;
mod pty_manager;

use pty_manager::PtyManager;
use db::queries::{self, CreateEngineRequest, CreateTaskRequest, Engine, Task};
use cli_router::queries::{
    ProviderCostSummary, RouterSession, ContextMessage as DbContextMessage, SwitchHistory,
};

mod cli_router_core;
use cli_router_core::{
    CliRouter, ProviderInfo, ProviderStatus, RouterConfig,
    create_backend_from_engine,
};

// Global state with database and running process
pub struct AppState {
    db: Mutex<rusqlite::Connection>,
    running_process: Mutex<Option<Arc<Mutex<Child>>>>,
    should_stop: Mutex<HashMap<String, Arc<AtomicBool>>>,
    rtk_path: Mutex<Option<PathBuf>>,
    cli_router: Arc<CliRouter>,
    pty_manager: Arc<PtyManager>,
}

// ============== RTK Integration ==============

const RTK_VERSION: &str = "0.34.1";

fn get_rtk_path() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let rtk_path = home.join(".local").join("bin").join("rtk");
    
    #[cfg(target_os = "windows")]
    let rtk_path = home.join(".local").join("bin").join("rtk.exe");
    
    if rtk_path.exists() {
        Some(rtk_path)
    } else {
        None
    }
}

#[derive(Debug, Clone, Serialize)]
struct RtkStats {
    input_tokens: usize,
    output_tokens: usize,
    savings_pct: f64,
}

fn run_with_rtk(
    rtk_path: &PathBuf,
    command: &str,
    args: &[&str],
    cwd: &str,
) -> Result<(String, bool, Option<RtkStats>), String> {
    let mut cmd_args = vec![command.to_string()];
    cmd_args.extend(args.iter().map(|s| s.to_string()));
    
    let (raw_output, raw_success) = {
        let output = Command::new(command)
            .args(args)
            .current_dir(cwd)
            .output()
            .map_err(|e| format!("Failed to run {}: {}", command, e))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let combined = if stderr.is_empty() { stdout.clone() } else { format!("{}\n{}", stdout, stderr) };
        (combined, output.status.success())
    };
    
    let input_tokens = estimate_tokens(&raw_output);
    
    let output = Command::new(rtk_path)
        .args(&cmd_args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run RTK: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let rtk_output = if stdout.is_empty() { stderr } else { stdout };
    
    let output_tokens = estimate_tokens(&rtk_output);
    let saved_tokens = input_tokens.saturating_sub(output_tokens);
    let savings_pct = if input_tokens > 0 {
        (saved_tokens as f64 / input_tokens as f64) * 100.0
    } else {
        0.0
    };
    
    let stats = Some(RtkStats {
        input_tokens,
        output_tokens,
        savings_pct,
    });
    
    println!("[RTK] {}: {} → {} tokens ({:.1}% saved)", command, input_tokens, output_tokens, savings_pct);
    
    Ok((rtk_output, raw_success && output.status.success(), stats))
}

fn get_platform_url() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let arch = if cfg!(target_arch = "aarch64") {
            "aarch64-apple-darwin"
        } else {
            "x86_64-apple-darwin"
        };
        Some(format!(
            "https://github.com/rtk-ai/rtk/releases/download/v{}/rtk-{}.tar.gz",
            RTK_VERSION, arch
        ))
    }
    #[cfg(target_os = "linux")]
    {
        let arch = if cfg!(target_arch = "aarch64") {
            "aarch64-unknown-linux-gnu"
        } else {
            "x86_64-unknown-linux-musl"
        };
        Some(format!(
            "https://github.com/rtk-ai/rtk/releases/download/v{}/rtk-{}.tar.gz",
            RTK_VERSION, arch
        ))
    }
    #[cfg(target_os = "windows")]
    {
        Some(format!(
            "https://github.com/rtk-ai/rtk/releases/download/v{}/rtk-x86_64-pc-windows-msvc.zip",
            RTK_VERSION
        ))
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        None
    }
}

fn ensure_rtk_installed() -> Result<PathBuf, String> {
    if let Some(path) = get_rtk_path() {
        return Ok(path);
    }
    
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let bin_dir = home.join(".local").join("bin");
    let rtk_path = bin_dir.join("rtk");
    
    // Create bin directory if it doesn't exist
    std::fs::create_dir_all(&bin_dir)
        .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    
    let url = get_platform_url().ok_or("Unsupported platform")?;
    
    println!("Downloading RTK from {}", url);
    
    // Download the tarball/zip
    let response = reqwest::blocking::get(&url)
        .map_err(|e| format!("Failed to download RTK: {}", e))?;
    
    let bytes = response.bytes()
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    // Extract based on platform
    #[cfg(target_os = "macos")]
    {
        use flate2::read::GzDecoder;
        
        let decoder = GzDecoder::new(&bytes[..]);
        let mut tar = tar::Archive::new(decoder);
        tar.unpack(&bin_dir)
            .map_err(|e| format!("Failed to extract RTK: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        use flate2::read::GzDecoder;
        
        let decoder = GzDecoder::new(&bytes[..]);
        let mut tar = tar::Archive::new(decoder);
        tar.unpack(&bin_dir)
            .map_err(|e| format!("Failed to extract RTK: {}", e))?;
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::fs::File;
        use std::io::Write;
        
        let mut cursor = std::io::Cursor::new(&bytes[..]);
        let mut archive = zip::ZipArchive::new(&mut cursor)
            .map_err(|e| format!("Failed to read zip: {}", e))?;
        
        for i in 0..archive.len() {
            let mut file = archive.by_index(i)
                .map_err(|e| format!("Failed to read zip entry: {}", e))?;
            let outpath = bin_dir.join(file.name());
            
            if file.name().ends_with('/') {
                std::fs::create_dir_all(&outpath).ok();
            } else {
                if let Some(p) = outpath.parent() {
                    std::fs::create_dir_all(p).ok();
                }
                let mut outfile = File::create(&outpath)
                    .map_err(|e| format!("Failed to create file: {}", e))?;
                std::io::copy(&mut file, &mut outfile)
                    .map_err(|e| format!("Failed to write file: {}", e))?;
            }
        }
    }
    
    // Make executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&rtk_path)
            .map_err(|e| format!("Failed to get permissions: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&rtk_path, perms)
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }
    
    println!("RTK installed successfully at {:?}", rtk_path);
    Ok(rtk_path)
}

// Estimate tokens (rough approximation: 4 chars per token)
fn estimate_tokens(text: &str) -> usize {
    (text.len() as f64 / 4.0).ceil() as usize
}

#[derive(Debug, Serialize)]
struct RtkInstallResult {
    installed: bool,
    path: Option<String>,
    version: Option<String>,
    error: Option<String>,
}

#[tauri::command]
fn check_rtk_status() -> RtkInstallResult {
    if let Some(path) = get_rtk_path() {
        let output = Command::new(&path)
            .args(["--version"])
            .output();
        
        match output {
            Ok(out) => {
                let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
                RtkInstallResult {
                    installed: true,
                    path: Some(path.to_string_lossy().to_string()),
                    version: Some(version),
                    error: None,
                }
            }
            Err(e) => RtkInstallResult {
                installed: false,
                path: Some(path.to_string_lossy().to_string()),
                version: None,
                error: Some(e.to_string()),
            },
        }
    } else {
        RtkInstallResult {
            installed: false,
            path: None,
            version: None,
            error: None,
        }
    }
}

#[tauri::command]
fn install_rtk() -> RtkInstallResult {
    match ensure_rtk_installed() {
        Ok(path) => {
            let output = Command::new(&path)
                .args(["--version"])
                .output();
            
            let version = output
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .unwrap_or_else(|_| "unknown".to_string());
            
            RtkInstallResult {
                installed: true,
                path: Some(path.to_string_lossy().to_string()),
                version: Some(version),
                error: None,
            }
        }
        Err(e) => RtkInstallResult {
            installed: false,
            path: None,
            version: None,
            error: Some(e),
        },
    }
}

#[derive(Debug, Serialize)]
struct RtkInitResult {
    success: bool,
    message: String,
}

#[tauri::command]
fn init_rtk() -> Result<RtkInitResult, String> {
    let rtk_path = get_rtk_path()
        .ok_or_else(|| "RTK not installed. Call install_rtk first.".to_string())?;
    
    let output = Command::new(&rtk_path)
        .args(["init", "-g"])
        .output()
        .map_err(|e| format!("Failed to run rtk init: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    
    if output.status.success() {
        Ok(RtkInitResult {
            success: true,
            message: if stdout.is_empty() { "RTK initialized successfully!".to_string() } else { stdout },
        })
    } else {
        Ok(RtkInitResult {
            success: false,
            message: if stderr.is_empty() { "RTK init failed".to_string() } else { stderr },
        })
    }
}

#[derive(Debug, Serialize)]
struct RtkCommandResult {
    success: bool,
    output: String,
    input_tokens: usize,
    output_tokens: usize,
    savings_pct: f64,
    raw_output: Option<String>,
}

#[tauri::command]
fn run_rtk_command(
    state: tauri::State<'_, AppState>,
    subcommand: String,
    args: Vec<String>,
    cwd: String,
) -> Result<RtkCommandResult, String> {
    let rtk_path = {
        let rtk_path_guard = state.rtk_path.lock()
            .map_err(|e| format!("Failed to lock rtk_path: {}", e))?;
        
        if let Some(ref path) = *rtk_path_guard {
            path.clone()
        } else {
            return Err("RTK not installed. Call install_rtk first.".to_string());
        }
    };
    
    let mut cmd_args = vec![subcommand.clone()];
    cmd_args.extend(args);
    
    // Run raw command first to capture original output
    let (raw_output, raw_success) = if subcommand == "git" {
        let git_args = cmd_args.iter().skip(1).cloned().collect::<Vec<_>>();
        println!("[RTK] Running raw git: {:?} with args {:?}", "git", git_args);
        let output = Command::new("git")
            .args(&git_args)
            .current_dir(&cwd)
            .output()
            .map_err(|e| format!("Failed to run git: {}", e))?;
        println!("[RTK] Raw git exit code: {:?}", output.status.code());
        
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let combined = if stderr.is_empty() { stdout.clone() } else { format!("{}\n{}", stdout, stderr) };
        (combined, output.status.success())
    } else {
            let binary = cmd_args.get(1).cloned().unwrap_or_else(|| String::new());
        let tool_args = cmd_args.iter().skip(2).cloned().collect::<Vec<_>>();
        
        let output = Command::new(&binary)
            .args(&tool_args)
            .current_dir(&cwd)
            .output();
        
        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                let combined = if stderr.is_empty() { stdout.clone() } else { format!("{}\n{}", stdout, stderr) };
                (combined, out.status.success())
            }
            Err(_) => (String::new(), false),
        }
    };
    
    let input_tokens = estimate_tokens(&raw_output);
    
    // Run RTK command
    println!("[RTK] Running: {:?} with args {:?}", rtk_path, cmd_args);
    
    let output = Command::new(&rtk_path)
        .args(&cmd_args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to run RTK: {}", e))?;
    
    println!("[RTK] Exit code: {:?}", output.status.code());
    
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    
    println!("[RTK] stdout length: {}, stderr length: {}", stdout.len(), stderr.len());
    if !stdout.is_empty() {
        println!("[RTK] stdout preview: {}", &stdout[..stdout.len().min(500)]);
    }
    if !stderr.is_empty() {
        println!("[RTK] stderr: {}", stderr);
    }
    
    let rtk_output = if stdout.is_empty() {
        stderr
    } else {
        stdout
    };
    
    let output_tokens = estimate_tokens(&rtk_output);
    let saved_tokens = input_tokens.saturating_sub(output_tokens);
    let savings_pct = if input_tokens > 0 {
        ((saved_tokens) as f64 / input_tokens as f64) * 100.0
    } else {
        0.0
    };

    // Track token savings in database
    if let Ok(conn) = state.db.lock() {
        let rtk_cmd = format!("rtk {}", cmd_args.join(" "));
        let original_cmd = if subcommand == "git" {
            format!("git {}", cmd_args.iter().skip(1).cloned().collect::<Vec<_>>().join(" "))
        } else {
            format!("{} {}", cmd_args.get(1).map(|s| s.as_str()).unwrap_or(""), cmd_args.iter().skip(2).cloned().collect::<Vec<_>>().join(" "))
        };
        
        let _ = conn.execute(
            "INSERT INTO rtk_history (timestamp, original_cmd, rtk_cmd, input_tokens, output_tokens, saved_tokens, savings_pct) VALUES (datetime('now'), ?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![original_cmd, rtk_cmd, input_tokens as i64, output_tokens as i64, saved_tokens as i64, savings_pct],
        );
    }
    
    Ok(RtkCommandResult {
        success: raw_success && output.status.success(),
        output: rtk_output,
        input_tokens,
        output_tokens,
        savings_pct,
        raw_output: if savings_pct > 50.0 { Some(raw_output) } else { None },
    })
}

#[derive(Debug, Serialize)]
struct RtkGainStats {
    total_commands: i64,
    total_saved: i64,
    avg_savings: f64,
    top_commands: Vec<RtkCommandStats>,
}

#[derive(Debug, Serialize)]
struct RtkCommandStats {
    cmd: String,
    count: i64,
    avg_savings: f64,
}

#[tauri::command]
fn get_rtk_gain_stats(state: tauri::State<'_, AppState>, days: Option<i64>) -> Result<RtkGainStats, String> {
    let days = days.unwrap_or(90);
    
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    let (total_commands, total_saved, avg_savings): (i64, i64, f64) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(saved_tokens), 0), COALESCE(AVG(savings_pct), 0) FROM rtk_history WHERE timestamp > datetime('now', ?1)",
        [format!("-{} days", days)],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).unwrap_or((0, 0, 0.0));
    
    let mut stmt = conn.prepare(
        "SELECT original_cmd, COUNT(*) as cnt, AVG(savings_pct) as avg_sav FROM rtk_history WHERE timestamp > datetime('now', ?1) GROUP BY original_cmd ORDER BY cnt DESC LIMIT 10"
    ).map_err(|e| e.to_string())?;
    
    let top_commands: Vec<RtkCommandStats> = stmt.query_map([format!("-{} days", days)], |row| {
        Ok(RtkCommandStats {
            cmd: row.get(0)?,
            count: row.get(1)?,
            avg_savings: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    
    Ok(RtkGainStats {
        total_commands,
        total_saved,
        avg_savings,
        top_commands,
    })
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

#[tauri::command]
fn update_task_pr_info(state: tauri::State<AppState>, id: String, pr_branch: String, pr_url: Option<String>, remote: Option<String>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::update_task_pr_info(&conn, &id, &pr_branch, pr_url.as_deref(), remote.as_deref()).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn update_task_merge_info(state: tauri::State<AppState>, id: String, is_merged: bool, merge_source_branch: Option<String>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::update_task_merge_info(&conn, &id, is_merged, merge_source_branch.as_deref()).map_err(|e: rusqlite::Error| e.to_string())
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

// ============== AI Commands ==============

#[derive(Debug, Serialize)]
struct GenerateCommitResponse {
    message: String,
    success: bool,
}

/// Generate commit message using Ollama API
#[tauri::command]
async fn generate_commit_message(
    model: String,
    files: Vec<String>,
    _cwd: String,
) -> Result<GenerateCommitResponse, String> {
    let files_list = files.iter().take(30).map(|s| s.as_str()).collect::<Vec<_>>().join("\n");
    let more_count = if files.len() > 30 { files.len() - 30 } else { 0 };
    
    let prompt = format!(r#"Generate a commit message for these changes.

## Commit Message Rules (Conventional Commits)

Format: <type>[scope]: <description>

Types:
- feat: new feature
- fix: bug fix
- docs: documentation
- style: formatting (no logic change)
- refactor: code refactoring
- perf: performance improvement
- test: tests
- chore: minor changes (config, build tools)

Rules:
1. Use scope when relevant: feat(auth):, fix(api):, refactor(ui):
2. Description: explain WHAT changed, be specific
3. Max 72 characters for the first line
4. No generic messages like "update", "fix bug", "changes"

Changed files:
{}
{}

Respond with ONLY the commit message, nothing else. Example: feat(ui): add user profile card component"#, 
        files_list,
        if more_count > 0 { format!("\n... and {} more files", more_count) } else { String::new() }
    );

    let client = reqwest::Client::new();
    
    let request_body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false
    });

    let response = client
        .post("http://localhost:11434/api/generate")
        .header("Content-Type", "application/json")
        .json(&request_body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}. Make sure Ollama is running (ollama serve)", e))?;

    if !response.status().is_success() {
        return Err(format!("Ollama API error: {}", response.status()));
    }

    let response_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let message = response_json["response"]
        .as_str()
        .unwrap_or("")
        .trim()
        .split('\n')
        .next()
        .unwrap_or("")
        .to_string();

    if message.is_empty() {
        return Err("Empty response from AI".to_string());
    }

    Ok(GenerateCommitResponse {
        message,
        success: true,
    })
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
    const CLI_DEFAULT_KEY: &str = "cli-default";
    
    // Reset stop flag
    let stop_flag = Arc::new(AtomicBool::new(false));
    {
        let mut flags = state.should_stop.lock().map_err(|e| e.to_string())?;
        flags.insert(CLI_DEFAULT_KEY.to_string(), Arc::clone(&stop_flag));
    }

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
    let stdout_stop = Arc::clone(&stop_flag);
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
    let stderr_stop = Arc::clone(&stop_flag);
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
    stop_flag.store(true, Ordering::Relaxed);
    
    // Remove from flags
    {
        let mut flags = state.should_stop.lock().map_err(|e| e.to_string())?;
        flags.remove(CLI_DEFAULT_KEY);
    }

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
    const CLI_DEFAULT_KEY: &str = "cli-default";
    
    // Signal stop
    if let Ok(mut flags) = state.should_stop.lock() {
        if let Some(flag) = flags.remove(CLI_DEFAULT_KEY) {
            flag.store(true, Ordering::Relaxed);
        }
    }
    
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
    
    // Ensure task exists before inserting chat message
    // If task doesn't exist, create a placeholder entry
    let task_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE id = ?1",
            [&task_id],
            |row| row.get::<_, i32>(0),
        )
        .unwrap_or(0) > 0;
    
    if !task_exists {
        // Create placeholder task with minimal info
        // This is needed because chat_history has FK constraint to tasks
        conn.execute(
            "INSERT OR IGNORE INTO tasks (id, title, status) VALUES (?1, ?2, ?3)",
            rusqlite::params![&task_id, format!("Task {}", &task_id[..8.min(task_id.len())]), "todo"],
        ).map_err(|e: rusqlite::Error| e.to_string())?;
    }
    
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
    local: Vec<String>,
    remote: Vec<String>,
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
    
    // Get all local branches
    let local_output = Command::new("git")
        .args(&["branch"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to list local branches: {}", e))?;
    
    let local: Vec<String> = String::from_utf8_lossy(&local_output.stdout)
        .lines()
        .map(|line| line.trim().trim_start_matches('*').trim().to_string())
        .filter(|b| !b.is_empty())
        .collect();
    
    // Get all remote branches
    let remote_output = Command::new("git")
        .args(&["branch", "-r"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to list remote branches: {}", e))?;
    
    let remote: Vec<String> = String::from_utf8_lossy(&remote_output.stdout)
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|b| !b.is_empty() && !b.contains("HEAD"))
        .collect();
    
    Ok(GitBranchInfo { current, local, remote })
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
    rtk_stats: Option<RtkStats>,
}

/// Get uncommitted changes (git diff)
#[tauri::command]
fn git_get_diff(cwd: String, state: tauri::State<'_, AppState>) -> Result<GitDiffResult, String> {
    let rtk_path = state.rtk_path.lock()
        .map_err(|e| e.to_string())?
        .clone();
    
    let (diff, _success, stats) = if let Some(ref rtk) = rtk_path {
        run_with_rtk(rtk, "git", &["diff", "--no-color"], &cwd)?
    } else {
        let output = Command::new("git")
            .args(&["diff", "--no-color"])
            .current_dir(&cwd)
            .output()
            .map_err(|e| format!("Failed to get git diff: {}", e))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let combined = if stderr.is_empty() { stdout.clone() } else { format!("{}\n{}", stdout, stderr) };
        (combined, output.status.success(), None)
    };
    
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
        rtk_stats: stats,
    })
}

/// Get staged changes (git diff --cached)
#[tauri::command]
fn git_get_staged_diff(cwd: String, state: tauri::State<'_, AppState>) -> Result<GitDiffResult, String> {
    let rtk_path = state.rtk_path.lock()
        .map_err(|e| e.to_string())?
        .clone();
    
    let (diff, _success, stats) = if let Some(ref rtk) = rtk_path {
        run_with_rtk(rtk, "git", &["diff", "--cached", "--no-color"], &cwd)?
    } else {
        let output = Command::new("git")
            .args(&["diff", "--cached", "--no-color"])
            .current_dir(&cwd)
            .output()
            .map_err(|e| format!("Failed to get staged diff: {}", e))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let combined = if stderr.is_empty() { stdout.clone() } else { format!("{}\n{}", stdout, stderr) };
        (combined, output.status.success(), None)
    };
    
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
        rtk_stats: stats,
    })
}

#[derive(Debug, Serialize)]
struct PRDiffResult {
    diff: String,
    has_changes: bool,
    changed_files: Vec<String>,
    rtk_stats: Option<RtkStats>,
}

fn parse_diff_output(diff: &str) -> (bool, Vec<String>) {
    let has_changes = !diff.trim().is_empty();
    let changed_files: Vec<String> = diff
        .lines()
        .filter(|line| line.starts_with("diff --git"))
        .filter_map(|line| {
            line.trim_start_matches("diff --git ")
                .split_whitespace()
                .next()
                .map(|s| s.to_string())
        })
        .filter(|f| !f.is_empty())
        .collect();
    (has_changes, changed_files)
}

/// Get diff for a PR/MR by comparing branch with its base branch
#[tauri::command]
fn git_get_pr_diff(cwd: String, branch: String, state: tauri::State<'_, AppState>) -> Result<PRDiffResult, String> {
    let rtk_path = state.rtk_path.lock()
        .map_err(|e| e.to_string())?
        .clone();
    
    let remote_output = Command::new("git")
        .args(&["remote"])
        .current_dir(&cwd)
        .output();
    
    let remote_name = if remote_output.is_ok() && remote_output.as_ref().unwrap().status.success() {
        String::from_utf8_lossy(&remote_output.as_ref().unwrap().stdout)
            .trim()
            .split_whitespace()
            .next()
            .unwrap_or("origin")
            .to_string()
    } else {
        "origin".to_string()
    };
    
    let base_branches = ["rdev", "development", "dev", "main", "master"];
    let mut base_branch = "main".to_string();
    
    for bp in &base_branches {
        let check = Command::new("git")
            .args(&["rev-parse", &format!("{}/{}", remote_name, bp)])
            .current_dir(&cwd)
            .output();
        
        if check.is_ok() && check.as_ref().unwrap().status.success() {
            base_branch = bp.to_string();
            break;
        }
    }
    
    let remote_branch = format!("{}/{}", remote_name, branch);
    
    let log_output = Command::new("git")
        .args(&["log", "--oneline", "-1", &format!("{}/{}", remote_name, branch)])
        .current_dir(&cwd)
        .output();
    
    let diff_from;
    
    if log_output.is_ok() && log_output.as_ref().unwrap().status.success() {
        let log_diff = Command::new("git")
            .args(&["log", "-p", &format!("{}..{}", base_branch, branch), "--color=never"])
            .current_dir(&cwd)
            .output();
        
        if log_diff.is_ok() && log_diff.as_ref().unwrap().status.success() {
            let log_diff_output = String::from_utf8_lossy(&log_diff.as_ref().unwrap().stdout).to_string();
            if !log_diff_output.trim().is_empty() {
                diff_from = log_diff_output;
            } else {
                diff_from = get_diff_via_merge_base(&cwd, &base_branch, &remote_branch, &rtk_path)?;
            }
        } else {
            diff_from = get_diff_via_merge_base(&cwd, &base_branch, &remote_branch, &rtk_path)?;
        }
    } else {
        let _ = Command::new("git")
            .args(&["fetch", &remote_name, &branch])
            .current_dir(&cwd)
            .output();
        
        diff_from = get_diff_via_merge_base(&cwd, &base_branch, &remote_branch, &rtk_path)?;
    }
    
    let (has_changes, changed_files) = parse_diff_output(&diff_from);
    
    let stats = if let Some(ref rtk) = rtk_path {
        let input_tokens = estimate_tokens(&diff_from);
        let (rtk_output, _, _) = run_with_rtk(rtk, "echo", &[], &cwd)?;
        let output_tokens = estimate_tokens(&rtk_output);
        let saved_tokens = input_tokens.saturating_sub(output_tokens);
        let savings_pct = if input_tokens > 0 {
            (saved_tokens as f64 / input_tokens as f64) * 100.0
        } else {
            0.0
        };
        Some(RtkStats {
            input_tokens,
            output_tokens,
            savings_pct,
        })
    } else {
        None
    };
    
    Ok(PRDiffResult {
        diff: diff_from,
        has_changes,
        changed_files,
        rtk_stats: stats,
    })
}

fn get_diff_via_merge_base(cwd: &str, base_branch: &str, remote_branch: &str, rtk_path: &Option<PathBuf>) -> Result<String, String> {
    let merge_base_output = Command::new("git")
        .args(&["merge-base", base_branch, remote_branch])
        .current_dir(cwd)
        .output();
    
    let diff_from;
    
    if merge_base_output.is_ok() && merge_base_output.as_ref().unwrap().status.success() {
        let merge_base = String::from_utf8_lossy(&merge_base_output.as_ref().unwrap().stdout)
            .trim()
            .to_string();
        
        if !merge_base.is_empty() {
            if let Some(ref rtk) = rtk_path {
                let (output, _, _) = run_with_rtk(rtk, "git", &["diff", &merge_base, remote_branch, "--color=never"], cwd)?;
                diff_from = output;
            } else {
                let diff_output = Command::new("git")
                    .args(&["diff", &merge_base, remote_branch, "--color=never"])
                    .current_dir(cwd)
                    .output()
                    .map_err(|e| format!("Failed to get diff: {}", e))?;
                diff_from = String::from_utf8_lossy(&diff_output.stdout).to_string();
            }
            return Ok(diff_from);
        }
    }
    
    if let Some(ref rtk) = rtk_path {
        let (output, _, _) = run_with_rtk(rtk, "git", &["diff", base_branch, remote_branch, "--color=never"], cwd)?;
        diff_from = output;
    } else {
        let diff_output = Command::new("git")
            .args(&["diff", base_branch, remote_branch, "--color=never"])
            .current_dir(cwd)
            .output()
            .map_err(|e| format!("Failed to get diff: {}", e))?;
        diff_from = String::from_utf8_lossy(&diff_output.stdout).to_string();
    }
    
    Ok(diff_from)
}

#[derive(Debug, Serialize)]
struct ShellCommandResult {
    success: bool,
    output: String,
    rtk_stats: Option<RtkStats>,
}

/// Run a shell command with the given args
#[tauri::command]
fn run_shell_command(
    command: String, 
    args: Vec<String>, 
    cwd: String, 
    state: tauri::State<'_, AppState>,
    use_rtk: Option<bool>,
) -> Result<ShellCommandResult, String> {
    let rtk_path = state.rtk_path.lock()
        .map_err(|e| e.to_string())?
        .clone();
    
    let use_rtk = use_rtk.unwrap_or(false);
    let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    
    let (output_text, success, stats) = if use_rtk {
        if let Some(ref rtk) = rtk_path {
            match run_with_rtk(rtk, &command, &args_refs, &cwd) {
                Ok((output, success, stats)) => (output, success, stats),
                Err(_e) => {
                    let output = Command::new(&command)
                        .args(&args)
                        .current_dir(&cwd)
                        .output()
                        .map_err(|e| format!("Failed to run command: {}", e))?;
                    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                    let combined = if stderr.is_empty() { stdout.clone() } else { format!("{}\n{}", stdout, stderr) };
                    (combined, output.status.success(), None)
                }
            }
        } else {
            let output = Command::new(&command)
                .args(&args)
                .current_dir(&cwd)
                .output()
                .map_err(|e| format!("Failed to run command: {}", e))?;
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let combined = if stderr.is_empty() { stdout.clone() } else { format!("{}\n{}", stdout, stderr) };
            (combined, output.status.success(), None)
        }
    } else {
        let output = Command::new(&command)
            .args(&args)
            .current_dir(&cwd)
            .output()
            .map_err(|e| format!("Failed to run command: {}", e))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let combined = if stderr.is_empty() { stdout.clone() } else { format!("{}\n{}", stdout, stderr) };
        (combined, output.status.success(), None)
    };
    
    Ok(ShellCommandResult {
        success,
        output: output_text,
        rtk_stats: stats,
    })
}

// ============== CLI Router Commands ==============

#[derive(Debug, Clone, Serialize)]
struct RouterProviderInfo {
    alias: String,
    binary_path: String,
    model: String,
    args: Vec<String>,
    enabled: bool,
    status: String,
    current_task_id: Option<String>,
}

impl From<ProviderInfo> for RouterProviderInfo {
    fn from(p: ProviderInfo) -> Self {
        let status = match p.status {
            ProviderStatus::Idle => "idle",
            ProviderStatus::Running => "running",
            ProviderStatus::Error => "error",
            ProviderStatus::TokenLimitReached => "token_limit_reached",
        };
        RouterProviderInfo {
            alias: p.alias,
            binary_path: p.binary_path,
            model: p.model,
            args: p.args,
            enabled: p.enabled,
            status: status.to_string(),
            current_task_id: p.current_task_id,
        }
    }
}

#[tauri::command]
fn get_router_providers(state: tauri::State<'_, AppState>) -> Result<Vec<RouterProviderInfo>, String> {
    let router = &state.cli_router;
    let providers = router.get_enabled_providers();
    Ok(providers.into_iter().map(RouterProviderInfo::from).collect())
}

#[tauri::command]
fn sync_engines_to_router(state: tauri::State<'_, AppState>) -> Result<Vec<RouterProviderInfo>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
        let engines = cli_router::queries::get_enabled_engines(&conn).map_err(|e: rusqlite::Error| e.to_string())?;
    
    let router = &state.cli_router;
    
    for engine in &engines {
        let provider = ProviderInfo {
            alias: engine.alias.clone(),
            binary_path: engine.binary_path.clone(),
            model: engine.model.clone(),
            args: engine.args.split_whitespace().map(|s| s.to_string()).collect(),
            enabled: engine.enabled,
            status: ProviderStatus::Idle,
            current_task_id: None,
        };
        router.add_provider(provider);
    }
    
    Ok(router.get_enabled_providers().into_iter().map(RouterProviderInfo::from).collect())
}

#[derive(Debug, Serialize)]
struct RouterConfigInfo {
    auto_switch_enabled: bool,
    confirm_before_switch: bool,
    token_limit_threshold: usize,
    fallback_order: Vec<String>,
    budget_limit: f64,
    budget_alert_threshold: f64,
}

#[tauri::command]
fn get_router_config(state: tauri::State<'_, AppState>) -> Result<RouterConfigInfo, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    match cli_router::queries::get_router_config(&conn) {
        Ok(Some(config)) => Ok(RouterConfigInfo {
            auto_switch_enabled: config.auto_switch_enabled,
            confirm_before_switch: config.confirm_before_switch,
            token_limit_threshold: config.token_limit_threshold as usize,
            fallback_order: config.fallback_order.split(',').map(|s| s.trim().to_string()).collect(),
            budget_limit: config.budget_limit,
            budget_alert_threshold: config.budget_alert_threshold,
        }),
        Ok(None) => {
            let default_config = state.cli_router.get_config();
            Ok(RouterConfigInfo {
                auto_switch_enabled: default_config.auto_switch_enabled,
                confirm_before_switch: default_config.confirm_before_switch,
                token_limit_threshold: default_config.token_limit_threshold,
                fallback_order: default_config.fallback_order.clone(),
                budget_limit: default_config.budget_limit,
                budget_alert_threshold: default_config.budget_alert_threshold,
            })
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_router_config_cmd(
    state: tauri::State<'_, AppState>,
    auto_switch_enabled: bool,
    confirm_before_switch: bool,
    token_limit_threshold: i64,
    fallback_order: String,
    budget_limit: f64,
    budget_alert_threshold: f64,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    cli_router::queries::save_router_config(
        &conn,
        auto_switch_enabled,
        confirm_before_switch,
        token_limit_threshold,
        &fallback_order,
        budget_limit,
        budget_alert_threshold,
    ).map_err(|e: rusqlite::Error| e.to_string())?;
    
    state.cli_router.update_config(RouterConfig {
        auto_switch_enabled,
        confirm_before_switch,
        token_limit_threshold: token_limit_threshold as usize,
        fallback_order: fallback_order.split(',').map(|s| s.to_string()).collect(),
        budget_limit,
        budget_alert_threshold,
    });
    
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
struct SessionInfo {
    id: String,
    task_id: String,
    provider_alias: String,
    created_at: String,
    updated_at: String,
}

impl From<RouterSession> for SessionInfo {
    fn from(s: RouterSession) -> Self {
        SessionInfo {
            id: s.id,
            task_id: s.task_id,
            provider_alias: s.provider_alias,
            created_at: s.created_at,
            updated_at: s.updated_at,
        }
    }
}

#[tauri::command]
fn create_router_session(
    state: tauri::State<'_, AppState>,
    task_id: String,
    provider_alias: String,
) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    let session_id = cli_router::queries::create_session(&conn, &task_id, &provider_alias)
        .map_err(|e: rusqlite::Error| e.to_string())?;
    
    state.cli_router.create_session(&task_id, &provider_alias);
    
    Ok(session_id)
}

#[tauri::command]
fn get_router_session(state: tauri::State<'_, AppState>, session_id: String) -> Result<Option<SessionInfo>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    cli_router::queries::get_session(&conn, &session_id)
        .map(|s| s.map(SessionInfo::from))
        .map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn get_task_router_sessions(
    state: tauri::State<'_, AppState>,
    task_id: String,
) -> Result<Vec<SessionInfo>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    cli_router::queries::get_task_sessions(&conn, &task_id)
        .map(|sessions| sessions.into_iter().map(SessionInfo::from).collect())
        .map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn switch_provider_in_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
    new_provider_alias: String,
    reason: String,
) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    let session = cli_router::queries::get_session(&conn, &session_id)
        .map_err(|e: rusqlite::Error| e.to_string())?
        .ok_or("Session not found")?;
    
    let old_provider = session.provider_alias.clone();
    
    let old_messages = cli_router::queries::get_session_messages(&conn, &session_id)
        .map_err(|e: rusqlite::Error| e.to_string())?;
    
    let context_summary = if !old_messages.is_empty() {
        let mut summary = format!(
            "## Context from {} (previous provider)\n\n",
            old_provider
        );
        
        for msg in old_messages.iter().take(20) {
            let role_display = if msg.role == "assistant" { "AI" } else { "User" };
            let content_preview = if msg.content.len() > 200 {
                format!("{}...", &msg.content[..200])
            } else {
                msg.content.clone()
            };
            summary.push_str(&format!("**{}**: {}\n\n", role_display, content_preview));
        }
        
        if old_messages.len() > 20 {
            summary.push_str(&format!("_({} more messages omitted)_", old_messages.len() - 20));
        }
        
        summary
    } else {
        format!(
            "Switching from {} to {}. No previous context.",
            old_provider,
            new_provider_alias
        )
    };
    
    cli_router::queries::update_session_provider(&conn, &session_id, &new_provider_alias)
        .map_err(|e: rusqlite::Error| e.to_string())?;
    
    cli_router::queries::add_context_message(
        &conn,
        &session_id,
        "system",
        &format!(
            "[Provider Switch] {} → {} | Reason: {}",
            old_provider,
            new_provider_alias,
            reason
        ),
        None,
    ).map_err(|e: rusqlite::Error| e.to_string())?;
    
    cli_router::queries::record_provider_switch(
        &conn,
        &session.task_id,
        &old_provider,
        &new_provider_alias,
        &reason,
    ).map_err(|e: rusqlite::Error| e.to_string())?;
    
    Ok(context_summary)
}

#[derive(Debug, Clone, Serialize)]
struct RouterContextMessage {
    id: i64,
    role: String,
    content: String,
    token_count: Option<i64>,
    timestamp: String,
}

impl From<DbContextMessage> for RouterContextMessage {
    fn from(m: DbContextMessage) -> Self {
        RouterContextMessage {
            id: m.id,
            role: m.role,
            content: m.content,
            token_count: m.token_count,
            timestamp: m.created_at,
        }
    }
}

#[tauri::command]
fn add_router_message(
    state: tauri::State<'_, AppState>,
    session_id: String,
    role: String,
    content: String,
    token_count: Option<i64>,
) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    cli_router::queries::add_context_message(&conn, &session_id, &role, &content, token_count)
        .map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn get_router_messages(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<Vec<RouterContextMessage>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    cli_router::queries::get_session_messages(&conn, &session_id)
        .map(|msgs| msgs.into_iter().map(RouterContextMessage::from).collect())
        .map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn transfer_router_context(
    state: tauri::State<'_, AppState>,
    from_session_id: String,
    to_provider_alias: String,
) -> Result<String, String> {
    state.cli_router.transfer_context(&from_session_id, &to_provider_alias)
}

#[tauri::command]
fn get_next_available_provider(
    state: tauri::State<'_, AppState>,
    current_provider_alias: String,
) -> Result<Option<RouterProviderInfo>, String> {
    match state.cli_router.find_next_provider(&current_provider_alias) {
        Some(provider) => Ok(Some(RouterProviderInfo::from(provider))),
        None => Ok(None),
    }
}

#[derive(Debug, Clone, Serialize)]
struct ProviderCostInfo {
    provider_alias: String,
    total_requests: i64,
    total_input_tokens: i64,
    total_output_tokens: i64,
    total_cost: f64,
    last_used: Option<String>,
}

impl From<ProviderCostSummary> for ProviderCostInfo {
    fn from(s: ProviderCostSummary) -> Self {
        ProviderCostInfo {
            provider_alias: s.provider_alias,
            total_requests: s.total_requests,
            total_input_tokens: s.total_input_tokens,
            total_output_tokens: s.total_output_tokens,
            total_cost: s.total_cost,
            last_used: s.last_used,
        }
    }
}

#[tauri::command]
fn record_cli_cost(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
    provider_alias: String,
    input_tokens: i64,
    output_tokens: i64,
    cost: f64,
    session_id: Option<String>,
    task_id: Option<String>,
    model: Option<String>,
) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    let id = cli_router::queries::record_cost(
        &conn,
        &provider_alias,
        input_tokens,
        output_tokens,
        cost,
        session_id.as_deref(),
        task_id.as_deref(),
        model.as_deref(),
    ).map_err(|e: rusqlite::Error| e.to_string())?;

    if cost > 0.0 {
        if let Ok(Some(config)) = cli_router::queries::get_router_config(&conn) {
            if config.budget_limit > 0.0 {
                let total_cost = cli_router::queries::get_total_cost(&conn).unwrap_or(0.0);
                let threshold = config.budget_limit * config.budget_alert_threshold;
                if total_cost >= threshold && total_cost - cost < threshold {
                    let _ = app_handle.emit("budget-alert", serde_json::json!({
                        "total_cost": total_cost,
                        "budget_limit": config.budget_limit,
                        "threshold": threshold,
                        "alert_threshold_pct": config.budget_alert_threshold,
                    }));
                }
            }
        }
    }

    Ok(id)
}

#[tauri::command]
fn get_provider_costs(state: tauri::State<'_, AppState>) -> Result<Vec<ProviderCostInfo>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    cli_router::queries::get_all_provider_costs(&conn)
        .map(|costs| costs.into_iter().map(ProviderCostInfo::from).collect())
        .map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn get_task_switch_history(
    state: tauri::State<'_, AppState>,
    task_id: String,
) -> Result<Vec<SwitchHistory>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    cli_router::queries::get_task_switch_history(&conn, &task_id)
        .map_err(|e: rusqlite::Error| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RunAgentRequest {
    task_id: String,
    provider_alias: String,
    prompt: String,
    cwd: String,
    session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct RunAgentResponse {
    session_id: String,
    provider_alias: String,
    output: String,
    switched: bool,
    new_provider: Option<String>,
}

#[tauri::command]
async fn run_agent(
    state: tauri::State<'_, AppState>,
    request: RunAgentRequest,
    app: tauri::AppHandle,
) -> Result<RunAgentResponse, String> {
    let _provider = state.cli_router.get_provider(&request.provider_alias)
        .ok_or(format!("Provider '{}' not found", request.provider_alias))?;
    
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    let session_id = if let Some(sid) = request.session_id {
        sid
    } else {
        cli_router::queries::create_session(&conn, &request.task_id, &request.provider_alias)
            .map_err(|e: rusqlite::Error| e.to_string())?
    };
    
    state.cli_router.update_provider_status(&request.provider_alias, ProviderStatus::Running);
    state.cli_router.update_provider_task(&request.provider_alias, Some(request.task_id.clone()));
    
    let backend = {
        let engines = cli_router::queries::get_enabled_engines(&conn).map_err(|e: rusqlite::Error| e.to_string())?;
        engines.iter()
            .find(|e| e.alias == request.provider_alias)
            .map(|e| create_backend_from_engine(e))
    };
    
    let backend_arc = Arc::new(backend);
    
    let mut switched = false;
    let mut new_provider: Option<String> = None;
    let mut full_output;
    let mut token_count;
    
    let app_clone = app.clone();
    let session_id_clone = session_id.clone();
    
    let app_for_thread = app.clone();
    let session_for_thread = session_id.clone();
    let backend_for_thread = Arc::clone(&backend_arc);
    
    let output_callback = move |line: String, is_error: bool| {
        let _ = app_clone.emit("agent-output", serde_json::json!({
            "session_id": session_id_clone,
            "line": line,
            "is_error": is_error,
        }));
    };
    
    let token_counter: Arc<Mutex<usize>> = Arc::new(Mutex::new(0));
    let token_counter_clone = Arc::clone(&token_counter);
    let _token_counter_clone2 = Arc::clone(&token_counter);
    
    let output_buffer: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let output_buffer_clone = Arc::clone(&output_buffer);
    let _output_buffer_clone2 = Arc::clone(&output_buffer);
    
    let token_limit_hit: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
    let token_limit_hit_clone = Arc::clone(&token_limit_hit);
    
    if backend_arc.is_some() {
        let provider_info = state.cli_router.get_provider(&request.provider_alias).unwrap();
        let mut cmd = std::process::Command::new(provider_info.binary_path);
        for arg in &provider_info.args {
            cmd.arg(arg);
        }
        cmd.arg(&request.prompt);
        cmd.current_dir(&request.cwd);
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        
        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn process: {}", e))?;
        
        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
        
        let stop_flag = Arc::new(AtomicBool::new(false));
        
        {
            let mut flags = state.should_stop.lock().map_err(|e| e.to_string())?;
            flags.insert(request.task_id.clone(), Arc::clone(&stop_flag));
        }
        
        let stop_clone = Arc::clone(&stop_flag);
        let stop_clone2 = Arc::clone(&stop_flag);
        
        let output_callback_clone = output_callback.clone();
        
        let stdout_handle = std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            let mut token_limit_reached = false;
            
            for line in reader.lines() {
                if stop_clone.load(Ordering::Relaxed) {
                    break;
                }
                if let Ok(line) = line {
                    if let Ok(mut count) = token_counter_clone.lock() {
                        *count += line.len() / 4;
                    }
                    if let Ok(mut buf) = output_buffer_clone.lock() {
                        buf.push_str(&line);
                        buf.push('\n');
                    }
                    
                    if !token_limit_reached && backend_for_thread.is_some() {
                        if let Some(backend_ref) = backend_for_thread.as_ref().as_ref() {
                            if backend_ref.detect_token_limit(&line) {
                                token_limit_reached = true;
                                token_limit_hit_clone.store(true, Ordering::Relaxed);
                                let _ = app_for_thread.emit("agent-token-limit", serde_json::json!({
                                    "session_id": session_for_thread,
                                    "line": line,
                                }));
                            }
                        }
                    }
                    
                    output_callback_clone(line, false);
                }
            }
        });
        
        let stderr_handle = std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if stop_clone2.load(Ordering::Relaxed) {
                    break;
                }
                if let Ok(line) = line {
                    output_callback(line, true);
                }
            }
        });
        
        let status = child.wait().map_err(|e| format!("Failed to wait for process: {}", e))?;
        
        stop_flag.store(true, Ordering::Relaxed);
        
        let _ = stdout_handle.join();
        let _ = stderr_handle.join();
        
        full_output = output_buffer.lock().map(|b| b.clone()).unwrap_or_default();
        token_count = *token_counter.lock().unwrap();
        
        if !status.success() {
            state.cli_router.update_provider_status(&request.provider_alias, ProviderStatus::Error);
        } else {
            state.cli_router.update_provider_status(&request.provider_alias, ProviderStatus::Idle);
        }
        
        if token_limit_hit.load(Ordering::Relaxed) || state.cli_router.should_auto_switch(&request.provider_alias, token_count) {
            if let Some(next_provider) = state.cli_router.find_next_provider(&request.provider_alias) {
                switched = true;
                new_provider = Some(next_provider.alias.clone());
                
                let switch_reason = if token_limit_hit.load(Ordering::Relaxed) {
                    "Token limit detected"
                } else {
                    "Token threshold reached"
                };
                
                let _ = cli_router::queries::record_provider_switch(
                    &conn,
                    &request.task_id,
                    &request.provider_alias,
                    &next_provider.alias,
                    switch_reason,
                );
            }
        }
    } else {
        return Err(format!("Provider '{}' not configured properly", request.provider_alias));
    }
    
    state.cli_router.update_provider_task(&request.provider_alias, None);
    
    cli_router::queries::add_context_message(
        &conn,
        &session_id,
        "user",
        &request.prompt,
        None,
    ).map_err(|e: rusqlite::Error| e.to_string())?;
    
    cli_router::queries::add_context_message(
        &conn,
        &session_id,
        "assistant",
        &full_output,
        Some(token_count as i64),
    ).map_err(|e: rusqlite::Error| e.to_string())?;
    
    let input_tokens = request.prompt.len() / 4;
    let output_tokens = full_output.len() / 4;
    
    if let Some(engine) = cli_router::queries::get_enabled_engines(&conn)
        .ok()
        .and_then(|engines| engines.into_iter().find(|e| e.alias == request.provider_alias))
    {
        let backend = create_backend_from_engine(&engine);
        let cost = backend.estimate_cost(input_tokens, output_tokens);
        
        let _ = cli_router::queries::record_cost(
            &conn,
            &request.provider_alias,
            input_tokens as i64,
            output_tokens as i64,
            cost,
            Some(&session_id),
            Some(&request.task_id),
            Some(&engine.model),
        );
    }
    
    app.emit("agent-complete", serde_json::json!({
        "session_id": session_id,
        "success": !switched,
        "switched": switched,
        "new_provider": new_provider,
    })).map_err(|e| e.to_string())?;
    
    Ok(RunAgentResponse {
        session_id,
        provider_alias: request.provider_alias,
        output: full_output,
        switched,
        new_provider,
    })
}

#[tauri::command]
fn stop_agent(state: tauri::State<'_, AppState>, task_id: String) -> Result<(), String> {
    if let Ok(mut flags) = state.should_stop.lock() {
        if let Some(flag) = flags.remove(&task_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }
    state.cli_router.process_manager().stop(&task_id)?;
    Ok(())
}

#[tauri::command]
fn get_agent_status(state: tauri::State<'_, AppState>, task_id: String) -> bool {
    if let Ok(flags) = state.should_stop.lock() {
        if let Some(flag) = flags.get(&task_id) {
            return flag.load(Ordering::Relaxed);
        }
    }
    state.cli_router.process_manager().is_running(&task_id)
}

#[tauri::command]
fn spawn_pty_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
    binary: String,
    args: Vec<String>,
    cwd: String,
) -> Result<(), String> {
    state.pty_manager.spawn(&session_id, &binary, &args, &cwd)
}

#[tauri::command]
fn pty_write(
    state: tauri::State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    state.pty_manager.write(&session_id, &data)
}

#[tauri::command]
fn pty_resize(
    state: tauri::State<'_, AppState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    state.pty_manager.resize(&session_id, rows, cols)
}

#[tauri::command]
fn pty_read(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<String, String> {
    state.pty_manager.read_output(&session_id)
}

#[tauri::command]
fn pty_kill(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    state.pty_manager.kill(&session_id)
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
            
            match db::seed_default_engines(&conn) {
                Ok(_) => println!("✅ Default engines seeded successfully"),
                Err(e) => eprintln!("⚠️ Failed to seed default engines: {}", e),
            }
            
            let cli_router = Arc::new(CliRouter::new());
            
            if let Ok(engines) = cli_router::queries::get_enabled_engines(&conn) {
                for engine in &engines {
                    let provider = ProviderInfo {
                        alias: engine.alias.clone(),
                        binary_path: engine.binary_path.clone(),
                        model: engine.model.clone(),
                        args: engine.args.split_whitespace().map(|s| s.to_string()).collect(),
                        enabled: engine.enabled,
                        status: ProviderStatus::Idle,
                        current_task_id: None,
                    };
                    cli_router.add_provider(provider);
                }
                println!("✅ Synced {} engines to router", engines.len());
            }
            
            app.manage(AppState { 
                db: Mutex::new(conn),
                running_process: Mutex::new(None),
                should_stop: Mutex::new(HashMap::new()),
                rtk_path: Mutex::new(get_rtk_path()),
                cli_router,
                pty_manager: Arc::new(PtyManager::new()),
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
            update_task_pr_info,
            update_task_merge_info,
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
            git_get_pr_diff,
            run_shell_command,
            generate_commit_message,
            check_rtk_status,
            install_rtk,
            init_rtk,
            run_rtk_command,
            get_rtk_gain_stats,
            get_router_providers,
            sync_engines_to_router,
            get_router_config,
            save_router_config_cmd,
            create_router_session,
            get_router_session,
            get_task_router_sessions,
            switch_provider_in_session,
            add_router_message,
            get_router_messages,
            transfer_router_context,
            get_next_available_provider,
            record_cli_cost,
            get_provider_costs,
            get_task_switch_history,
            run_agent,
            stop_agent,
            get_agent_status,
            spawn_pty_session,
            pty_write,
            pty_resize,
            pty_read,
            pty_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
