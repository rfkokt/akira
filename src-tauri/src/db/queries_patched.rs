pub fn get_task_by_id(conn: &Connection, id: &str) -> Result<Option<Task>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, status, priority, file_path, workspace_id, 
                worktree_path, task_branch, base_branch, pr_branch, pr_url, pr_created_at, 
                remote, is_merged, merge_source_branch, merged_to_branch, merged_at, 
                diff_content, diff_captured_at, created_at, updated_at 
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
            worktree_path: row.get(7)?,
            task_branch: row.get(8)?,
            base_branch: row.get(9)?,
            pr_branch: row.get(10)?,
            pr_url: row.get(11)?,
            pr_created_at: row.get(12)?,
            remote: row.get(13)?,
            is_merged: row.get::<_, i32>(14)? != 0,
            merge_source_branch: row.get(15)?,
            merged_to_branch: row.get(16)?,
            merged_at: row.get(17)?,
            diff_content: row.get(18)?,
            diff_captured_at: row.get(19)?,
            created_at: row.get(20)?,
            updated_at: row.get(21)?,
        })
    });

    match task {
        Ok(t) => Ok(Some(t)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn update_task_worktree(conn: &Connection, id: &str, worktree_path: &str, task_branch: &str, base_branch: &str) -> Result<()> {
    conn.execute(
        "UPDATE tasks SET worktree_path = ?1, task_branch = ?2, base_branch = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?4",
        params![worktree_path, task_branch, base_branch, id],
    )?;
    Ok(())
}
