use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

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

#[tauri::command]
pub async fn run_agent(
    _state: State<'_, AppState>,
    request: RunAgentRequest,
) -> Result<RunAgentResponse, String> {
    // Agent execution logic would go here
    // For now, return a placeholder response
    Ok(RunAgentResponse {
        success: true,
        output: format!(
            "Running agent for task {} with {} files",
            request.task_id,
            request.files.len()
        ),
        error: None,
    })
}

#[tauri::command]
pub fn stop_agent(_state: State<AppState>, task_id: String) -> Result<(), String> {
    // Stop agent logic would go here
    println!("Stopping agent for task: {}", task_id);
    Ok(())
}

#[tauri::command]
pub fn get_agent_status(_state: State<AppState>, task_id: String) -> Result<AgentStatus, String> {
    // Get agent status logic would go here
    Ok(AgentStatus {
        is_running: false,
        current_task: Some(task_id),
        progress: None,
    })
}
