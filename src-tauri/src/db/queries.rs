use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

// ============== Tasks ==============

#[derive(Debug, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub file_path: Option<String>,
    pub project_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub file_path: Option<String>,
    pub project_id: Option<String>,
}

pub fn create_task(conn: &Connection, task: &CreateTaskRequest) -> Result<Task> {
    let id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO tasks (id, title, description, status, priority, file_path, project_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            &id,
            &task.title,
            task.description.as_ref(),
            &task.status,
            &task.priority,
            task.file_path.as_ref(),
            task.project_id.as_ref(),
        ],
    )?;

    get_task_by_id(conn, &id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn get_task_by_id(conn: &Connection, id: &str) -> Result<Option<Task>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, status, priority, file_path, project_id, created_at, updated_at 
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
            project_id: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
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
        "SELECT id, title, description, status, priority, file_path, project_id, created_at, updated_at 
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
            project_id: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;

    tasks.collect()
}

pub fn get_all_tasks(conn: &Connection) -> Result<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, status, priority, file_path, project_id, created_at, updated_at 
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
            project_id: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
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

pub fn delete_task(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM tasks WHERE id = ?1", [id])?;
    Ok(())
}

// ============== Engines ==============

#[derive(Debug, Serialize, Deserialize)]
pub struct Engine {
    pub id: i64,
    pub alias: String,
    pub binary_path: String,
    pub model: String,
    pub args: String,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
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

// ============== Project Configs ==============

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub id: Option<i64>,
    pub project_id: String,
    pub project_name: String,
    pub md_persona: String,
    pub md_tech_stack: String,
    pub md_rules: String,
    pub md_tone: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

pub fn get_project_config(conn: &Connection, project_id: &str) -> Result<Option<ProjectConfig>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, project_name, md_persona, md_tech_stack, md_rules, md_tone, created_at, updated_at 
         FROM project_configs 
         WHERE project_id = ?1"
    )?;

    let config = stmt.query_row([project_id], |row| {
        Ok(ProjectConfig {
            id: row.get(0)?,
            project_id: row.get(1)?,
            project_name: row.get(2)?,
            md_persona: row.get(3)?,
            md_tech_stack: row.get(4)?,
            md_rules: row.get(5)?,
            md_tone: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
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
        "INSERT INTO project_configs (project_id, project_name, md_persona, md_tech_stack, md_rules, md_tone, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)
         ON CONFLICT(project_id) DO UPDATE SET
             project_name = excluded.project_name,
             md_persona = excluded.md_persona,
             md_tech_stack = excluded.md_tech_stack,
             md_rules = excluded.md_rules,
             md_tone = excluded.md_tone,
             updated_at = CURRENT_TIMESTAMP",
        params![
            &config.project_id,
            &config.project_name,
            &config.md_persona,
            &config.md_tech_stack,
            &config.md_rules,
            &config.md_tone,
        ],
    )?;

    Ok(())
}
