use crate::cli_router::queries as cli_queries;
use crate::db::queries;
use crate::state::AppState;
use crate::streaming::{AgentEvent, NdjsonParser, StreamAccumulator};
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::Arc;
use tauri::{Emitter, State};

/// Run agent with structured NDJSON output streaming
/// Emits events via Tauri event system for real-time UI updates
#[tauri::command]
pub async fn run_structured_agent(
    state: State<'_, AppState>,
    prompt: String,
    workspace_id: String,
    task_id: String,
    model: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let engine = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let engines = cli_queries::get_enabled_engines(&conn).map_err(|e| e.to_string())?;
        engines.into_iter().next().ok_or_else(|| "No enabled engine configured".to_string())?
    };

    let mut cmd = Command::new(&engine.binary_path);
    if let Some(ref m) = model {
        if !m.is_empty() {
            cmd.arg("--model").arg(m);
        }
    }
    cmd.arg("--json");
    cmd.arg(&prompt);

    if !workspace_id.is_empty() {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        if let Ok(Some(ws)) = queries::get_workspace_by_id(&conn, &workspace_id) {
            cmd.current_dir(&ws.folder_path);
        }
    }

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn agent: {}", e))?;

    let stdout = child.stdout.take().ok_or_else(|| "Failed to capture stdout".to_string())?;

    {
        let mut process = state.running_process.lock().map_err(|e| e.to_string())?;
        *process = Some(Arc::new(std::sync::Mutex::new(child)));
    }

    let task_id_clone = task_id.clone();
    let app_handle_clone = app_handle.clone();

    let reader_task = tokio::task::spawn_blocking(move || {
        let reader = BufReader::new(stdout);
        let mut accumulator = StreamAccumulator::new();

        for line_result in reader.lines() {
            match line_result {
                Ok(line) => {
                    if line.trim().is_empty() {
                        continue;
                    }

                    match AgentEvent::from_ndjson(&line) {
                        Ok(event) => {
                            let _ = app_handle_clone.emit(
                                &format!("agent-event-{}", task_id_clone),
                                &event,
                            );
                            accumulator.add_event(event);
                        }
                        Err(_) => {
                            let text_event = AgentEvent::Text { text: line };
                            let _ = app_handle_clone.emit(
                                &format!("agent-event-{}", task_id_clone),
                                &text_event,
                            );
                            accumulator.add_event(text_event);
                        }
                    }
                }
                Err(e) => {
                    let error_event = AgentEvent::Error {
                        error: format!("Read error: {}", e),
                    };
                    let _ = app_handle_clone.emit(
                        &format!("agent-event-{}", task_id_clone),
                        &error_event,
                    );
                    break;
                }
            }
        }

        let _ = app_handle_clone.emit(
            &format!("agent-event-{}", task_id_clone),
            &AgentEvent::Done,
        );

        accumulator.get_text().to_string()
    });

    match reader_task.await {
        Ok(result) => {
            let mut process = state.running_process.lock().map_err(|e| e.to_string())?;
            *process = None;
            Ok(result)
        }
        Err(e) => {
            let mut process = state.running_process.lock().map_err(|e| e.to_string())?;
            *process = None;
            Err(format!("Task failed: {}", e))
        }
    }
}

/// Send a message to the agent and get structured streaming output
#[tauri::command]
pub async fn send_structured_message(
    state: State<'_, AppState>,
    task_id: String,
    message: String,
    system_prompt: Option<String>,
    workspace_id: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let _ = system_prompt;
    run_structured_agent(
        state,
        message,
        workspace_id.unwrap_or_default(),
        task_id,
        None,
        app_handle,
    )
    .await
    .map(|_| ())
}

/// Parse accumulated NDJSON output into structured events
#[tauri::command]
pub fn parse_ndjson_output(output: String) -> Result<Vec<AgentEvent>, String> {
    let events = NdjsonParser::parse_lines(&output)
        .into_iter()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Parse error: {}", e))?;

    Ok(events)
}

/// Get accumulated content from events
#[tauri::command]
pub fn extract_content_from_events(events: Vec<AgentEvent>) -> (String, String, Option<(u64, u64)>) {
    let mut accumulator = StreamAccumulator::new();

    for event in events {
        accumulator.add_event(event);
    }

    let usage = accumulator.get_usage();
    if usage.0 > 0 || usage.1 > 0 {
        (accumulator.get_text().to_string(), accumulator.get_thinking().to_string(), Some(usage))
    } else {
        (accumulator.get_text().to_string(), accumulator.get_thinking().to_string(), None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ndjson_command() {
        let ndjson = r#"{"type":"thinking","thinking":"Analyzing..."}
{"type":"text","text":"Result: 42"}
{"type":"usage","input_tokens":10,"output_tokens":5}
{"type":"done"}"#;

        let result = parse_ndjson_output(ndjson.to_string());
        assert!(result.is_ok());

        let events = result.unwrap();
        assert_eq!(events.len(), 4);
    }
}