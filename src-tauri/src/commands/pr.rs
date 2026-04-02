use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CreatedPR {
    pub pr_url: String,
    pub pr_number: Option<i64>,
}

/// Auto-create a PR/MR via the platform REST API.
/// Supports GitHub and GitLab. Token is the user's PAT.
#[tauri::command]
pub async fn create_pull_request(
    token: String,
    platform: String,
    base_url: String,
    owner: String,
    repo: String,
    title: String,
    head_branch: String,
    base_branch: String,
    body: String,
) -> Result<CreatedPR, String> {
    let client = reqwest::Client::builder()
        .user_agent("Akira-AI/1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    match platform.as_str() {
        "github" => {
            let url = format!(
                "{}/repos/{}/{}/pulls",
                base_url.trim_end_matches('/'),
                owner,
                repo
            );

            let payload = serde_json::json!({
                "title": title,
                "body": body,
                "head": head_branch,
                "base": base_branch,
            });

            let resp = client
                .post(&url)
                .header("Authorization", format!("Bearer {}", token))
                .header("Accept", "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2022-11-28")
                .json(&payload)
                .send()
                .await
                .map_err(|e| format!("GitHub API request failed: {}", e))?;

            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();

            if !status.is_success() {
                return Err(format!("GitHub API error {}: {}", status, text));
            }

            let json: serde_json::Value =
                serde_json::from_str(&text).map_err(|e| format!("Failed to parse response: {}", e))?;

            Ok(CreatedPR {
                pr_url: json["html_url"].as_str().unwrap_or("").to_string(),
                pr_number: json["number"].as_i64(),
            })
        }

        "gitlab" => {
            // GitLab uses project path encoded
            let encoded_path =
                format!("{}/{}", owner, repo).replace('/', "%2F");
            let url = format!(
                "{}/api/v4/projects/{}/merge_requests",
                base_url.trim_end_matches('/'),
                encoded_path
            );

            let payload = serde_json::json!({
                "title": title,
                "description": body,
                "source_branch": head_branch,
                "target_branch": base_branch,
            });

            let resp = client
                .post(&url)
                .header("PRIVATE-TOKEN", &token)
                .json(&payload)
                .send()
                .await
                .map_err(|e| format!("GitLab API request failed: {}", e))?;

            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();

            if !status.is_success() {
                return Err(format!("GitLab API error {}: {}", status, text));
            }

            let json: serde_json::Value =
                serde_json::from_str(&text).map_err(|e| format!("Failed to parse response: {}", e))?;

            Ok(CreatedPR {
                pr_url: json["web_url"].as_str().unwrap_or("").to_string(),
                pr_number: json["iid"].as_i64(),
            })
        }

        _ => Err(format!("Unsupported platform: {}. Supported: github, gitlab", platform)),
    }
}

/// Get diff between base branch and head branch (PR-specific, isolated per task).
/// Uses `git diff base...head` (3-dot) to show only commits in head not in base.
#[tauri::command]
pub fn git_get_branch_diff(
    cwd: String,
    base_branch: String,
    head_branch: String,
) -> Result<crate::commands::git::GitDiffResult, String> {
    use std::process::Command;

    let range = format!("{}...{}", base_branch, head_branch);

    // Get changed files
    let files_output = Command::new("git")
        .args(["diff", "--name-only", &range])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get branch diff files: {}", e))?;

    let files_str = String::from_utf8_lossy(&files_output.stdout);
    let changed_files: Vec<String> = files_str
        .lines()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let has_changes = !changed_files.is_empty();

    // Get full diff
    let diff_output = Command::new("git")
        .args(["diff", &range])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get branch diff: {}", e))?;

    let diff = String::from_utf8_lossy(&diff_output.stdout).to_string();

    Ok(crate::commands::git::GitDiffResult {
        diff,
        has_changes,
        changed_files,
    })
}
