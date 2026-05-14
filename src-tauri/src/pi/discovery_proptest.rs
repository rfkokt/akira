//! Property-based tests for Pi binary discovery priority order.
//!
//! **Validates: Requirements 1.1, 1.3, 1.4, 1.5**
//!
//! Property 1: For any combination of filesystem states (paths existing or not
//! existing across the search locations), the discovery function SHALL return
//! the path that appears earliest in the priority order among those that exist
//! and are executable.

#[cfg(test)]
mod tests {
    use crate::pi::discovery::{FileSystemCheck, PiBinaryDiscovery, PiDiscoveryError};
    use proptest::prelude::*;
    use std::collections::HashSet;
    use std::path::{Path, PathBuf};

    /// A mock filesystem that tracks which paths exist and which are executable.
    struct MockFs {
        existing: HashSet<PathBuf>,
        executable: HashSet<PathBuf>,
    }

    impl FileSystemCheck for MockFs {
        fn exists(&self, path: &Path) -> bool {
            self.existing.contains(path)
        }

        fn is_executable(&self, path: &Path) -> bool {
            self.executable.contains(path)
        }
    }

    /// Represents the state of a binary at a given search location.
    #[derive(Debug, Clone, Copy, PartialEq)]
    enum BinaryState {
        /// No binary exists at this location.
        Missing,
        /// Binary exists but is not executable.
        ExistsNotExecutable,
        /// Binary exists and is executable.
        ExistsExecutable,
    }

    /// Strategy to generate an arbitrary BinaryState.
    fn arb_binary_state() -> impl Strategy<Value = BinaryState> {
        prop_oneof![
            Just(BinaryState::Missing),
            Just(BinaryState::ExistsNotExecutable),
            Just(BinaryState::ExistsExecutable),
        ]
    }

    /// Strategy to generate a vector of 2-8 search paths with associated states.
    /// This simulates the priority-ordered search locations.
    fn arb_discovery_scenario() -> impl Strategy<Value = (Vec<PathBuf>, Vec<BinaryState>)> {
        // Generate between 2 and 8 search directories
        (2usize..=8usize).prop_flat_map(|n| {
            let paths: Vec<PathBuf> = (0..n)
                .map(|i| PathBuf::from(format!("/search/path_{}", i)))
                .collect();
            let states = proptest::collection::vec(arb_binary_state(), n..=n);
            (Just(paths), states)
        })
    }

    /// Build a MockFs from search paths and their binary states.
    fn build_mock_fs(paths: &[PathBuf], states: &[BinaryState]) -> MockFs {
        let mut existing = HashSet::new();
        let mut executable = HashSet::new();

        for (dir, state) in paths.iter().zip(states.iter()) {
            let candidate = dir.join("pi");
            match state {
                BinaryState::Missing => {}
                BinaryState::ExistsNotExecutable => {
                    existing.insert(candidate);
                }
                BinaryState::ExistsExecutable => {
                    existing.insert(candidate.clone());
                    executable.insert(candidate);
                }
            }
        }

        MockFs {
            existing,
            executable,
        }
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(200))]

        /// **Validates: Requirements 1.1, 1.3, 1.4, 1.5**
        ///
        /// Property 1: Binary discovery returns first valid path in priority order.
        ///
        /// For any combination of filesystem states across search locations,
        /// the discovery function returns the path that appears earliest in
        /// priority order among those that exist and are executable.
        #[test]
        fn discovery_returns_first_valid_in_priority_order(
            (paths, states) in arb_discovery_scenario()
        ) {
            let fs = build_mock_fs(&paths, &states);
            let result = PiBinaryDiscovery::discover_with_fs(&paths, &fs);

            // Find the expected result by scanning in priority order
            let mut expected: Option<Result<PathBuf, &str>> = None;
            for (dir, state) in paths.iter().zip(states.iter()) {
                let candidate = dir.join("pi");
                match state {
                    BinaryState::Missing => continue,
                    BinaryState::ExistsNotExecutable => {
                        // First existing-but-not-executable should yield NotExecutable error
                        expected = Some(Err("not_executable"));
                        break;
                    }
                    BinaryState::ExistsExecutable => {
                        // First existing+executable should be returned
                        expected = Some(Ok(candidate));
                        break;
                    }
                }
            }

            match expected {
                None => {
                    // No binary found anywhere → should be NotFound
                    match &result {
                        Err(PiDiscoveryError::NotFound { searched_locations }) => {
                            // Verify all search paths were reported
                            prop_assert_eq!(
                                searched_locations.len(),
                                paths.len(),
                                "NotFound should list all searched locations"
                            );
                        }
                        other => {
                            prop_assert!(
                                false,
                                "Expected NotFound, got: {:?}",
                                other
                            );
                        }
                    }
                }
                Some(Ok(expected_path)) => {
                    // Should return the expected path
                    match &result {
                        Ok(found_path) => {
                            prop_assert_eq!(
                                found_path, &expected_path,
                                "Discovery should return the first executable path in priority order"
                            );
                        }
                        other => {
                            prop_assert!(
                                false,
                                "Expected Ok({:?}), got: {:?}",
                                expected_path, other
                            );
                        }
                    }
                }
                Some(Err("not_executable")) => {
                    // Should return NotExecutable error
                    match &result {
                        Err(PiDiscoveryError::NotExecutable { path }) => {
                            // Find the first non-executable path
                            let first_non_exec = paths.iter().zip(states.iter())
                                .find(|(_, s)| **s == BinaryState::ExistsNotExecutable)
                                .map(|(d, _)| d.join("pi"))
                                .unwrap();
                            prop_assert_eq!(
                                path, &first_non_exec,
                                "NotExecutable should reference the first found-but-not-executable path"
                            );
                        }
                        other => {
                            prop_assert!(
                                false,
                                "Expected NotExecutable error, got: {:?}",
                                other
                            );
                        }
                    }
                }
                _ => unreachable!(),
            }
        }

        /// **Validates: Requirements 1.1**
        ///
        /// Property 1 (supplementary): When multiple executable binaries exist,
        /// the one at the lowest index (highest priority) is always returned.
        #[test]
        fn discovery_prefers_higher_priority_when_multiple_exist(
            (paths, states) in arb_discovery_scenario()
                .prop_filter("need at least one executable",
                    |(_, states)| states.iter().any(|s| *s == BinaryState::ExistsExecutable))
        ) {
            let fs = build_mock_fs(&paths, &states);
            let result = PiBinaryDiscovery::discover_with_fs(&paths, &fs);

            // Find the first location that is either ExistsExecutable or ExistsNotExecutable
            // (since ExistsNotExecutable would be encountered first and cause an error)
            let first_existing_idx = states.iter().position(|s| *s != BinaryState::Missing);

            if let Some(idx) = first_existing_idx {
                match states[idx] {
                    BinaryState::ExistsExecutable => {
                        // Should return this path
                        let expected = paths[idx].join("pi");
                        prop_assert_eq!(
                            result.unwrap(), expected,
                            "Should return the highest-priority executable binary"
                        );
                    }
                    BinaryState::ExistsNotExecutable => {
                        // Should error with NotExecutable for this path
                        match result {
                            Err(PiDiscoveryError::NotExecutable { path }) => {
                                prop_assert_eq!(path, paths[idx].join("pi"));
                            }
                            _ => {
                                prop_assert!(false, "Expected NotExecutable error for index {}", idx);
                            }
                        }
                    }
                    BinaryState::Missing => unreachable!(),
                }
            }
        }
    }
}
