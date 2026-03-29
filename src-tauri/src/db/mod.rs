use rusqlite::{Connection, Result};
use std::path::PathBuf;

pub mod queries;

/// Initialize database with all required tables
pub fn init_db(app_dir: &PathBuf) -> Result<Connection> {
    let db_path = app_dir.join("korlap-x.db");
    let conn = Connection::open(db_path)?;
    
    create_tables(&conn)?;
    run_migrations(&conn)?;
    
    Ok(conn)
}

fn run_migrations(conn: &Connection) -> Result<()> {
    // Migration: Add model column to engines table if it doesn't exist
    conn.execute(
        "ALTER TABLE engines ADD COLUMN model TEXT DEFAULT ''",
        [],
    ).ok(); // Ignore error if column already exists
    
    Ok(())
}

fn create_tables(conn: &Connection) -> Result<()> {
    // Tasks table - Kanban board
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tasks (
            id              TEXT PRIMARY KEY,
            title           TEXT NOT NULL,
            description     TEXT,
            status          TEXT NOT NULL DEFAULT 'todo',
            priority        TEXT DEFAULT 'medium',
            file_path       TEXT,
            project_id      TEXT,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
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
            project_id      TEXT NOT NULL UNIQUE,
            project_name    TEXT NOT NULL,
            md_persona      TEXT,
            md_tech_stack   TEXT,
            md_rules        TEXT,
            md_tone         TEXT,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
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
        "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)",
        [],
    )?;
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)",
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
        ("claude", "claude", "claude-3-5-sonnet-20241022", "--dangerously-skip-permissions"),
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
