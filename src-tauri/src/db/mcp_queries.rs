//! MCP (Model Context Protocol) database operations
//!
//! This module handles all database operations for MCP servers including:
//! - CRUD operations for MCP server configurations
//! - Runtime state management
//! - Tool call history tracking

use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// MCP Server configuration (persisted)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub transport_type: String,      // 'stdio', 'sse', 'http', 'websocket'
    pub config_json: String,         // Serialized transport configuration
    pub auth_type: Option<String>,   // 'oauth', 'api_key', 'bearer', 'none'
    pub auth_config: Option<String>, // Encrypted authentication data
    pub created_at: i64,
    pub updated_at: i64,
}

/// MCP Runtime state (volatile, can be cleared)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpRuntimeState {
    pub server_id: String,
    pub status: String, // 'connected', 'failed', 'needs_auth', 'disabled', 'connecting'
    pub tools_json: Option<String>,
    pub resources_json: Option<String>,
    pub last_error: Option<String>,
    pub connected_at: Option<i64>,
    pub disconnected_at: Option<i64>,
    pub updated_at: i64,
}

/// MCP Tool call record (for auditing/debugging)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolCall {
    pub id: i64,
    pub server_id: String,
    pub tool_name: String,
    pub arguments_json: Option<String>,
    pub result_json: Option<String>,
    pub error_message: Option<String>,
    pub duration_ms: Option<i64>,
    pub created_at: i64,
}

/// Transport configuration types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum McpTransportConfig {
    #[serde(rename = "stdio")]
    Stdio {
        command: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        env: HashMap<String, String>,
    },
    #[serde(rename = "sse")]
    Sse {
        url: String,
        #[serde(default)]
        headers: HashMap<String, String>,
    },
    #[serde(rename = "http")]
    Http {
        url: String,
        #[serde(default)]
        headers: HashMap<String, String>,
    },
    #[serde(rename = "websocket")]
    WebSocket {
        url: String,
        #[serde(default)]
        headers: HashMap<String, String>,
    },
}

/// Authentication configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum McpAuthConfig {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "api_key")]
    ApiKey { key: String, header: String },
    #[serde(rename = "bearer")]
    Bearer { token: String },
    #[serde(rename = "oauth")]
    OAuth {
        client_id: String,
        client_secret: Option<String>,
        token_url: String,
        #[serde(default)]
        access_token: Option<String>,
        #[serde(default)]
        refresh_token: Option<String>,
        #[serde(default)]
        expires_at: Option<i64>,
    },
}

// ============================================================================
// MCP Server Config CRUD Operations
// ============================================================================

/// Create a new MCP server configuration
pub fn create_mcp_server(conn: &Connection, config: &McpServerConfig) -> Result<()> {
    conn.execute(
        "INSERT INTO mcp_servers (
            id, workspace_id, name, description, enabled, transport_type,
            config_json, auth_type, auth_config, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        ON CONFLICT(workspace_id, name) DO UPDATE SET
            description = excluded.description,
            enabled = excluded.enabled,
            transport_type = excluded.transport_type,
            config_json = excluded.config_json,
            auth_type = excluded.auth_type,
            auth_config = excluded.auth_config,
            updated_at = excluded.updated_at",
        params![
            config.id,
            config.workspace_id,
            config.name,
            config.description,
            config.enabled as i64,
            config.transport_type,
            config.config_json,
            config.auth_type,
            config.auth_config,
            config.created_at,
            config.updated_at,
        ],
    )?;
    Ok(())
}

/// Get MCP server by ID
pub fn get_mcp_server(conn: &Connection, server_id: &str) -> Result<Option<McpServerConfig>> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, name, description, enabled, transport_type,
                config_json, auth_type, auth_config, created_at, updated_at
         FROM mcp_servers
         WHERE id = ?1",
    )?;

    let server = stmt
        .query_row(params![server_id], |row| {
            Ok(McpServerConfig {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                enabled: row.get::<_, i64>(4)? != 0,
                transport_type: row.get(5)?,
                config_json: row.get(6)?,
                auth_type: row.get(7)?,
                auth_config: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .optional()?;

    Ok(server)
}

/// Get MCP server by workspace and name
pub fn get_mcp_server_by_name(
    conn: &Connection,
    workspace_id: &str,
    name: &str,
) -> Result<Option<McpServerConfig>> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, name, description, enabled, transport_type,
                config_json, auth_type, auth_config, created_at, updated_at
         FROM mcp_servers
         WHERE workspace_id = ?1 AND name = ?2",
    )?;

    let server = stmt
        .query_row(params![workspace_id, name], |row| {
            Ok(McpServerConfig {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                enabled: row.get::<_, i64>(4)? != 0,
                transport_type: row.get(5)?,
                config_json: row.get(6)?,
                auth_type: row.get(7)?,
                auth_config: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .optional()?;

    Ok(server)
}

/// List all MCP servers for a workspace
pub fn list_mcp_servers(conn: &Connection, workspace_id: &str) -> Result<Vec<McpServerConfig>> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, name, description, enabled, transport_type,
                config_json, auth_type, auth_config, created_at, updated_at
         FROM mcp_servers
         WHERE workspace_id = ?1
         ORDER BY name",
    )?;

    let servers = stmt.query_map(params![workspace_id], |row| {
        Ok(McpServerConfig {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            name: row.get(2)?,
            description: row.get(3)?,
            enabled: row.get::<_, i64>(4)? != 0,
            transport_type: row.get(5)?,
            config_json: row.get(6)?,
            auth_type: row.get(7)?,
            auth_config: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
        })
    })?;

    servers.collect()
}

/// Update MCP server configuration
pub fn update_mcp_server(
    conn: &Connection,
    server_id: &str,
    updates: &HashMap<String, serde_json::Value>,
) -> Result<()> {
    // Collect string values to own them
    let mut name: Option<String> = None;
    let mut description: Option<String> = None;
    let mut enabled: Option<bool> = None;
    let mut transport_type: Option<String> = None;
    let mut config_json: Option<String> = None;
    let mut auth_type: Option<String> = None;
    let mut auth_config: Option<String> = None;

    for (key, value) in updates {
        match key.as_str() {
            "name" => name = value.as_str().map(String::from),
            "description" => description = value.as_str().map(String::from),
            "enabled" => enabled = value.as_bool(),
            "transport_type" => transport_type = value.as_str().map(String::from),
            "config_json" => config_json = value.as_str().map(String::from),
            "auth_type" => auth_type = value.as_str().map(String::from),
            "auth_config" => auth_config = value.as_str().map(String::from),
            _ => {} // Ignore unknown fields
        }
    }

    // Build query based on what fields are present
    let mut updates_made = false;

    if let Some(ref val) = name {
        conn.execute(
            "UPDATE mcp_servers SET name = ?, updated_at = ? WHERE id = ?",
            rusqlite::params![val, chrono::Utc::now().timestamp(), server_id],
        )?;
        updates_made = true;
    }

    if let Some(ref val) = description {
        conn.execute(
            "UPDATE mcp_servers SET description = ?, updated_at = ? WHERE id = ?",
            rusqlite::params![val, chrono::Utc::now().timestamp(), server_id],
        )?;
        updates_made = true;
    }

    if let Some(val) = enabled {
        conn.execute(
            "UPDATE mcp_servers SET enabled = ?, updated_at = ? WHERE id = ?",
            rusqlite::params![val as i64, chrono::Utc::now().timestamp(), server_id],
        )?;
        updates_made = true;
    }

    if let Some(ref val) = transport_type {
        conn.execute(
            "UPDATE mcp_servers SET transport_type = ?, updated_at = ? WHERE id = ?",
            rusqlite::params![val, chrono::Utc::now().timestamp(), server_id],
        )?;
        updates_made = true;
    }

    if let Some(ref val) = config_json {
        conn.execute(
            "UPDATE mcp_servers SET config_json = ?, updated_at = ? WHERE id = ?",
            rusqlite::params![val, chrono::Utc::now().timestamp(), server_id],
        )?;
        updates_made = true;
    }

    if let Some(ref val) = auth_type {
        conn.execute(
            "UPDATE mcp_servers SET auth_type = ?, updated_at = ? WHERE id = ?",
            rusqlite::params![val, chrono::Utc::now().timestamp(), server_id],
        )?;
        updates_made = true;
    }

    if let Some(ref val) = auth_config {
        conn.execute(
            "UPDATE mcp_servers SET auth_config = ?, updated_at = ? WHERE id = ?",
            rusqlite::params![val, chrono::Utc::now().timestamp(), server_id],
        )?;
        updates_made = true;
    }

    // If no specific updates were made but we need to update timestamp
    if !updates_made {
        conn.execute(
            "UPDATE mcp_servers SET updated_at = ? WHERE id = ?",
            rusqlite::params![chrono::Utc::now().timestamp(), server_id],
        )?;
    }

    Ok(())
}

/// Delete MCP server configuration
pub fn delete_mcp_server(conn: &Connection, server_id: &str) -> Result<()> {
    // Runtime state and tool calls will be deleted via CASCADE
    conn.execute("DELETE FROM mcp_servers WHERE id = ?1", params![server_id])?;
    Ok(())
}

// ============================================================================
// MCP Runtime State Operations
// ============================================================================

/// Update or insert runtime state
pub fn upsert_runtime_state(conn: &Connection, state: &McpRuntimeState) -> Result<()> {
    conn.execute(
        "INSERT INTO mcp_runtime (
            server_id, status, tools_json, resources_json, last_error,
            connected_at, disconnected_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(server_id) DO UPDATE SET
            status = excluded.status,
            tools_json = excluded.tools_json,
            resources_json = excluded.resources_json,
            last_error = excluded.last_error,
            connected_at = excluded.connected_at,
            disconnected_at = excluded.disconnected_at,
            updated_at = excluded.updated_at",
        params![
            state.server_id,
            state.status,
            state.tools_json,
            state.resources_json,
            state.last_error,
            state.connected_at,
            state.disconnected_at,
            state.updated_at,
        ],
    )?;
    Ok(())
}

/// Get runtime state for a server
pub fn get_runtime_state(conn: &Connection, server_id: &str) -> Result<Option<McpRuntimeState>> {
    let mut stmt = conn.prepare(
        "SELECT server_id, status, tools_json, resources_json, last_error,
                connected_at, disconnected_at, updated_at
         FROM mcp_runtime
         WHERE server_id = ?1",
    )?;

    let state = stmt
        .query_row(params![server_id], |row| {
            Ok(McpRuntimeState {
                server_id: row.get(0)?,
                status: row.get(1)?,
                tools_json: row.get(2)?,
                resources_json: row.get(3)?,
                last_error: row.get(4)?,
                connected_at: row.get(5)?,
                disconnected_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .optional()?;

    Ok(state)
}

/// Update server status
pub fn update_server_status(
    conn: &Connection,
    server_id: &str,
    status: &str,
    error: Option<&str>,
) -> Result<()> {
    let now = chrono::Utc::now().timestamp();

    match status {
        "connected" => {
            conn.execute(
                "INSERT INTO mcp_runtime (server_id, status, connected_at, updated_at)
                 VALUES (?1, ?2, ?3, ?3)
                 ON CONFLICT(server_id) DO UPDATE SET
                    status = excluded.status,
                    connected_at = excluded.connected_at,
                    disconnected_at = NULL,
                    last_error = NULL,
                    updated_at = excluded.updated_at",
                params![server_id, status, now],
            )?;
        }
        "failed" | "needs_auth" | "disabled" => {
            conn.execute(
                "INSERT INTO mcp_runtime (server_id, status, last_error, disconnected_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?4)
                 ON CONFLICT(server_id) DO UPDATE SET
                    status = excluded.status,
                    last_error = excluded.last_error,
                    disconnected_at = excluded.disconnected_at,
                    updated_at = excluded.updated_at",
                params![server_id, status, error, now],
            )?;
        }
        _ => {
            conn.execute(
                "INSERT INTO mcp_runtime (server_id, status, updated_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(server_id) DO UPDATE SET
                    status = excluded.status,
                    updated_at = excluded.updated_at",
                params![server_id, status, now],
            )?;
        }
    }

    Ok(())
}

/// Cache discovered tools for a server
pub fn cache_server_tools(conn: &Connection, server_id: &str, tools_json: &str) -> Result<()> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO mcp_runtime (server_id, tools_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(server_id) DO UPDATE SET
            tools_json = excluded.tools_json,
            updated_at = excluded.updated_at",
        params![server_id, tools_json, now],
    )?;
    Ok(())
}

/// Clear runtime state (e.g., on app shutdown)
pub fn clear_all_runtime_state(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM mcp_runtime", [])?;
    Ok(())
}

// ============================================================================
// MCP Tool Call History Operations
// ============================================================================

/// Record a tool call
pub fn record_tool_call(
    conn: &Connection,
    server_id: &str,
    tool_name: &str,
    arguments: Option<&str>,
    result: Option<&str>,
    error: Option<&str>,
    duration_ms: i64,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO mcp_tool_calls (
            server_id, tool_name, arguments_json, result_json, error_message, duration_ms
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![server_id, tool_name, arguments, result, error, duration_ms],
    )?;

    Ok(conn.last_insert_rowid())
}

/// Get recent tool calls for a server
pub fn get_recent_tool_calls(
    conn: &Connection,
    server_id: &str,
    limit: i64,
) -> Result<Vec<McpToolCall>> {
    let mut stmt = conn.prepare(
        "SELECT id, server_id, tool_name, arguments_json, result_json, 
                error_message, duration_ms, created_at
         FROM mcp_tool_calls
         WHERE server_id = ?1
         ORDER BY created_at DESC
         LIMIT ?2",
    )?;

    let calls = stmt.query_map(params![server_id, limit], |row| {
        Ok(McpToolCall {
            id: row.get(0)?,
            server_id: row.get(1)?,
            tool_name: row.get(2)?,
            arguments_json: row.get(3)?,
            result_json: row.get(4)?,
            error_message: row.get(5)?,
            duration_ms: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;

    calls.collect()
}

/// Clear old tool call history (keep last N days)
pub fn cleanup_tool_call_history(conn: &Connection, keep_days: i64) -> Result<usize> {
    let cutoff = chrono::Utc::now().timestamp() - (keep_days * 24 * 60 * 60);
    let count = conn.execute(
        "DELETE FROM mcp_tool_calls WHERE created_at < ?1",
        params![cutoff],
    )?;
    Ok(count)
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Generate a unique server ID
pub fn generate_server_id() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..16).map(|_| rng.gen()).collect();
    hex::encode(bytes)
}

/// Parse transport config JSON
pub fn parse_transport_config(json: &str) -> Result<McpTransportConfig, serde_json::Error> {
    serde_json::from_str(json)
}

/// Serialize transport config to JSON
pub fn serialize_transport_config(
    config: &McpTransportConfig,
) -> Result<String, serde_json::Error> {
    serde_json::to_string(config)
}

/// Parse auth config JSON
pub fn parse_auth_config(json: &str) -> Result<McpAuthConfig, serde_json::Error> {
    serde_json::from_str(json)
}

/// Serialize auth config to JSON
pub fn serialize_auth_config(config: &McpAuthConfig) -> Result<String, serde_json::Error> {
    serde_json::to_string(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();

        // Create tables
        conn.execute(
            "CREATE TABLE workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                folder_path TEXT NOT NULL
            )",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE mcp_servers (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                enabled INTEGER DEFAULT 1,
                transport_type TEXT NOT NULL,
                config_json TEXT NOT NULL,
                auth_type TEXT,
                auth_config TEXT,
                created_at INTEGER,
                updated_at INTEGER
            )",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE mcp_runtime (
                server_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                tools_json TEXT,
                resources_json TEXT,
                last_error TEXT,
                connected_at INTEGER,
                disconnected_at INTEGER,
                updated_at INTEGER
            )",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE mcp_tool_calls (
                id INTEGER PRIMARY KEY,
                server_id TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                arguments_json TEXT,
                result_json TEXT,
                error_message TEXT,
                duration_ms INTEGER,
                created_at INTEGER
            )",
            [],
        )
        .unwrap();

        // Insert test workspace
        conn.execute(
            "INSERT INTO workspaces (id, name, folder_path) VALUES ('ws1', 'Test', '/tmp')",
            [],
        )
        .unwrap();

        conn
    }

    #[test]
    fn test_create_and_get_server() {
        let conn = setup_test_db();

        let config = McpServerConfig {
            id: generate_server_id(),
            workspace_id: "ws1".to_string(),
            name: "test-server".to_string(),
            description: Some("Test MCP Server".to_string()),
            enabled: true,
            transport_type: "stdio".to_string(),
            config_json: r#"{"type":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/tmp"]}"#.to_string(),
            auth_type: None,
            auth_config: None,
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
        };

        create_mcp_server(&conn, &config).unwrap();

        let retrieved = get_mcp_server(&conn, &config.id).unwrap().unwrap();
        assert_eq!(retrieved.name, "test-server");
        assert_eq!(retrieved.transport_type, "stdio");
    }

    #[test]
    fn test_list_servers() {
        let conn = setup_test_db();

        for i in 0..3 {
            let config = McpServerConfig {
                id: generate_server_id(),
                workspace_id: "ws1".to_string(),
                name: format!("server-{}", i),
                description: None,
                enabled: true,
                transport_type: "stdio".to_string(),
                config_json: "{}".to_string(),
                auth_type: None,
                auth_config: None,
                created_at: chrono::Utc::now().timestamp(),
                updated_at: chrono::Utc::now().timestamp(),
            };
            create_mcp_server(&conn, &config).unwrap();
        }

        let servers = list_mcp_servers(&conn, "ws1").unwrap();
        assert_eq!(servers.len(), 3);
    }
}
