//! Property-based tests for task branch name generation.
//!
//! **Validates: Requirements 9.2**
//!
//! Property 10: Task branch name generation follows naming pattern.
//! For any task title string and task ID, the generated branch name SHALL:
//! - Be prefixed with `task/`
//! - Contain only lowercase alphanumeric characters and hyphens after the prefix
//! - Have the slug portion (title part) truncated to at most 50 characters
//! - End with a hyphen followed by the first 8 characters of the task ID

#[cfg(test)]
mod tests {
    use crate::pi::git_branch::slugify_task_branch;
    use proptest::prelude::*;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(200))]

        /// **Validates: Requirements 9.2**
        ///
        /// Property 10: Task branch name generation follows naming pattern.
        #[test]
        fn branch_name_follows_naming_pattern(
            title in ".*",
            task_id in "[a-zA-Z0-9]{8,32}"
        ) {
            let result = slugify_task_branch(&title, &task_id);

            // 1. Must be prefixed with `task/`
            prop_assert!(result.starts_with("task/"),
                "Branch name must start with 'task/', got: {}", result);

            let after_prefix = &result["task/".len()..];

            // 2. After `task/`, only lowercase alphanumeric and hyphens
            for ch in after_prefix.chars() {
                prop_assert!(
                    ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-',
                    "Character '{}' after 'task/' prefix is not lowercase alphanumeric or hyphen. Full result: {}",
                    ch, result
                );
            }

            // 3. The slug portion (between `task/` and the last `-<8chars>`) is ≤ 50 chars
            let id_suffix = &task_id[..8].to_lowercase();
            let expected_suffix = format!("-{}", id_suffix);

            prop_assert!(after_prefix.ends_with(&expected_suffix),
                "Branch name must end with '-{}', got after_prefix: {}",
                id_suffix, after_prefix);

            // Extract the slug portion (everything between prefix and the id suffix)
            let slug_portion = &after_prefix[..after_prefix.len() - expected_suffix.len()];
            prop_assert!(slug_portion.len() <= 50,
                "Slug portion must be ≤ 50 chars, got {} chars: '{}'",
                slug_portion.len(), slug_portion);

            // 4. Ends with `-` followed by first 8 chars of task_id (lowercase)
            // Already verified above via expected_suffix check
        }
    }
}
