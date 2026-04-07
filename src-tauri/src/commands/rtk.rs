#![allow(dead_code)]

use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use tauri::State;

const RTK_VERSION: &str = "0.34.1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RtkStats {
    pub input_tokens: usize,
    pub output_tokens: usize,
    pub savings_pct: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RtkInstallResult {
    pub installed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RtkInitResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RtkCommandStats {
    pub cmd: String,
    pub count: i64,
    pub avg_savings: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RtkGainStats {
    pub total_commands: i64,
    pub total_saved: i64,
    pub avg_savings: f64,
    pub top_commands: Vec<RtkCommandStats>,
}

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

// Estimate tokens (rough approximation: 4 chars per token)
fn estimate_tokens(text: &str) -> usize {
    (text.len() as f64 / 4.0).ceil() as usize
}

#[tauri::command]
pub fn check_rtk_status() -> RtkInstallResult {
    if let Some(path) = get_rtk_path() {
        let output = Command::new(&path).args(["--version"]).output();

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
pub fn install_rtk() -> RtkInstallResult {
    // Installation logic would go here - simplified for now
    check_rtk_status()
}

#[tauri::command]
pub fn init_rtk() -> Result<RtkInitResult, String> {
    let rtk_path =
        get_rtk_path().ok_or_else(|| "RTK not installed. Call install_rtk first.".to_string())?;

    let output = Command::new(&rtk_path)
        .args(["init", "-g"])
        .output()
        .map_err(|e| format!("Failed to run rtk init: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(RtkInitResult {
            success: true,
            message: if stdout.is_empty() {
                "RTK initialized successfully!".to_string()
            } else {
                stdout
            },
        })
    } else {
        Ok(RtkInitResult {
            success: false,
            message: if stderr.is_empty() {
                "RTK init failed".to_string()
            } else {
                stderr
            },
        })
    }
}

#[tauri::command]
pub fn run_rtk_command(command: String, args: Vec<String>, cwd: String) -> Result<String, String> {
    let rtk_path = get_rtk_path().ok_or_else(|| "RTK not installed".to_string())?;

    let mut cmd_args = vec![command];
    cmd_args.extend(args);

    let output = Command::new(&rtk_path)
        .args(&cmd_args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to run RTK command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(if stderr.is_empty() {
            "RTK command failed".to_string()
        } else {
            stderr
        })
    }
}

#[tauri::command]
pub fn get_rtk_gain_stats(state: State<AppState>, days: i64) -> Result<RtkGainStats, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let (total_commands, total_saved, avg_savings): (i64, i64, f64) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(saved_tokens), 0), COALESCE(AVG(savings_pct), 0) FROM rtk_history WHERE timestamp > datetime('now', ?1)",
        [format!("-{} days", days)],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).unwrap_or((0, 0, 0.0));

    let mut stmt = conn.prepare(
        "SELECT original_cmd, COUNT(*) as cnt, AVG(savings_pct) as avg_sav FROM rtk_history WHERE timestamp > datetime('now', ?1) GROUP BY original_cmd ORDER BY cnt DESC LIMIT 10"
    ).map_err(|e| e.to_string())?;

    let top_commands: Vec<RtkCommandStats> = stmt
        .query_map([format!("-{} days", days)], |row| {
            Ok(RtkCommandStats {
                cmd: row.get(0)?,
                count: row.get(1)?,
                avg_savings: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(RtkGainStats {
        total_commands,
        total_saved,
        avg_savings,
        top_commands,
    })
}
