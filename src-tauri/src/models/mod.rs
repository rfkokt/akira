// Re-export types from db::queries for use across the application
pub use crate::db::queries::{CreateEngineRequest, CreateTaskRequest, Engine, Task};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub tasks: Vec<Task>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RtkStats {
    pub input_tokens: usize,
    pub output_tokens: usize,
    pub savings_pct: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitDiffResult {
    pub diff: String,
    pub has_changes: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub root_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShellCommandResult {
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
    pub exit_code: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunAgentRequest {
    pub task_id: String,
    pub prompt: String,
    pub cwd: String,
    pub files: Vec<String>,
    pub provider: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunAgentResponse {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatus {
    pub is_running: bool,
    pub current_task: Option<String>,
    pub progress: Option<f64>,
}
