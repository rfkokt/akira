use calamine::{open_workbook_from_rs, Data, Reader, Xlsx};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use tauri::State;

use crate::db::queries::{self, CreateTaskRequest, Task};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
struct JsonTask {
    title: String,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub tasks: Vec<Task>,
}

fn normalize_status(status: &str) -> String {
    match status.to_lowercase().as_str() {
        "todo" | "to do" | "backlog" => "todo",
        "in progress" | "doing" | "wip" => "in-progress",
        "review" | "in review" => "review",
        "done" | "completed" | "finished" => "done",
        _ => "todo",
    }
    .to_string()
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn import_tasks_json(
    state: State<AppState>,
    content: String,
    workspaceId: Option<String>,
) -> Result<ImportResult, String> {
    let json_tasks: Vec<JsonTask> =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {}", e))?;

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut imported_tasks = Vec::new();

    for json_task in json_tasks {
        let request = CreateTaskRequest {
            title: json_task.title.clone(),
            description: json_task.description,
            status: normalize_status(&json_task.status.unwrap_or_else(|| "todo".to_string())),
            priority: json_task.priority.unwrap_or_else(|| "medium".to_string()),
            file_path: None,
            workspace_id: workspaceId.clone(),
            base_branch: None,
        };

        match queries::create_task(&conn, &request) {
            Ok(task) => imported_tasks.push(task),
            Err(e) => eprintln!("Failed to import task: {}", e),
        }
    }

    Ok(ImportResult {
        tasks: imported_tasks,
    })
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn import_tasks_markdown(
    state: State<AppState>,
    content: String,
    workspaceId: Option<String>,
) -> Result<ImportResult, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut imported_tasks = Vec::new();
    let mut current_status = "todo";

    for line in content.lines() {
        let line = line.trim();

        // Parse headers for status
        if line.starts_with("## ") || line.starts_with("### ") {
            let header = line.trim_start_matches("#").trim();
            current_status = match header.to_lowercase().as_str() {
                "todo" | "to do" | "backlog" => "todo",
                "in progress" | "doing" | "wip" => "in-progress",
                "review" | "in review" => "review",
                "done" | "completed" | "finished" => "done",
                _ => "todo",
            };
            continue;
        }

        // Parse task items
        if line.starts_with("- [ ]") || line.starts_with("- [x]") || line.starts_with("- [X]") {
            let title = line
                .trim_start_matches("- [ ]")
                .trim_start_matches("- [x]")
                .trim_start_matches("- [X]")
                .trim();

            let status = if line.starts_with("- [x]") || line.starts_with("- [X]") {
                "done"
            } else {
                current_status
            };

            let request = CreateTaskRequest {
                title: title.to_string(),
                description: None,
                status: status.to_string(),
                priority: "medium".to_string(),
                file_path: None,
                workspace_id: workspaceId.clone(),
                base_branch: None,
            };

            match queries::create_task(&conn, &request) {
                Ok(task) => imported_tasks.push(task),
                Err(e) => eprintln!("Failed to import task: {}", e),
            }
        }
    }

    Ok(ImportResult {
        tasks: imported_tasks,
    })
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn import_tasks_excel(
    state: State<AppState>,
    bytes: Vec<u8>,
    workspaceId: Option<String>,
) -> Result<ImportResult, String> {
    let cursor = Cursor::new(bytes);
    let mut workbook: Xlsx<Cursor<Vec<u8>>> =
        open_workbook_from_rs(cursor).map_err(|e| format!("Failed to open Excel file: {}", e))?;

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut imported_tasks = Vec::new();

    // Get the first sheet
    let sheet_name = workbook
        .sheet_names()
        .first()
        .ok_or("Excel file has no sheets")?
        .clone();

    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| format!("Failed to read sheet: {}", e))?;

    let mut headers: Vec<String> = Vec::new();
    let mut is_first_row = true;

    for row in range.rows() {
        if is_first_row {
            // Parse headers
            for cell in row {
                let header = match cell {
                    Data::String(s) => s.to_lowercase().replace(" ", "_"),
                    Data::Float(f) => f.to_string(),
                    _ => String::new(),
                };
                headers.push(header);
            }
            is_first_row = false;
            continue;
        }

        // Parse row data
        let mut title = String::new();
        let mut description: Option<String> = None;
        let mut status = "todo".to_string();
        let mut priority = "medium".to_string();

        for (idx, cell) in row.iter().enumerate() {
            if idx >= headers.len() {
                break;
            }

            let value = match cell {
                Data::String(s) => s.clone(),
                Data::Float(f) => f.to_string(),
                Data::Int(i) => i.to_string(),
                Data::Bool(b) => b.to_string(),
                _ => String::new(),
            };

            match headers[idx].as_str() {
                "title" | "task" | "name" => title = value,
                "description" | "desc" | "details" => {
                    if !value.is_empty() {
                        description = Some(value);
                    }
                }
                "status" | "state" => {
                    if !value.is_empty() {
                        status = normalize_status(&value);
                    }
                }
                "priority" | "importance" | "urgency" => {
                    if !value.is_empty() {
                        priority = match value.to_lowercase().as_str() {
                            "high" | "critical" | "urgent" => "high",
                            "medium" | "normal" => "medium",
                            "low" => "low",
                            _ => "medium",
                        }
                        .to_string();
                    }
                }
                _ => {}
            }
        }

        if !title.is_empty() {
            let request = CreateTaskRequest {
                title,
                description,
                status,
                priority,
                file_path: None,
                workspace_id: workspaceId.clone(),
                base_branch: None,
            };

            match queries::create_task(&conn, &request) {
                Ok(task) => imported_tasks.push(task),
                Err(e) => eprintln!("Failed to import task: {}", e),
            }
        }
    }

    Ok(ImportResult {
        tasks: imported_tasks,
    })
}
