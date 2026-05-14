pub mod discovery;
pub mod git_branch;
pub mod process_manager;
pub mod types;

#[cfg(test)]
mod discovery_proptest;

#[cfg(test)]
mod process_manager_proptest;

#[cfg(test)]
mod git_branch_proptest;

pub use discovery::{FileSystemCheck, PiBinaryDiscovery, PiDiscoveryError};
pub use git_branch::{checkout_branch, create_task_branch, slugify_task_branch};
pub use process_manager::{PiEventPayload, PiProcessManager};
pub use types::{AssistantMessageEvent, PiAuthStatus, PiCommand, PiError, PiEvent, PiModel};
