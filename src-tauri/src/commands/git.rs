use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct GitBranchesResult {
    pub current: String,
    pub local: Vec<String>,
    pub remote: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitLogEntry {
    pub hash: String,
    pub full_hash: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub date_iso: String,
    pub parents: Vec<String>,
    pub refs: Vec<String>,
    pub is_merge: bool,
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

#[tauri::command]
pub fn git_log(
    cwd: String,
    count: Option<u32>,
    branch: Option<String>,
) -> Result<Vec<GitLogEntry>, String> {
    let count = count.unwrap_or(50);

    let mut args = vec![
        "log".to_string(),
        "--format=%H|%h|%s|%an|%ae|%ar|%aI|%P|%D".to_string(),
        format!("-{}", count),
    ];

    // Add branch filter if specified, otherwise use --all
    if let Some(b) = branch {
        args.push(b);
    } else {
        args.push("--all".to_string());
    }

    let output = Command::new("git")
        .args(&args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to run git log: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to get git log: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();

    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        // Parse format: %H|%h|%s|%an|%ae|%ar|%aI|%P|%D
        let parts: Vec<&str> = line.split('|').collect();

        if parts.len() < 8 {
            continue;
        }

        let full_hash = parts[0].to_string();
        let hash = parts[1].to_string();
        let message = parts[2].to_string();
        let author = parts[3].to_string();
        let email = parts[4].to_string();
        let date = parts[5].to_string();
        let date_iso = parts[6].to_string();
        let parents: Vec<String> = parts
            .get(7)
            .map(|p| p.split_whitespace().map(|s| s.to_string()).collect())
            .unwrap_or_default();
        let refs_str = parts.get(8).unwrap_or(&"");
        let refs: Vec<String> = refs_str
            .split(", ")
            .filter(|s| !s.is_empty() && !s.starts_with("HEAD"))
            .map(|s| {
                // Clean up ref names: "origin/main" -> "main", "tag: v1.0" -> "v1.0"
                let s = s.trim();
                if s.starts_with("origin/") {
                    s.strip_prefix("origin/").unwrap_or(s).to_string()
                } else if s.starts_with("tag: ") {
                    s.strip_prefix("tag: ").unwrap_or(s).to_string()
                } else {
                    s.to_string()
                }
            })
            .collect();

        let is_merge = parents.len() > 1;

        entries.push(GitLogEntry {
            hash,
            full_hash,
            message,
            author,
            email,
            date,
            date_iso,
            parents,
            refs,
            is_merge,
        });
    }

    Ok(entries)
}

#[tauri::command]
pub fn git_commit_amend(cwd: String, message: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(["commit", "--amend", "-m", &message])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to amend commit: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to amend commit: {}", stderr))
    }
}

#[derive(Debug, Serialize)]
pub struct CommitFile {
    pub path: String,
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
}

#[tauri::command]
pub fn git_show_files(cwd: String, hash: String) -> Result<Vec<CommitFile>, String> {
    let output = Command::new("git")
        .args(["show", "--stat", "--format=", &hash])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to show commit: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to show commit: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut files = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("commit ") {
            continue;
        }

        // Parse lines like: " src/file.ts |  12 +++++---"
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 2 {
            let path = parts[0].trim();
            if path.is_empty() {
                continue;
            }

            // Determine status based on diff output
            let status = if line.starts_with(" create mode") || line.contains("new file") {
                "A"
            } else if line.starts_with(" delete mode") || line.contains("deleted") {
                "D"
            } else if line.contains("rename") {
                "R"
            } else {
                "M"
            };

            // Parse additions/deletions from the stats part
            let stats_part = parts.get(1).unwrap_or(&"").trim();
            let mut additions = 0u32;
            let mut deletions = 0u32;

            // Count + and - characters
            for c in stats_part.chars() {
                if c == '+' {
                    additions += 1;
                } else if c == '-' {
                    deletions += 1;
                }
            }

            files.push(CommitFile {
                path: path.to_string(),
                status: status.to_string(),
                additions,
                deletions,
            });
        }
    }

    Ok(files)
}

#[tauri::command]
pub fn git_show_file(cwd: String, commit: String, path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["show", &format!("{}:{}", commit, path)])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to show file: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to show file: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub fn git_show_file_diff(cwd: String, hash: String, file_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["show", "--format=", &format!("{}:{}", hash, file_path)])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to show file: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to show file: {}", stderr));
    }

    let content = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(content)
}

#[tauri::command]
pub fn git_show_file_diff_patch(
    cwd: String,
    commit: String,
    file_path: String,
) -> Result<String, String> {
    let output = Command::new("git")
        .args(["diff", &format!("{}^", commit), &commit, "--", &file_path])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to show diff: {}", e))?;

    if !output.status.success() {
        // Try without parent (for initial commits)
        let output = Command::new("git")
            .args(["show", &commit, "--", &file_path])
            .current_dir(&cwd)
            .output()
            .map_err(|e| format!("Failed to show diff: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to show diff: {}", stderr));
        }

        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
