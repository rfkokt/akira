use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

// ============== Tasks ==============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub file_path: Option<String>,
    pub workspace_id: Option<String>,
    pub pr_branch: Option<String>,
    pub pr_url: Option<String>,
    pub pr_created_at: Option<String>,
    pub remote: Option<String>,
    pub is_merged: bool,
    pub merge_source_branch: Option<String>,
    pub merged_at: Option<String>,
    pub diff_content: Option<String>,
    pub diff_captured_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub file_path: Option<String>,
    pub workspace_id: Option<String>,
}

pub fn create_task(conn: &Connection, task: &CreateTaskRequest) -> Result<Task> {
    let id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO tasks (id, title, description, status, priority, file_path, workspace_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            &id,
            &task.title,
            task.description.as_ref(),
            &task.status,
            &task.priority,
            task.file_path.as_ref(),
            task.workspace_id.as_ref(),
        ],
    )?;

    get_task_by_id(conn, &id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn get_task_by_id(conn: &Connection, id: &str) -> Result<Option<Task>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, status, priority, file_path, workspace_id, pr_branch, pr_url, pr_created_at, remote, is_merged, merge_source_branch, merged_at, diff_content, diff_captured_at, created_at, updated_at 
         FROM tasks WHERE id = ?1"
    )?;

    let task = stmt.query_row([id], |row| {
        Ok(Task {
            id: row.get(0)?,
            title: row.get(1)?,
            description: row.get(2)?,
            status: row.get(3)?,
            priority: row.get(4)?,
            file_path: row.get(5)?,
            workspace_id: row.get(6)?,
            pr_branch: row.get(7)?,
            pr_url: row.get(8)?,
            pr_created_at: row.get(9)?,
            remote: row.get(10)?,
            is_merged: row.get::<_, i32>(11)? != 0,
            merge_source_branch: row.get(12)?,
            merged_at: row.get(13)?,
            diff_content: row.get(14)?,
            diff_captured_at: row.get(15)?,
            created_at: row.get(16)?,
            updated_at: row.get(17)?,
        })
    });

    match task {
        Ok(t) => Ok(Some(t)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn get_tasks_by_status(conn: &Connection, status: &str) -> Result<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, status, priority, file_path, workspace_id, pr_branch, pr_url, pr_created_at, remote, is_merged, merge_source_branch, merged_at, diff_content, diff_captured_at, created_at, updated_at 
         FROM tasks WHERE status = ?1 ORDER BY created_at DESC"
    )?;

    let tasks = stmt.query_map([status], |row| {
        Ok(Task {
            id: row.get(0)?,
            title: row.get(1)?,
            description: row.get(2)?,
            status: row.get(3)?,
            priority: row.get(4)?,
            file_path: row.get(5)?,
            workspace_id: row.get(6)?,
            pr_branch: row.get(7)?,
            pr_url: row.get(8)?,
            pr_created_at: row.get(9)?,
            remote: row.get(10)?,
            is_merged: row.get::<_, i32>(11)? != 0,
            merge_source_branch: row.get(12)?,
            merged_at: row.get(13)?,
            diff_content: row.get(14)?,
            diff_captured_at: row.get(15)?,
            created_at: row.get(16)?,
            updated_at: row.get(17)?,
        })
    })?;

    tasks.collect()
}

pub fn get_all_tasks(conn: &Connection) -> Result<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, status, priority, file_path, workspace_id, pr_branch, pr_url, pr_created_at, remote, is_merged, merge_source_branch, merged_at, diff_content, diff_captured_at, created_at, updated_at 
         FROM tasks ORDER BY created_at DESC"
    )?;

    let tasks = stmt.query_map([], |row| {
        Ok(Task {
            id: row.get(0)?,
            title: row.get(1)?,
            description: row.get(2)?,
            status: row.get(3)?,
            priority: row.get(4)?,
            file_path: row.get(5)?,
            workspace_id: row.get(6)?,
            pr_branch: row.get(7)?,
            pr_url: row.get(8)?,
            pr_created_at: row.get(9)?,
            remote: row.get(10)?,
            is_merged: row.get::<_, i32>(11)? != 0,
            merge_source_branch: row.get(12)?,
            merged_at: row.get(13)?,
            diff_content: row.get(14)?,
            diff_captured_at: row.get(15)?,
            created_at: row.get(16)?,
            updated_at: row.get(17)?,
        })
    })?;

    tasks.collect()
}

pub fn get_tasks_by_workspace(conn: &Connection, workspace_id: &str) -> Result<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, status, priority, file_path, workspace_id, pr_branch, pr_url, pr_created_at, remote, is_merged, merge_source_branch, merged_at, diff_content, diff_captured_at, created_at, updated_at 
         FROM tasks WHERE workspace_id = ?1 ORDER BY created_at DESC"
    )?;

    let tasks = stmt.query_map([workspace_id], |row| {
        Ok(Task {
            id: row.get(0)?,
            title: row.get(1)?,
            description: row.get(2)?,
            status: row.get(3)?,
            priority: row.get(4)?,
            file_path: row.get(5)?,
            workspace_id: row.get(6)?,
            pr_branch: row.get(7)?,
            pr_url: row.get(8)?,
            pr_created_at: row.get(9)?,
            remote: row.get(10)?,
            is_merged: row.get::<_, i32>(11)? != 0,
            merge_source_branch: row.get(12)?,
            merged_at: row.get(13)?,
            diff_content: row.get(14)?,
            diff_captured_at: row.get(15)?,
            created_at: row.get(16)?,
            updated_at: row.get(17)?,
        })
    })?;

    tasks.collect()
}

pub fn update_task_status(conn: &Connection, id: &str, status: &str) -> Result<()> {
    conn.execute(
        "UPDATE tasks SET status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        [status, id],
    )?;
    Ok(())
}

pub fn update_task_pr_info(
    conn: &Connection,
    id: &str,
    pr_branch: &str,
    pr_url: Option<&str>,
    remote: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE tasks SET pr_branch = ?1, pr_url = ?2, remote = ?3, pr_created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?4",
        params![pr_branch, pr_url, remote, id],
    )?;
    Ok(())
}

pub fn update_task_merge_info(
    conn: &Connection,
    id: &str,
    is_merged: bool,
    merge_source_branch: Option<&str>,
) -> Result<()> {
    let is_merged_i32 = if is_merged { 1 } else { 0 };
    conn.execute(
        "UPDATE tasks SET is_merged = ?1, merge_source_branch = ?2, merged_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        params![is_merged_i32, merge_source_branch, id],
    )?;
    Ok(())
}

pub fn update_task_diff_info(
    conn: &Connection,
    id: &str,
    diff_content: Option<&str>,
    diff_captured_at: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE tasks SET diff_content = ?1, diff_captured_at = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        params![diff_content, diff_captured_at, id],
    )?;
    Ok(())
}

pub fn delete_task(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM tasks WHERE id = ?1", [id])?;
    Ok(())
}

// ============== Engines ==============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Engine {
    pub id: i64,
    pub alias: String,
    pub binary_path: String,
    pub model: String,
    pub args: String,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateEngineRequest {
    pub alias: String,
    pub binary_path: String,
    pub model: String,
    pub args: String,
}

pub fn create_engine(conn: &Connection, engine: &CreateEngineRequest) -> Result<Engine> {
    conn.execute(
        "INSERT INTO engines (alias, binary_path, model, args) VALUES (?1, ?2, ?3, ?4)",
        [
            &engine.alias,
            &engine.binary_path,
            &engine.model,
            &engine.args,
        ],
    )?;

    let id = conn.last_insert_rowid();
    get_engine_by_id(conn, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn get_engine_by_id(conn: &Connection, id: i64) -> Result<Option<Engine>> {
    let mut stmt = conn.prepare(
        "SELECT id, alias, binary_path, model, args, enabled, created_at FROM engines WHERE id = ?1"
    )?;

    let engine = stmt.query_row([id], |row| {
        Ok(Engine {
            id: row.get(0)?,
            alias: row.get(1)?,
            binary_path: row.get(2)?,
            model: row.get(3)?,
            args: row.get(4)?,
            enabled: row.get::<_, i64>(5)? != 0,
            created_at: row.get(6)?,
        })
    });

    match engine {
        Ok(e) => Ok(Some(e)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn get_all_engines(conn: &Connection) -> Result<Vec<Engine>> {
    let mut stmt = conn.prepare(
        "SELECT id, alias, binary_path, model, args, enabled, created_at FROM engines ORDER BY alias"
    )?;

    let engines = stmt.query_map([], |row| {
        Ok(Engine {
            id: row.get(0)?,
            alias: row.get(1)?,
            binary_path: row.get(2)?,
            model: row.get(3)?,
            args: row.get(4)?,
            enabled: row.get::<_, i64>(5)? != 0,
            created_at: row.get(6)?,
        })
    })?;

    engines.collect()
}

pub fn update_engine_enabled(conn: &Connection, id: i64, enabled: bool) -> Result<()> {
    let enabled_i64 = if enabled { 1 } else { 0 };
    conn.execute(
        "UPDATE engines SET enabled = ?1 WHERE id = ?2",
        params![enabled_i64, id],
    )?;
    Ok(())
}

pub fn delete_engine(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM engines WHERE id = ?1", [id])?;
    Ok(())
}

// ============== Chat History ==============

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: i64,
    pub task_id: String,
    pub role: String,
    pub content: String,
    pub engine_alias: String,
    pub created_at: String,
}

pub fn create_chat_message(
    conn: &Connection,
    task_id: &str,
    role: &str,
    content: &str,
    engine_alias: &str,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO chat_history (task_id, role, content, engine_alias) VALUES (?1, ?2, ?3, ?4)",
        params![task_id, role, content, engine_alias],
    )?;

    Ok(conn.last_insert_rowid())
}

pub fn get_chat_history(conn: &Connection, task_id: &str) -> Result<Vec<ChatMessage>> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, role, content, engine_alias, created_at 
         FROM chat_history 
         WHERE task_id = ?1 
         ORDER BY created_at ASC",
    )?;

    let messages = stmt.query_map([task_id], |row| {
        Ok(ChatMessage {
            id: row.get(0)?,
            task_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            engine_alias: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;

    messages.collect()
}

pub fn clear_chat_history(conn: &Connection, task_id: &str) -> Result<()> {
    conn.execute("DELETE FROM chat_history WHERE task_id = ?1", [task_id])?;
    Ok(())
}

// ============== Workspaces ==============

#[derive(Debug, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub folder_path: String,
    pub is_active: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

pub fn create_workspace(
    conn: &Connection,
    id: &str,
    name: &str,
    folder_path: &str,
) -> Result<Workspace> {
    conn.execute(
        "INSERT INTO workspaces (id, name, folder_path, is_active, updated_at)
         VALUES (?1, ?2, ?3, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(folder_path) DO UPDATE SET
             name = excluded.name,
             is_active = 1,
             updated_at = CURRENT_TIMESTAMP",
        params![id, name, folder_path],
    )?;

    // Deactivate other workspaces
    conn.execute("UPDATE workspaces SET is_active = 0 WHERE id != ?1", [id])?;

    get_workspace_by_id(conn, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn get_workspace_by_id(conn: &Connection, id: &str) -> Result<Option<Workspace>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, folder_path, is_active, created_at, updated_at 
         FROM workspaces 
         WHERE id = ?1",
    )?;

    let workspace = stmt.query_row([id], |row| {
        Ok(Workspace {
            id: row.get(0)?,
            name: row.get(1)?,
            folder_path: row.get(2)?,
            is_active: row.get::<_, i32>(3)? != 0,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    });

    match workspace {
        Ok(w) => Ok(Some(w)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn get_all_workspaces(conn: &Connection) -> Result<Vec<Workspace>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, folder_path, is_active, created_at, updated_at 
         FROM workspaces 
         ORDER BY is_active DESC, updated_at DESC",
    )?;

    let workspaces = stmt.query_map([], |row| {
        Ok(Workspace {
            id: row.get(0)?,
            name: row.get(1)?,
            folder_path: row.get(2)?,
            is_active: row.get::<_, i32>(3)? != 0,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;

    workspaces.collect()
}

pub fn get_active_workspace(conn: &Connection) -> Result<Option<Workspace>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, folder_path, is_active, created_at, updated_at 
         FROM workspaces 
         WHERE is_active = 1
         LIMIT 1",
    )?;

    let workspace = stmt.query_row([], |row| {
        Ok(Workspace {
            id: row.get(0)?,
            name: row.get(1)?,
            folder_path: row.get(2)?,
            is_active: row.get::<_, i32>(3)? != 0,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    });

    match workspace {
        Ok(w) => Ok(Some(w)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn set_active_workspace(conn: &Connection, id: &str) -> Result<()> {
    // Deactivate all
    conn.execute("UPDATE workspaces SET is_active = 0", [])?;
    // Activate selected
    conn.execute(
        "UPDATE workspaces SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        [id],
    )?;
    Ok(())
}

pub fn delete_workspace(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM workspaces WHERE id = ?1", [id])?;
    Ok(())
}

// ============== Project Configs ==============

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub id: Option<i64>,
    pub workspace_id: String,
    pub md_persona: String,
    pub md_tech_stack: String,
    pub md_rules: String,
    pub md_tone: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

pub fn get_project_config(conn: &Connection, workspace_id: &str) -> Result<Option<ProjectConfig>> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, md_persona, md_tech_stack, md_rules, md_tone, created_at, updated_at 
         FROM project_configs 
         WHERE workspace_id = ?1"
    )?;

    let config = stmt.query_row([workspace_id], |row| {
        Ok(ProjectConfig {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            md_persona: row.get(2)?,
            md_tech_stack: row.get(3)?,
            md_rules: row.get(4)?,
            md_tone: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    });

    match config {
        Ok(c) => Ok(Some(c)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn save_project_config(conn: &Connection, config: &ProjectConfig) -> Result<()> {
    conn.execute(
        "INSERT INTO project_configs (workspace_id, md_persona, md_tech_stack, md_rules, md_tone, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
         ON CONFLICT(workspace_id) DO UPDATE SET
             md_persona = excluded.md_persona,
             md_tech_stack = excluded.md_tech_stack,
             md_rules = excluded.md_rules,
             md_tone = excluded.md_tone,
             updated_at = CURRENT_TIMESTAMP",
        params![
            &config.workspace_id,
            &config.md_persona,
            &config.md_tech_stack,
            &config.md_rules,
            &config.md_tone,
        ],
    )?;

    Ok(())
}
