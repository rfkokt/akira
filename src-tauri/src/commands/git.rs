use serde::Serialize;
use std::process::Command;

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

#[derive(Debug, Clone, Serialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,
    pub is_staged: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitStatusResult {
    pub staged: Vec<GitFileStatus>,
    pub unstaged: Vec<GitFileStatus>,
}

#[tauri::command]
pub fn git_status(cwd: String) -> Result<GitStatusResult, String> {
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    if !output.status.success() {
        return Err("Failed to get git status".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();

    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let mut chars = line.chars();
        let x = chars.next().unwrap_or(' ');
        let y = chars.next().unwrap_or(' ');
        let _space = chars.next(); // skip space

        let path: String = chars.collect();
        let path = if path.len() >= 2 && path.starts_with('"') && path.ends_with('"') {
            path[1..path.len() - 1].to_string()
        } else {
            path
        };

        if x != ' ' && x != '?' {
            staged.push(GitFileStatus {
                path: path.clone(),
                status: x.to_string(),
                is_staged: true,
            });
        }

        if y != ' ' {
            unstaged.push(GitFileStatus {
                path: path.clone(),
                status: if y == '?' {
                    String::from("U")
                } else {
                    y.to_string()
                },
                is_staged: false,
            });
        }
    }

    Ok(GitStatusResult { staged, unstaged })
}

#[tauri::command]
pub fn git_stage(cwd: String, paths: Vec<String>) -> Result<(), String> {
    let mut args = vec!["add".to_string()];
    args.extend(paths);

    let output = Command::new("git")
        .args(&args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to stage files: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to stage files: {}", stderr))
    }
}

#[tauri::command]
pub fn git_unstage(cwd: String, paths: Vec<String>) -> Result<(), String> {
    let mut args = vec!["restore".to_string(), "--staged".to_string()];
    args.extend(paths);

    let output = Command::new("git")
        .args(&args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to unstage files: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to unstage files: {}", stderr))
    }
}

#[tauri::command]
pub fn git_show_head(cwd: String, path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["show", &format!("HEAD:{}", path)])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get HEAD content: {}", e))?;

    if output.status.success() {
        if output.stdout.contains(&0) {
            return Err("File is a binary file and cannot be displayed".to_string());
        }
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        // Assume file is brand new (untracked) if show fails
        Ok(String::new())
    }
}

#[tauri::command]
pub fn git_discard_changes(cwd: String, paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }

    let mut restore_args = vec!["restore", "--staged"];
    restore_args.extend(paths.iter().map(|s| s.as_str()));
    let _ = Command::new("git")
        .args(&restore_args)
        .current_dir(&cwd)
        .output();

    let mut checkout_args = vec!["checkout", "--"];
    checkout_args.extend(paths.iter().map(|s| s.as_str()));
    let output = Command::new("git")
        .args(&checkout_args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let mut clean_args = vec!["clean", "-f", "--"];
        clean_args.extend(paths.iter().map(|s| s.as_str()));
        let clean = Command::new("git")
            .args(&clean_args)
            .current_dir(&cwd)
            .output()
            .map_err(|e| e.to_string())?;

        if !clean.status.success() {
            let stderr = String::from_utf8_lossy(&clean.stderr);
            return Err(format!("Failed to discard changes: {}", stderr));
        }
    }
    Ok(())
}
