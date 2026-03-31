use crate::state::AppState;
use serde::Serialize;
use std::process::Command;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitDiffResult {
    pub diff: String,
    pub has_changes: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitCommitMessage {
    pub message: String,
}

#[tauri::command]
pub fn git_get_branches(cwd: String) -> Result<Vec<GitBranch>, String> {
    let output = Command::new("git")
        .args(["branch", "-a"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to run git branch: {}", e))?;

    if !output.status.success() {
        return Err("Failed to get git branches".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let branches: Vec<GitBranch> = stdout
        .lines()
        .map(|line| {
            let trimmed = line.trim();
            let is_current = trimmed.starts_with('*');
            let name = if is_current {
                trimmed.trim_start_matches('*').trim().to_string()
            } else {
                trimmed.to_string()
            };
            GitBranch { name, is_current }
        })
        .collect();

    Ok(branches)
}

#[tauri::command]
pub fn git_checkout_branch(cwd: String, branch: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(["checkout", &branch])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to checkout branch: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to checkout branch: {}", stderr))
    }
}

#[tauri::command]
pub fn git_create_branch(cwd: String, branch: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(["checkout", "-b", &branch])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to create branch: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to create branch: {}", stderr))
    }
}

#[tauri::command]
pub fn git_get_diff(cwd: String) -> Result<GitDiffResult, String> {
    let output = Command::new("git")
        .args(["diff"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get git diff: {}", e))?;

    let diff = String::from_utf8_lossy(&output.stdout).to_string();
    let has_changes = !diff.is_empty();

    Ok(GitDiffResult { diff, has_changes })
}

#[tauri::command]
pub fn git_get_staged_diff(cwd: String) -> Result<GitDiffResult, String> {
    let output = Command::new("git")
        .args(["diff", "--staged"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get staged diff: {}", e))?;

    let diff = String::from_utf8_lossy(&output.stdout).to_string();
    let has_changes = !diff.is_empty();

    Ok(GitDiffResult { diff, has_changes })
}

#[tauri::command]
pub fn git_get_pr_diff(cwd: String, base: String, head: String) -> Result<GitDiffResult, String> {
    let output = Command::new("git")
        .args(["diff", &format!("{}...{}", base, head)])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get PR diff: {}", e))?;

    let diff = String::from_utf8_lossy(&output.stdout).to_string();
    let has_changes = !diff.is_empty();

    Ok(GitDiffResult { diff, has_changes })
}

#[tauri::command]
pub fn git_commit(cwd: String, message: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(["commit", "-m", &message])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to commit: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to commit: {}", stderr))
    }
}

#[tauri::command]
pub fn git_push(cwd: String, remote: Option<String>, branch: Option<String>) -> Result<(), String> {
    let mut args: Vec<String> = vec!["push".to_string()];
    if let Some(r) = remote {
        args.push(r);
    }
    if let Some(b) = branch {
        args.push(b);
    }

    let output = Command::new("git")
        .args(&args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to push: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to push: {}", stderr))
    }
}
