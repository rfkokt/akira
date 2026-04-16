use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct ShellCommandResult {
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
    pub exit_code: i32,
}

#[tauri::command]
pub fn run_shell_command(
    command: String,
    args: Vec<String>,
    cwd: String,
) -> Result<ShellCommandResult, String> {
    let output = Command::new(&command)
        .args(&args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let success = output.status.success();
    let exit_code = output.status.code().unwrap_or(-1);

    Ok(ShellCommandResult {
        stdout,
        stderr,
        success,
        exit_code,
    })
}
