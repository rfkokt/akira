use std::path::Path;
use std::process::Command;

use super::types::PiError;

/// Generate a task branch name from a task title and task ID.
///
/// Steps:
/// 1. Lowercase the title
/// 2. Replace spaces and underscores with hyphens
/// 3. Strip all characters that are not alphanumeric or hyphens
/// 4. Collapse multiple consecutive hyphens into one
/// 5. Trim leading/trailing hyphens
/// 6. Truncate to 50 chars (without splitting mid-hyphen-collapse)
/// 7. Append `-` + first 8 chars of task_id
/// 8. Prefix with `task/`
pub fn slugify_task_branch(title: &str, task_id: &str) -> String {
    // Step 1: Lowercase
    let slug = title.to_lowercase();

    // Step 2: Replace spaces and underscores with hyphens
    let slug: String = slug
        .chars()
        .map(|c| if c == ' ' || c == '_' { '-' } else { c })
        .collect();

    // Step 3: Strip all characters that are not ASCII alphanumeric or hyphens
    let slug: String = slug.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').collect();

    // Step 4: Collapse multiple consecutive hyphens into one
    let mut slug = collapse_hyphens(&slug);

    // Step 5: Trim leading/trailing hyphens
    slug = slug.trim_matches('-').to_string();

    // Step 6: Truncate to 50 chars
    if slug.len() > 50 {
        slug.truncate(50);
        // Trim any trailing hyphen left after truncation
        slug = slug.trim_end_matches('-').to_string();
    }

    // Step 7: Append `-` + first 8 chars of task_id (lowercased)
    let id_suffix: String = task_id[..task_id.len().min(8)].to_lowercase();

    // Step 8: Prefix with `task/`
    format!("task/{}-{}", slug, id_suffix)
}

/// Collapse multiple consecutive hyphens into a single hyphen.
fn collapse_hyphens(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut prev_hyphen = false;
    for c in s.chars() {
        if c == '-' {
            if !prev_hyphen {
                result.push('-');
            }
            prev_hyphen = true;
        } else {
            result.push(c);
            prev_hyphen = false;
        }
    }
    result
}

/// Create a new task branch from a base branch.
///
/// Runs `git checkout <base_branch>` then `git checkout -b <branch_name>` in the given cwd.
/// On failure, leaves the working tree unchanged and returns an error.
pub fn create_task_branch(
    cwd: &Path,
    base_branch: &str,
    branch_name: &str,
) -> Result<(), PiError> {
    // First, checkout the base branch
    let output = Command::new("git")
        .args(["checkout", base_branch])
        .current_dir(cwd)
        .output()
        .map_err(|e| PiError::GitError {
            message: format!("Failed to execute git checkout {}: {}", base_branch, e),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(PiError::GitError {
            message: format!(
                "Failed to checkout base branch '{}': {}",
                base_branch,
                stderr.trim()
            ),
        });
    }

    // Then, create and checkout the new branch
    let output = Command::new("git")
        .args(["checkout", "-b", branch_name])
        .current_dir(cwd)
        .output()
        .map_err(|e| PiError::GitError {
            message: format!("Failed to execute git checkout -b {}: {}", branch_name, e),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(PiError::GitError {
            message: format!(
                "Failed to create branch '{}': {}",
                branch_name,
                stderr.trim()
            ),
        });
    }

    Ok(())
}

/// Checkout an existing branch.
///
/// Runs `git checkout <branch_name>` in the given cwd.
/// On failure, leaves the working tree unchanged and returns an error.
pub fn checkout_branch(cwd: &Path, branch_name: &str) -> Result<(), PiError> {
    let output = Command::new("git")
        .args(["checkout", branch_name])
        .current_dir(cwd)
        .output()
        .map_err(|e| PiError::GitError {
            message: format!("Failed to execute git checkout {}: {}", branch_name, e),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(PiError::GitError {
            message: format!(
                "Failed to checkout branch '{}': {}",
                branch_name,
                stderr.trim()
            ),
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_slugify() {
        let result = slugify_task_branch("Fix login bug", "abc12345def");
        assert_eq!(result, "task/fix-login-bug-abc12345");
    }

    #[test]
    fn test_underscores_replaced() {
        let result = slugify_task_branch("add_new_feature", "12345678");
        assert_eq!(result, "task/add-new-feature-12345678");
    }

    #[test]
    fn test_special_characters_stripped() {
        let result = slugify_task_branch("Fix: the @#$ bug!", "abcdefgh");
        assert_eq!(result, "task/fix-the-bug-abcdefgh");
    }

    #[test]
    fn test_multiple_spaces_collapsed() {
        let result = slugify_task_branch("too   many   spaces", "abcdefgh");
        assert_eq!(result, "task/too-many-spaces-abcdefgh");
    }

    #[test]
    fn test_truncation_at_50_chars() {
        // A title that produces a slug longer than 50 chars
        let long_title = "this is a very long task title that should be truncated to fifty characters maximum";
        let result = slugify_task_branch(long_title, "abcdefgh");
        // The slug part (between "task/" and "-abcdefgh") should be at most 50 chars
        let without_prefix = result.strip_prefix("task/").unwrap();
        let without_suffix = without_prefix.strip_suffix("-abcdefgh").unwrap();
        assert!(without_suffix.len() <= 50);
    }

    #[test]
    fn test_short_task_id() {
        let result = slugify_task_branch("test", "abc");
        assert_eq!(result, "task/test-abc");
    }

    #[test]
    fn test_leading_trailing_special_chars() {
        let result = slugify_task_branch("---hello---", "abcdefgh");
        assert_eq!(result, "task/hello-abcdefgh");
    }

    #[test]
    fn test_unicode_stripped() {
        let result = slugify_task_branch("café résumé", "abcdefgh");
        assert_eq!(result, "task/caf-rsum-abcdefgh");
    }

    #[test]
    fn test_empty_title() {
        let result = slugify_task_branch("", "abcdefgh");
        assert_eq!(result, "task/-abcdefgh");
    }

    #[test]
    fn test_all_special_chars_title() {
        let result = slugify_task_branch("@#$%^&*()", "abcdefgh");
        assert_eq!(result, "task/-abcdefgh");
    }

    #[test]
    fn test_mixed_case() {
        let result = slugify_task_branch("FIX The BUG", "ABCDEFGH");
        assert_eq!(result, "task/fix-the-bug-abcdefgh");
    }
}
