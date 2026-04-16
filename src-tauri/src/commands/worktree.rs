use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

#[derive(Debug, Clone, Serialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub base_branch: String,
}

/// Get the app data directory
#[tauri::command]
pub fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_local_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}

/// Get the default base branch from origin (main, master, rdev, develop)
#[tauri::command]
pub fn get_default_base_branch(repo_path: String) -> Result<String, String> {
    // First check origin/HEAD
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "origin/HEAD"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to get origin/HEAD: {}", e))?;

    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
        // origin/HEAD usually returns "origin/main" or "origin/master"
        if branch.starts_with("origin/") {
            return Ok(branch.replace("origin/", ""));
        }
    }

    // Check common branch names in order of preference
    let common_branches = ["rdev", "develop", "dev", "main", "master"];

    for branch in &common_branches {
        let output = Command::new("git")
            .args(["ls-remote", "--heads", "origin", branch])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| format!("Failed to check remote branches: {}", e))?;

        if !output.stdout.is_empty() {
            return Ok(branch.to_string());
        }
    }

    // Fallback to current branch
    let output = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to get current branch: {}", e))?;

    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !branch.is_empty() {
            return Ok(branch);
        }
    }

    Err("Could not determine base branch".to_string())
}

/// Get available base branches from remote
#[tauri::command]
pub fn get_available_base_branches(repo_path: String) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .args(["branch", "-r", "--list", "origin/*"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to list remote branches: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to list branches: {}", stderr));
    }

    let branches: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.starts_with("origin/") && !line.starts_with("origin/HEAD") {
                Some(line.replace("origin/", ""))
            } else {
                None
            }
        })
        .collect();

    Ok(branches)
}

/// Create a git worktree for a task
#[tauri::command]
pub fn create_task_worktree(
    repo_path: String,
    task_id: String,
    base_branch: String,
    app_data_dir: String,
) -> Result<WorktreeInfo, String> {
    // Create worktree directory
    let worktree_path = PathBuf::from(&app_data_dir)
        .join("worktrees")
        .join(&task_id);

    // Ensure parent directory exists
    std::fs::create_dir_all(&worktree_path)
        .map_err(|e| format!("Failed to create worktree directory: {}", e))?;

    let task_branch = format!("akira/{}", task_id);

    // First, fetch the base branch from origin
    let fetch_output = Command::new("git")
        .args(["fetch", "origin", &base_branch])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to fetch base branch: {}", e))?;

    if !fetch_output.status.success() {
        let stderr = String::from_utf8_lossy(&fetch_output.stderr);
        return Err(format!("Failed to fetch base branch: {}", stderr));
    }

    // Create worktree from base branch
    let output = Command::new("git")
        .args([
            "worktree",
            "add",
            "-b",
            &task_branch,
            worktree_path.to_str().unwrap(),
            &format!("origin/{}", base_branch),
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to create worktree: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);

        // If branch already exists, try to use it
        if stderr.contains("already exists") {
            // Try to create worktree with existing branch
            let output = Command::new("git")
                .args([
                    "worktree",
                    "add",
                    worktree_path.to_str().unwrap(),
                    &task_branch,
                ])
                .current_dir(&repo_path)
                .output()
                .map_err(|e| format!("Failed to add existing worktree: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!(
                    "Failed to create worktree with existing branch: {}",
                    stderr
                ));
            }
        } else {
            return Err(format!("Failed to create worktree: {}", stderr));
        }
    }

    // Configure git user if not set (for commits)
    let _ = Command::new("git")
        .args(["config", "user.email", "akira@localhost"])
        .current_dir(&worktree_path)
        .output();

    let _ = Command::new("git")
        .args(["config", "user.name", "Akira AI"])
        .current_dir(&worktree_path)
        .output();

    Ok(WorktreeInfo {
        path: worktree_path.to_string_lossy().to_string(),
        branch: task_branch,
        base_branch,
    })
}

/// Remove a git worktree
#[tauri::command]
pub fn remove_task_worktree(
    repo_path: String,
    task_id: String,
    app_data_dir: String,
) -> Result<(), String> {
    let worktree_path = PathBuf::from(&app_data_dir)
        .join("worktrees")
        .join(&task_id);

    // Remove worktree
    let output = Command::new("git")
        .args([
            "worktree",
            "remove",
            "--force",
            worktree_path.to_str().unwrap(),
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to remove worktree: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Don't fail if worktree doesn't exist
        if !stderr.contains("not a valid path") && !stderr.contains("is not a working tree") {
            return Err(format!("Failed to remove worktree: {}", stderr));
        }
    }

    // Prune worktree list
    let _ = Command::new("git")
        .args(["worktree", "prune"])
        .current_dir(&repo_path)
        .output();

    // Remove task branch
    let task_branch = format!("akira/{}", task_id);
    let _ = Command::new("git")
        .args(["branch", "-D", &task_branch])
        .current_dir(&repo_path)
        .output();

    // Clean up directory
    let _ = std::fs::remove_dir_all(&worktree_path);

    Ok(())
}

/// Get diff between worktree and base branch
#[tauri::command]
pub fn get_worktree_diff(worktree_path: String, base_branch: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["diff", &format!("origin/{}", base_branch), "HEAD"])
        .current_dir(&worktree_path)
        .output()
        .map_err(|e| format!("Failed to get diff: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to get diff: {}", stderr))
    }
}

/// Check if worktree exists
#[tauri::command]
pub fn worktree_exists(task_id: String, app_data_dir: String) -> Result<bool, String> {
    let worktree_path = PathBuf::from(&app_data_dir)
        .join("worktrees")
        .join(&task_id);

    Ok(worktree_path.exists())
}
