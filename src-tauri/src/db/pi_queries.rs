use rusqlite::{params, Connection, Result};

/// Create a new Pi session record associated with a task.
pub fn create_session(conn: &Connection, task_id: &str, session_id: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO pi_sessions (id, task_id) VALUES (?1, ?2)",
        params![session_id, task_id],
    )?;
    Ok(())
}

/// Get the Pi session ID associated with a task, if one exists.
pub fn get_session_by_task(conn: &Connection, task_id: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT id FROM pi_sessions WHERE task_id = ?1")?;
    let result = stmt.query_row(params![task_id], |row| row.get(0));

    match result {
        Ok(id) => Ok(Some(id)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// Update the `updated_at` timestamp for a task's Pi session.
pub fn update_session_timestamp(conn: &Connection, task_id: &str) -> Result<()> {
    conn.execute(
        "UPDATE pi_sessions SET updated_at = CURRENT_TIMESTAMP WHERE task_id = ?1",
        params![task_id],
    )?;
    Ok(())
}

/// Set the base branch and task branch for a task.
pub fn set_task_branches(
    conn: &Connection,
    task_id: &str,
    base_branch: &str,
    task_branch: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE tasks SET base_branch = ?1, task_branch = ?2 WHERE id = ?3",
        params![base_branch, task_branch, task_id],
    )?;
    Ok(())
}

/// Get the base branch and task branch for a task, if set.
pub fn get_task_branches(conn: &Connection, task_id: &str) -> Result<Option<(String, String)>> {
    let mut stmt =
        conn.prepare("SELECT base_branch, task_branch FROM tasks WHERE id = ?1")?;
    let result = stmt.query_row(params![task_id], |row| {
        let base_branch: Option<String> = row.get(0)?;
        let task_branch: Option<String> = row.get(1)?;
        Ok((base_branch, task_branch))
    });

    match result {
        Ok((Some(base), Some(task))) => Ok(Some((base, task))),
        Ok(_) => Ok(None),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}
