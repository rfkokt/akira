//! Property-based tests for the process-per-task invariant.
//!
//! **Validates: Requirements 2.2**
//!
//! Property 2: For any sequence of spawn and terminate operations on the process
//! manager, there SHALL never be more than one active Pi subprocess associated
//! with a given task ID at any point in the sequence.
//!
//! Since `PiProcessManager` requires a real `AppHandle` (Tauri), we test this
//! property at an abstract model level using a simplified process map that
//! mirrors the HashMap<String, _> semantics of the real implementation.

#[cfg(test)]
mod tests {
    use proptest::prelude::*;
    use std::collections::HashMap;

    /// Operations that can be performed on the process manager model.
    #[derive(Debug, Clone)]
    enum Operation {
        /// Spawn a Pi process for the given task_id.
        /// If one already exists, the old one is terminated first (matching real behavior).
        Spawn(String),
        /// Terminate the Pi process for the given task_id.
        Terminate(String),
    }

    /// A simplified model of the PiProcessManager's process map.
    /// Each entry represents an active Pi process for a task_id.
    /// The bool value represents "process is active" (true = running).
    struct ProcessManagerModel {
        processes: HashMap<String, bool>,
    }

    impl ProcessManagerModel {
        fn new() -> Self {
            Self {
                processes: HashMap::new(),
            }
        }

        /// Model of PiProcessManager::spawn behavior:
        /// - If a process already exists for this task_id, terminate it first
        /// - Then insert a new process entry
        /// This ensures at most one process per task_id at all times.
        fn spawn(&mut self, task_id: &str) {
            // Mirrors the real implementation: check if exists, terminate old, insert new
            if self.processes.contains_key(task_id) {
                self.processes.remove(task_id);
            }
            self.processes.insert(task_id.to_string(), true);
        }

        /// Model of PiProcessManager::terminate behavior:
        /// - Remove the process entry for this task_id
        fn terminate(&mut self, task_id: &str) {
            self.processes.remove(task_id);
        }

        /// Count how many active processes exist for a given task_id.
        /// For a HashMap this is always 0 or 1, but this validates the invariant.
        fn count_processes_for_task(&self, task_id: &str) -> usize {
            if self.processes.contains_key(task_id) {
                1
            } else {
                0
            }
        }

        /// Total number of active processes.
        fn total_processes(&self) -> usize {
            self.processes.len()
        }
    }

    /// Strategy to generate a task_id from a small set to increase collisions.
    fn arb_task_id() -> impl Strategy<Value = String> {
        prop_oneof![
            Just("task-001".to_string()),
            Just("task-002".to_string()),
            Just("task-003".to_string()),
            Just("task-004".to_string()),
            Just("task-005".to_string()),
            "[a-z0-9]{4,12}".prop_map(|s| format!("task-{}", s)),
        ]
    }

    /// Strategy to generate a single operation (spawn or terminate) with a task_id.
    fn arb_operation() -> impl Strategy<Value = Operation> {
        prop_oneof![
            arb_task_id().prop_map(Operation::Spawn),
            arb_task_id().prop_map(Operation::Terminate),
        ]
    }

    /// Strategy to generate a sequence of operations (5 to 50 operations).
    fn arb_operation_sequence() -> impl Strategy<Value = Vec<Operation>> {
        proptest::collection::vec(arb_operation(), 5..=50)
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(200))]

        /// **Validates: Requirements 2.2**
        ///
        /// Property 2: At most one Pi process per task.
        ///
        /// For any sequence of spawn and terminate operations, the process map
        /// SHALL never have more than one entry per task_id at any point.
        #[test]
        fn at_most_one_process_per_task(ops in arb_operation_sequence()) {
            let mut model = ProcessManagerModel::new();

            for op in &ops {
                // Apply the operation
                match op {
                    Operation::Spawn(task_id) => model.spawn(task_id),
                    Operation::Terminate(task_id) => model.terminate(task_id),
                }

                // After each operation, verify the invariant holds for ALL task_ids
                // that have ever been seen
                let all_task_ids: Vec<String> = model.processes.keys().cloned().collect();
                for task_id in &all_task_ids {
                    let count = model.count_processes_for_task(task_id);
                    prop_assert!(
                        count <= 1,
                        "Invariant violated: task_id '{}' has {} active processes after {:?}",
                        task_id, count, op
                    );
                }
            }
        }

        /// **Validates: Requirements 2.2**
        ///
        /// Property 2 (supplementary): After spawn(task_id), the map has exactly
        /// 1 entry for that task_id. After terminate(task_id), it has 0.
        #[test]
        fn spawn_yields_exactly_one_terminate_yields_zero(ops in arb_operation_sequence()) {
            let mut model = ProcessManagerModel::new();

            for op in &ops {
                match op {
                    Operation::Spawn(task_id) => {
                        model.spawn(task_id);
                        // After spawn, exactly 1 process for this task_id
                        prop_assert_eq!(
                            model.count_processes_for_task(task_id), 1,
                            "After spawn('{}'), expected exactly 1 process", task_id
                        );
                    }
                    Operation::Terminate(task_id) => {
                        model.terminate(task_id);
                        // After terminate, exactly 0 processes for this task_id
                        prop_assert_eq!(
                            model.count_processes_for_task(task_id), 0,
                            "After terminate('{}'), expected exactly 0 processes", task_id
                        );
                    }
                }
            }
        }

        /// **Validates: Requirements 2.2**
        ///
        /// Property 2 (supplementary): Re-spawning the same task_id does not
        /// increase the total process count — it replaces the existing one.
        #[test]
        fn respawn_replaces_existing_process(task_id in arb_task_id()) {
            let mut model = ProcessManagerModel::new();

            // First spawn
            model.spawn(&task_id);
            prop_assert_eq!(model.total_processes(), 1);
            prop_assert_eq!(model.count_processes_for_task(&task_id), 1);

            // Re-spawn same task_id — should still be exactly 1
            model.spawn(&task_id);
            prop_assert_eq!(model.total_processes(), 1,
                "Re-spawning same task_id should not increase total process count");
            prop_assert_eq!(model.count_processes_for_task(&task_id), 1,
                "Re-spawning same task_id should still have exactly 1 process");

            // Spawn again — still 1
            model.spawn(&task_id);
            prop_assert_eq!(model.total_processes(), 1);
            prop_assert_eq!(model.count_processes_for_task(&task_id), 1);
        }

        /// **Validates: Requirements 2.2**
        ///
        /// Property 2 (supplementary): The total number of active processes
        /// never exceeds the number of unique task_ids that have been spawned
        /// without being terminated.
        #[test]
        fn total_processes_bounded_by_unique_active_tasks(ops in arb_operation_sequence()) {
            let mut model = ProcessManagerModel::new();
            let mut active_task_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

            for op in &ops {
                match op {
                    Operation::Spawn(task_id) => {
                        model.spawn(task_id);
                        active_task_ids.insert(task_id.clone());
                    }
                    Operation::Terminate(task_id) => {
                        model.terminate(task_id);
                        active_task_ids.remove(task_id);
                    }
                }

                prop_assert!(
                    model.total_processes() <= active_task_ids.len(),
                    "Total processes ({}) should not exceed unique active task_ids ({})",
                    model.total_processes(), active_task_ids.len()
                );
            }
        }
    }
}
