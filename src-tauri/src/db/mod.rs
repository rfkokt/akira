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

    // Migration: Add PR columns to tasks table
    let has_pr_branch: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'pr_branch'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0)
        > 0;

    if !has_pr_branch {
        conn.execute("ALTER TABLE tasks ADD COLUMN pr_branch TEXT", [])?;
        conn.execute("ALTER TABLE tasks ADD COLUMN pr_url TEXT", [])?;
        conn.execute("ALTER TABLE tasks ADD COLUMN pr_created_at DATETIME", [])?;
        conn.execute("ALTER TABLE tasks ADD COLUMN remote TEXT", [])?;
    }

    let has_remote: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'remote'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0)
        > 0;

    if !has_remote {
        conn.execute("ALTER TABLE tasks ADD COLUMN remote TEXT", [])?;
    }

    // Migration: Add merge columns to tasks table
    let has_is_merged: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'is_merged'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0)
        > 0;

    if !has_is_merged {
        conn.execute(
            "ALTER TABLE tasks ADD COLUMN is_merged INTEGER DEFAULT 0",
            [],
        )?;
        conn.execute("ALTER TABLE tasks ADD COLUMN merge_source_branch TEXT", [])?;
        conn.execute("ALTER TABLE tasks ADD COLUMN merged_at DATETIME", [])?;
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
            id                  TEXT PRIMARY KEY,
            title               TEXT NOT NULL,
            description         TEXT,
            status              TEXT NOT NULL DEFAULT 'todo',
            priority            TEXT DEFAULT 'medium',
            file_path           TEXT,
            workspace_id        TEXT,
            pr_branch           TEXT,
            pr_url              TEXT,
            pr_created_at       DATETIME,
            remote              TEXT,
            is_merged           INTEGER DEFAULT 0,
            merge_source_branch TEXT,
            merged_at           DATETIME,
            created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
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

    // RTK history table - track token savings
    conn.execute(
        "CREATE TABLE IF NOT EXISTS rtk_history (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp       DATETIME DEFAULT CURRENT_TIMESTAMP,
            original_cmd    TEXT NOT NULL,
            rtk_cmd         TEXT NOT NULL,
            input_tokens    INTEGER NOT NULL,
            output_tokens   INTEGER NOT NULL,
            saved_tokens    INTEGER NOT NULL,
            savings_pct     REAL NOT NULL
        )",
        [],
    )?;

    // Create index for RTK history queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_rtk_timestamp ON rtk_history(timestamp)",
        [],
    )?;

    // Router sessions table - tracks AI agent sessions
    conn.execute(
        "CREATE TABLE IF NOT EXISTS router_sessions (
            id              TEXT PRIMARY KEY,
            task_id         TEXT NOT NULL,
            provider_alias  TEXT NOT NULL,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Router context table - stores conversation messages per session
    conn.execute(
        "CREATE TABLE IF NOT EXISTS router_context (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      TEXT NOT NULL,
            role            TEXT NOT NULL,
            content         TEXT NOT NULL,
            token_count     INTEGER,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES router_sessions(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Router cost tracking table - tracks usage per provider
    conn.execute(
        "CREATE TABLE IF NOT EXISTS router_cost_tracking (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_alias  TEXT NOT NULL,
            session_id      TEXT,
            task_id         TEXT,
            input_tokens    INTEGER NOT NULL DEFAULT 0,
            output_tokens   INTEGER NOT NULL DEFAULT 0,
            cost            REAL NOT NULL DEFAULT 0.0,
            model           TEXT,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Router config table - stores router settings
    conn.execute(
        "CREATE TABLE IF NOT EXISTS router_config (
            id                      INTEGER PRIMARY KEY CHECK (id = 1),
            auto_switch_enabled     INTEGER DEFAULT 1,
            token_limit_threshold   INTEGER DEFAULT 150000,
            fallback_order          TEXT DEFAULT 'claude,opencode,zai,gemini',
            updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Router switch history table - logs provider switches
    conn.execute(
        "CREATE TABLE IF NOT EXISTS router_switch_history (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id         TEXT NOT NULL,
            from_provider   TEXT NOT NULL,
            to_provider     TEXT NOT NULL,
            reason          TEXT NOT NULL,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Create indexes for router tables
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_router_sessions_task ON router_sessions(task_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_router_context_session ON router_context(session_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_router_cost_provider ON router_cost_tracking(provider_alias)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_router_cost_task ON router_cost_tracking(task_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_router_switch_task ON router_switch_history(task_id)",
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
        (
            "opencode",
            "/Users/rifkioktapratama/.opencode/bin/opencode",
            "",
            "--format json run",
        ),
    ];

    for (alias, binary, model, args) in defaults {
        conn.execute(
            "INSERT OR IGNORE INTO engines (alias, binary_path, model, args) VALUES (?1, ?2, ?3, ?4)",
            [alias, binary, model, args],
        )?;
    }

    Ok(())
}
