use rusqlite::{Connection, Result};
use std::path::PathBuf;

pub mod queries;

/// Initialize database with all required tables
pub fn init_db(app_dir: &PathBuf) -> Result<Connection> {
    let db_path = app_dir.join("akira.db");
    let conn = Connection::open(db_path)?;

    create_tables(&conn)?;
    run_migrations(&conn)?;

    Ok(conn)
}

fn run_migrations(conn: &Connection) -> Result<()> {
    // Migration: Add model column to engines table if it doesn't exist
    conn.execute("ALTER TABLE engines ADD COLUMN model TEXT DEFAULT ''", [])
        .ok(); // Ignore error if column already exists

    // Migration: Handle tasks table schema change
    // Check if old table exists with project_id column
    let has_project_id: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'project_id'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0)
        > 0;

    if has_project_id {
        // Old table exists, need to migrate
        // Rename old table
        conn.execute("ALTER TABLE tasks RENAME TO tasks_old", [])?;

        // Create new table with correct schema
        conn.execute(
            "CREATE TABLE tasks (
                id              TEXT PRIMARY KEY,
                title           TEXT NOT NULL,
                description     TEXT,
                status          TEXT NOT NULL DEFAULT 'todo',
                priority        TEXT DEFAULT 'medium',
                file_path       TEXT,
                workspace_id    TEXT,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Copy data from old table, converting project_id to workspace_id
        conn.execute(
            "INSERT INTO tasks (id, title, description, status, priority, file_path, workspace_id, created_at, updated_at)
             SELECT id, title, description, status, priority, file_path, project_id, created_at, updated_at FROM tasks_old",
            [],
        ).ok();

        // Drop old table
        conn.execute("DROP TABLE tasks_old", [])?;
    }

    // Migration: Handle project_configs table schema change
    let has_project_id_config: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('project_configs') WHERE name = 'project_id'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0)
        > 0;

    if has_project_id_config {
        // Old table exists, need to migrate
        conn.execute(
            "ALTER TABLE project_configs RENAME TO project_configs_old",
            [],
        )?;

        conn.execute(
            "CREATE TABLE project_configs (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id    TEXT NOT NULL UNIQUE,
                md_persona      TEXT,
                md_tech_stack   TEXT,
                md_rules        TEXT,
                md_tone         TEXT,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute(
            "INSERT INTO project_configs (id, workspace_id, md_persona, md_tech_stack, md_rules, md_tone, created_at, updated_at)
             SELECT id, project_id, md_persona, md_tech_stack, md_rules, md_tone, created_at, updated_at FROM project_configs_old",
            [],
        ).ok();

        conn.execute("DROP TABLE project_configs_old", [])?;
    }

    Ok(())
}

fn create_tables(conn: &Connection) -> Result<()> {
    // Workspaces table - NEW
    conn.execute(
        "CREATE TABLE IF NOT EXISTS workspaces (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            folder_path     TEXT NOT NULL UNIQUE,
            is_active       INTEGER DEFAULT 0,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Tasks table - Kanban board (updated: workspace_id instead of project_id)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tasks (
            id              TEXT PRIMARY KEY,
            title           TEXT NOT NULL,
            description     TEXT,
            status          TEXT NOT NULL DEFAULT 'todo',
            priority        TEXT DEFAULT 'medium',
            file_path       TEXT,
            workspace_id    TEXT,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Engines table - CLI binary registrations
    conn.execute(
        "CREATE TABLE IF NOT EXISTS engines (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            alias           TEXT NOT NULL UNIQUE,
            binary_path     TEXT NOT NULL,
            model           TEXT DEFAULT '',
            args            TEXT DEFAULT '',
            enabled         INTEGER DEFAULT 1,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Chat history table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS chat_history (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id         TEXT,
            role            TEXT NOT NULL,
            content         TEXT NOT NULL,
            engine_alias    TEXT,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Project configs table - PIC (Project Intelligence Config)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS project_configs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            workspace_id    TEXT NOT NULL UNIQUE,
            md_persona      TEXT,
            md_tech_stack   TEXT,
            md_rules        TEXT,
            md_tone         TEXT,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Project skills table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS project_skills (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id      TEXT NOT NULL,
            skill_name      TEXT NOT NULL,
            skill_owner     TEXT NOT NULL,
            skill_path      TEXT NOT NULL,
            enabled         INTEGER DEFAULT 1,
            sort_order      INTEGER DEFAULT 0,
            installed_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_id, skill_owner, skill_name)
        )",
        [],
    )?;

    // Project MCPs table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS project_mcps (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id      TEXT NOT NULL,
            alias           TEXT NOT NULL,
            transport       TEXT NOT NULL,
            command         TEXT,
            url             TEXT,
            env_vars        TEXT,
            enabled         INTEGER DEFAULT 1,
            added_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_id, alias)
        )",
        [],
    )?;

    // App settings table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key             TEXT PRIMARY KEY,
            value           TEXT NOT NULL,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Create indexes for performance
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workspaces_active ON workspaces(is_active)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_chat_task ON chat_history(task_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_skills_project ON project_skills(project_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_mcps_project ON project_mcps(project_id)",
        [],
    )?;

    Ok(())
}

/// Insert default engines (optional - for demo)
pub fn seed_default_engines(conn: &Connection) -> Result<()> {
    let defaults = vec![
        ("ollama", "ollama", "llama3.2", "run"),
        (
            "claude",
            "claude",
            "claude-3-5-sonnet-20241022",
            "--dangerously-skip-permissions",
        ),
        ("opencode", "opencode", "", ""),
    ];

    for (alias, binary, model, args) in defaults {
        conn.execute(
            "INSERT OR IGNORE INTO engines (alias, binary_path, model, args) VALUES (?1, ?2, ?3, ?4)",
            [alias, binary, model, args],
        )?;
    }

    Ok(())
}
