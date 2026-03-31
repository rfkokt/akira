use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitBranchesResult {
    pub current: String,
    pub local: Vec<String>,
    pub remote: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitDiffResult {
    pub diff: String,
    pub has_changes: bool,
    pub changed_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitCommitMessage {
    pub message: String,
}

#[tauri::command]
pub fn git_get_branches(cwd: String) -> Result<GitBranchesResult, String> {
    let output = Command::new("git")
        .args(["branch", "-a"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to run git branch: {}", e))?;

    if !output.status.success() {
        return Err("Failed to get git branches".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut current = String::new();
    let mut local = Vec::new();
    let mut remote = Vec::new();

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let is_current = trimmed.starts_with('*');
        let name = if is_current {
            trimmed.trim_start_matches('*').trim().to_string()
        } else {
            trimmed.to_string()
        };

        if is_current {
            current = name.clone();
        }

        // Check if it's a remote branch
        if name.starts_with("remotes/") {
            // Extract just the branch name after "remotes/origin/"
            let branch_name = name
                .trim_start_matches("remotes/")
                .split('/')
                .skip(1)
                .collect::<Vec<_>>()
                .join("/");
            if !branch_name.is_empty() && !remote.contains(&branch_name) {
                remote.push(branch_name);
            }
        } else {
            local.push(name);
        }
    }

    Ok(GitBranchesResult {
        current,
        local,
        remote,
    })
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
        .args(["diff", "--name-only"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get git diff: {}", e))?;

    let files_str = String::from_utf8_lossy(&output.stdout);
    let changed_files: Vec<String> = files_str
        .lines()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let has_changes = !changed_files.is_empty();

    // Get full diff
    let diff_output = Command::new("git")
        .args(["diff"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get git diff: {}", e))?;
    let diff = String::from_utf8_lossy(&diff_output.stdout).to_string();

    Ok(GitDiffResult {
        diff,
        has_changes,
        changed_files,
    })
}

#[tauri::command]
pub fn git_get_staged_diff(cwd: String) -> Result<GitDiffResult, String> {
    // Get changed files
    let output = Command::new("git")
        .args(["diff", "--staged", "--name-only"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get staged diff: {}", e))?;

    let files_str = String::from_utf8_lossy(&output.stdout);
    let changed_files: Vec<String> = files_str
        .lines()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let has_changes = !changed_files.is_empty();

    // Get full diff
    let diff_output = Command::new("git")
        .args(["diff", "--staged"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get staged diff: {}", e))?;
    let diff = String::from_utf8_lossy(&diff_output.stdout).to_string();

    Ok(GitDiffResult {
        diff,
        has_changes,
        changed_files,
    })
}

#[tauri::command]
pub fn git_get_pr_diff(cwd: String, base: String, head: String) -> Result<GitDiffResult, String> {
    // Get changed files
    let output = Command::new("git")
        .args(["diff", "--name-only", &format!("{}...{}", base, head)])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get PR diff: {}", e))?;

    let files_str = String::from_utf8_lossy(&output.stdout);
    let changed_files: Vec<String> = files_str
        .lines()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let has_changes = !changed_files.is_empty();

    // Get full diff
    let diff_output = Command::new("git")
        .args(["diff", &format!("{}...{}", base, head)])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get PR diff: {}", e))?;
    let diff = String::from_utf8_lossy(&diff_output.stdout).to_string();

    Ok(GitDiffResult {
        diff,
        has_changes,
        changed_files,
    })
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
