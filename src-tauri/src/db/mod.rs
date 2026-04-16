use rusqlite::{Connection, Result};
use std::path::PathBuf;

pub mod mcp_queries;
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

    // Migration: Add merged_to_branch column
    let has_merged_to_branch: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'merged_to_branch'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0)
        > 0;

    if !has_merged_to_branch {
        conn.execute("ALTER TABLE tasks ADD COLUMN merged_to_branch TEXT", [])?;
    }

    // Migration: Add worktree columns to tasks table
    let has_worktree_path: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'worktree_path'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0)
        > 0;

    if !has_worktree_path {
        conn.execute("ALTER TABLE tasks ADD COLUMN worktree_path TEXT", [])?;
        conn.execute("ALTER TABLE tasks ADD COLUMN task_branch TEXT", [])?;
        conn.execute(
            "ALTER TABLE tasks ADD COLUMN base_branch TEXT DEFAULT 'main'",
            [],
        )?;
    }

    // Migration: Add diff columns to tasks table
    let has_diff_content: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'diff_content'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0)
        > 0;

    if !has_diff_content {
        conn.execute("ALTER TABLE tasks ADD COLUMN diff_content TEXT", [])?;
        conn.execute("ALTER TABLE tasks ADD COLUMN diff_captured_at DATETIME", [])?;
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

    // Migration: Add git_token column to project_configs table
    conn.execute("ALTER TABLE project_configs ADD COLUMN git_token TEXT", [])
        .ok(); // Ignore error if column already exists

    // Migration: Add google_api_key column to project_configs table
    conn.execute(
        "ALTER TABLE project_configs ADD COLUMN google_api_key TEXT",
        [],
    )
    .ok(); // Ignore error if column already exists

    // Migration: Add groq_api_key column to project_configs table
    conn.execute(
        "ALTER TABLE project_configs ADD COLUMN groq_api_key TEXT",
        [],
    )
    .ok(); // Ignore error if column already exists

    // Migration: Upgrade project_mcps table for full MCP support
    upgrade_mcps_table(conn)?;

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
            merged_to_branch    TEXT,
            merged_at           DATETIME,
            diff_content        TEXT,
            diff_captured_at    DATETIME,
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
            git_token       TEXT,
            google_api_key  TEXT,
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

    // MCP Servers table (per workspace/project)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS mcp_servers (
            id              TEXT PRIMARY KEY,
            workspace_id    TEXT NOT NULL,
            name            TEXT NOT NULL,
            description     TEXT,
            enabled         INTEGER DEFAULT 1,
            transport_type  TEXT NOT NULL, -- 'stdio', 'sse', 'http', 'websocket'
            config_json     TEXT NOT NULL, -- serialized transport config
            auth_type       TEXT,          -- 'oauth', 'api_key', 'bearer', 'none'
            auth_config     TEXT,          -- encrypted auth data (optional)
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
            UNIQUE(workspace_id, name)
        )",
        [],
    )?;

    // MCP Runtime state (volatile, in-memory can be cleared)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS mcp_runtime (
            server_id       TEXT PRIMARY KEY,
            status          TEXT NOT NULL, -- 'connected', 'failed', 'needs_auth', 'disabled', 'connecting'
            tools_json      TEXT,          -- cached tools from server
            resources_json  TEXT,          -- cached resources (if any)
            last_error      TEXT,
            connected_at    DATETIME,
            disconnected_at DATETIME,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // MCP Tool execution history (for debugging/auditing)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS mcp_tool_calls (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id       TEXT NOT NULL,
            tool_name       TEXT NOT NULL,
            arguments_json  TEXT,
            result_json     TEXT,
            error_message   TEXT,
            duration_ms     INTEGER,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
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
        "CREATE INDEX IF NOT EXISTS idx_mcps_workspace ON mcp_servers(workspace_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_mcps_enabled ON mcp_servers(enabled)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_server ON mcp_tool_calls(server_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_time ON mcp_tool_calls(created_at)",
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
            confirm_before_switch  INTEGER DEFAULT 0,
            token_limit_threshold   INTEGER DEFAULT 150000,
            fallback_order          TEXT DEFAULT 'claude,opencode,zai,gemini',
            budget_limit           REAL DEFAULT 0,
            budget_alert_threshold REAL DEFAULT 0.8,
            updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Add confirm_before_switch column if it doesn't exist (for existing installations)
    conn.execute(
        "ALTER TABLE router_config ADD COLUMN confirm_before_switch INTEGER DEFAULT 0",
        [],
    )
    .ok();

    // Add budget columns if they don't exist (for existing installations)
    conn.execute(
        "ALTER TABLE router_config ADD COLUMN budget_limit REAL DEFAULT 0",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE router_config ADD COLUMN budget_alert_threshold REAL DEFAULT 0.8",
        [],
    )
    .ok();

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

    // Skills table - stores installed skills per workspace
    conn.execute(
        "CREATE TABLE IF NOT EXISTS skills (
            id              TEXT PRIMARY KEY,
            workspace_id    TEXT NOT NULL,
            name            TEXT NOT NULL,
            description     TEXT,
            owner           TEXT NOT NULL,
            repo            TEXT NOT NULL,
            version         TEXT,
            skill_path      TEXT NOT NULL,
            installed_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_skills_workspace ON skills(workspace_id)",
        [],
    )?;

    Ok(())
}

/// Upgrade project_mcps table to new mcp_servers schema
fn upgrade_mcps_table(conn: &Connection) -> Result<()> {
    // Check if old project_mcps table exists
    let old_table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='project_mcps'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0)
        > 0;

    if old_table_exists {
        // Check if new mcp_servers table already exists
        let new_table_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='mcp_servers'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0)
            > 0;

        if !new_table_exists {
            // Create new tables first
            conn.execute(
                "CREATE TABLE mcp_servers (
                    id              TEXT PRIMARY KEY,
                    workspace_id    TEXT NOT NULL,
                    name            TEXT NOT NULL,
                    description     TEXT,
                    enabled         INTEGER DEFAULT 1,
                    transport_type  TEXT NOT NULL,
                    config_json     TEXT NOT NULL,
                    auth_type       TEXT,
                    auth_config     TEXT,
                    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    UNIQUE(workspace_id, name)
                )",
                [],
            )?;

            conn.execute(
                "CREATE TABLE mcp_runtime (
                    server_id       TEXT PRIMARY KEY,
                    status          TEXT NOT NULL,
                    tools_json      TEXT,
                    resources_json  TEXT,
                    last_error      TEXT,
                    connected_at    DATETIME,
                    disconnected_at DATETIME,
                    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
                )",
                [],
            )?;

            conn.execute(
                "CREATE TABLE mcp_tool_calls (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    server_id       TEXT NOT NULL,
                    tool_name       TEXT NOT NULL,
                    arguments_json  TEXT,
                    result_json     TEXT,
                    error_message   TEXT,
                    duration_ms     INTEGER,
                    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
                )",
                [],
            )?;

            // Migrate data from old table
            conn.execute(
                "INSERT INTO mcp_servers (id, workspace_id, name, enabled, transport_type, config_json, created_at, updated_at)
                 SELECT 
                    lower(hex(randomblob(16))),
                    project_id,
                    alias,
                    enabled,
                    transport,
                    json_object(
                        CASE 
                            WHEN transport = 'stdio' THEN 'command'
                            ELSE 'url'
                        END,
                        CASE 
                            WHEN transport = 'stdio' THEN command
                            ELSE url
                        END,
                        'args', '[]',
                        'env', env_vars
                    ),
                    added_at,
                    added_at
                 FROM project_mcps",
                [],
            ).ok();

            // Create indexes
            conn.execute(
                "CREATE INDEX idx_mcps_workspace ON mcp_servers(workspace_id)",
                [],
            )
            .ok();
            conn.execute("CREATE INDEX idx_mcps_enabled ON mcp_servers(enabled)", [])
                .ok();
            conn.execute(
                "CREATE INDEX idx_mcp_tool_calls_server ON mcp_tool_calls(server_id)",
                [],
            )
            .ok();
            conn.execute(
                "CREATE INDEX idx_mcp_tool_calls_time ON mcp_tool_calls(created_at)",
                [],
            )
            .ok();

            // Drop old table
            conn.execute("DROP TABLE project_mcps", []).ok();
        }
    }

    Ok(())
}

/// Insert default engines (optional - for demo)
pub fn seed_default_engines(conn: &Connection) -> Result<()> {
    let defaults = vec![
        ("ollama", "ollama", "llama3.2", "run", 1),
        (
            "claude",
            "claude",
            "claude-3-5-sonnet-20241022",
            "--dangerously-skip-permissions",
            1,
        ),
        (
            "opencode",
            "/Users/rifkioktapratama/.opencode/bin/opencode",
            "",
            "--format json run",
            1,
        ),
        ("gemini", "gemini", "gemini-2.5-pro", "--yolo", 1),
    ];

    for (alias, binary, model, args, enabled) in defaults {
        conn.execute(
            "INSERT OR REPLACE INTO engines (alias, binary_path, model, args, enabled) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![alias, binary, model, args, enabled],
        )?;
    }

    Ok(())
}
