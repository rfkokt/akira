//! Tauri commands for MCP (Model Context Protocol) operations
//!
//! These commands are exposed to the frontend for managing MCP servers.

use super::*;
use crate::db::mcp_queries;
use tauri::{AppHandle, Manager};

/// Add a new MCP server
#[tauri::command]
pub async fn mcp_add_server(
    app: AppHandle,
    request: AddMcpServerRequest,
) -> Result<String, String> {
    let state = app.state::<crate::AppState>();
    let db = state.db.lock().unwrap();
    let conn = &*db;

    // Validate server name (no spaces, alphanumeric + dash/underscore)
    if !request.name.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err("Server name must be alphanumeric with dashes or underscores only".to_string());
    }

    // Check if server with same name already exists in workspace
    if mcp_queries::get_mcp_server_by_name(conn, &request.workspace_id, &request.name)
        .map_err(|e| e.to_string())?
        .is_some()
    {
        return Err(format!("Server '{}' already exists in this workspace", request.name));
    }

    // Generate server ID
    let server_id = mcp_queries::generate_server_id();

    // Serialize transport config
    let transport_json = match &request.transport {
        McpTransport::Stdio { ref command, ref args, ref env } => {
            serde_json::json!({
                "type": "stdio",
                "command": command,
                "args": args,
                "env": env,
            })
        }
        McpTransport::Sse { ref url, ref headers } => {
            serde_json::json!({
                "type": "sse",
                "url": url,
                "headers": headers,
            })
        }
        McpTransport::Http { ref url, ref headers } => {
            serde_json::json!({
                "type": "http",
                "url": url,
                "headers": headers,
            })
        }
    };

    // Serialize auth config
    let (auth_type, auth_json) = match &request.auth {
        Some(McpAuth::None) | None => (None::<String>, None::<String>),
        Some(McpAuth::ApiKey { key, header }) => {
            let auth_json = serde_json::json!({
                "type": "api_key",
                "key": key,
                "header": header,
            });
            (Some("api_key".to_string()), Some(auth_json.to_string()))
        }
        Some(McpAuth::Bearer { token }) => {
            let auth_json = serde_json::json!({
                "type": "bearer",
                "token": token,
            });
            (Some("bearer".to_string()), Some(auth_json.to_string()))
        }
        Some(McpAuth::OAuth { client_id, client_secret, token_url }) => {
            let auth_json = serde_json::json!({
                "type": "oauth",
                "client_id": client_id,
                "client_secret": client_secret,
                "token_url": token_url,
            });
            (Some("oauth".to_string()), Some(auth_json.to_string()))
        }
    };

    let now = chrono::Utc::now().timestamp();
    let config = mcp_queries::McpServerConfig {
        id: server_id.clone(),
        workspace_id: request.workspace_id,
        name: request.name,
        description: request.description,
        enabled: true,
        transport_type: match &request.transport {
            McpTransport::Stdio { .. } => "stdio",
            McpTransport::Sse { .. } => "sse",
            McpTransport::Http { .. } => "http",
        }.to_string(),
        config_json: transport_json.to_string(),
        auth_type,
        auth_config: auth_json,
        created_at: now,
        updated_at: now,
    };

    mcp_queries::create_mcp_server(conn, &config).map_err(|e| e.to_string())?;

    // Initialize runtime state as 'disabled' (will be connected on demand)
    mcp_queries::update_server_status(conn, &server_id, "disabled", None)
        .map_err(|e| e.to_string())?;

    Ok(server_id)
}

/// List all MCP servers for a workspace
#[tauri::command]
pub async fn mcp_list_servers(
    app: AppHandle,
    workspace_id: String,
) -> Result<Vec<McpServerDto>, String> {
    let state = app.state::<crate::AppState>();
    let db = state.db.lock().unwrap();
    let conn = &*db;

    let servers = mcp_queries::list_mcp_servers(conn, &workspace_id).map_err(|e| e.to_string())?;

    let mut dtos = Vec::new();
    for server in servers {
        // Get runtime state
        let runtime = mcp_queries::get_runtime_state(conn, &server.id).map_err(|e| e.to_string())?;

        let (status, error, tools) = match runtime {
            Some(rt) => {
                let tools = rt.tools_json
                    .and_then(|json| serde_json::from_str::<Vec<McpTool>>(&json).ok())
                    .unwrap_or_default();
                (rt.status, rt.last_error, tools)
            }
            None => ("disabled".to_string(), None, Vec::new()),
        };

        dtos.push(McpServerDto {
            id: server.id,
            workspace_id: server.workspace_id,
            name: server.name,
            description: server.description,
            enabled: server.enabled,
            transport_type: server.transport_type,
            status,
            tools,
            error,
            created_at: server.created_at,
            updated_at: server.updated_at,
        });
    }

    Ok(dtos)
}

/// Get a single MCP server by ID
#[tauri::command]
pub async fn mcp_get_server(
    app: AppHandle,
    server_id: String,
) -> Result<McpServerDto, String> {
    let state = app.state::<crate::AppState>();
    let db = state.db.lock().unwrap();
    let conn = &*db;

    let server = mcp_queries::get_mcp_server(conn, &server_id)
        .map_err(|e| e.to_string())?
        .ok_or("Server not found")?;

    let runtime = mcp_queries::get_runtime_state(conn, &server_id).map_err(|e| e.to_string())?;

    let (status, error, tools) = match runtime {
        Some(rt) => {
            let tools = rt.tools_json
                .and_then(|json| serde_json::from_str::<Vec<McpTool>>(&json).ok())
                .unwrap_or_default();
            (rt.status, rt.last_error, tools)
        }
        None => ("disabled".to_string(), None, Vec::new()),
    };

    Ok(McpServerDto {
        id: server.id,
        workspace_id: server.workspace_id,
        name: server.name,
        description: server.description,
        enabled: server.enabled,
        transport_type: server.transport_type,
        status,
        tools,
        error,
        created_at: server.created_at,
        updated_at: server.updated_at,
    })
}

/// Update an MCP server configuration
#[tauri::command]
pub async fn mcp_update_server(
    app: AppHandle,
    request: UpdateMcpServerRequest,
) -> Result<(), String> {
    let state = app.state::<crate::AppState>();
    let db = state.db.lock().unwrap();
    let conn = &*db;

    let mut updates = std::collections::HashMap::new();

    if let Some(name) = request.name {
        updates.insert("name".to_string(), serde_json::json!(name));
    }

    if let Some(description) = request.description {
        updates.insert("description".to_string(), serde_json::json!(description));
    }

    if let Some(enabled) = request.enabled {
        updates.insert("enabled".to_string(), serde_json::json!(enabled));
    }

    if let Some(transport) = request.transport {
        let transport_json = match transport {
            McpTransport::Stdio { ref command, ref args, ref env } => {
                serde_json::json!({
                    "type": "stdio",
                    "command": command,
                    "args": args,
                    "env": env,
                })
            }
            McpTransport::Sse { ref url, ref headers } => {
                serde_json::json!({
                    "type": "sse",
                    "url": url,
                    "headers": headers,
                })
            }
            McpTransport::Http { ref url, ref headers } => {
                serde_json::json!({
                    "type": "http",
                    "url": url,
                    "headers": headers,
                })
            }
        };
        updates.insert("config_json".to_string(), transport_json);
        updates.insert(
            "transport_type".to_string(),
            serde_json::json!(match transport {
                McpTransport::Stdio { .. } => "stdio",
                McpTransport::Sse { .. } => "sse",
                McpTransport::Http { .. } => "http",
            }),
        );
    }

    if let Some(auth) = request.auth {
        let (auth_type, auth_json) = match auth {
            McpAuth::None => (None, None),
            McpAuth::ApiKey { key, header } => {
                let auth_json = serde_json::json!({
                    "type": "api_key",
                    "key": key,
                    "header": header,
                });
                (Some("api_key".to_string()), Some(auth_json.to_string()))
            }
            McpAuth::Bearer { token } => {
                let auth_json = serde_json::json!({
                    "type": "bearer",
                    "token": token,
                });
                (Some("bearer".to_string()), Some(auth_json.to_string()))
            }
            McpAuth::OAuth { client_id, client_secret, token_url } => {
                let auth_json = serde_json::json!({
                    "type": "oauth",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "token_url": token_url,
                });
                (Some("oauth".to_string()), Some(auth_json.to_string()))
            }
        };
        if let Some(auth_type) = auth_type {
            updates.insert("auth_type".to_string(), serde_json::json!(auth_type));
        }
        if let Some(auth_json) = auth_json {
            updates.insert("auth_config".to_string(), serde_json::json!(auth_json));
        }
    }

    if !updates.is_empty() {
        mcp_queries::update_mcp_server(conn, &request.server_id, &updates)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Delete an MCP server
#[tauri::command]
pub async fn mcp_delete_server(
    app: AppHandle,
    server_id: String,
) -> Result<(), String> {
    let state = app.state::<crate::AppState>();
    let db = state.db.lock().unwrap();
    let conn = &*db;

    mcp_queries::delete_mcp_server(conn, &server_id).map_err(|e| e.to_string())?;

    Ok(())
}

/// Connect to an MCP server
#[tauri::command]
pub async fn mcp_connect_server(
    app: AppHandle,
    server_id: String,
) -> Result<Vec<McpTool>, String> {
    let state = app.state::<crate::AppState>();
    let db = state.db.lock().unwrap();
    let conn = &*db;

    // Get server config
    let server = mcp_queries::get_mcp_server(conn, &server_id)
        .map_err(|e| e.to_string())?
        .ok_or("Server not found")?;

    if !server.enabled {
        return Err("Server is disabled".to_string());
    }

    // Update status to connecting
    mcp_queries::update_server_status(conn, &server_id, "connecting", None)
        .map_err(|e| e.to_string())?;

    // Fallback: Simple connection test
    // Parse transport config
    let transport_config: serde_json::Value = serde_json::from_str(&server.config_json)
        .map_err(|e| format!("Invalid transport config: {}", e))?;

    // Test transport creation
    match transport::create_transport(&server.transport_type, &transport_config) {
        Ok(_) => {
            // For now, just mark as failed since full connection isn't implemented
            // In the real implementation, this would actually connect
            let error_msg = "Full MCP connection not yet implemented. Transport created successfully but protocol handshake pending.";
            mcp_queries::update_server_status(conn, &server_id, "failed", Some(error_msg))
                .map_err(|e| e.to_string())?;
            Err(error_msg.to_string())
        }
        Err(e) => {
            let error_msg = format!("Failed to create transport: {}", e);
            mcp_queries::update_server_status(conn, &server_id, "failed", Some(&error_msg))
                .map_err(|e| e.to_string())?;
            Err(error_msg)
        }
    }
}

/// Disconnect from an MCP server
#[tauri::command]
pub async fn mcp_disconnect_server(
    app: AppHandle,
    server_id: String,
) -> Result<(), String> {
    let state = app.state::<crate::AppState>();
    let db = state.db.lock().unwrap();
    let conn = &*db;

    // Update status to disabled
    mcp_queries::update_server_status(conn, &server_id, "disabled", None)
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Test connection to an MCP server (without saving)
#[tauri::command]
pub async fn mcp_test_connection(
    _app: AppHandle,
    transport: McpTransport,
    _auth: Option<McpAuth>,
) -> Result<serde_json::Value, String> {
    // Serialize transport config
    let (transport_type, config) = match transport {
        McpTransport::Stdio { ref command, ref args, ref env } => {
            ("stdio", serde_json::json!({
                "type": "stdio",
                "command": command,
                "args": args,
                "env": env,
            }))
        }
        McpTransport::Sse { ref url, ref headers } => {
            ("sse", serde_json::json!({
                "type": "sse",
                "url": url,
                "headers": headers,
            }))
        }
        McpTransport::Http { ref url, ref headers } => {
            ("http", serde_json::json!({
                "type": "http",
                "url": url,
                "headers": headers,
            }))
        }
    };

    // Try to create transport
    match transport::create_transport(transport_type, &config) {
        Ok(_) => {
            Ok(serde_json::json!({
                "success": true,
                "message": "Transport configuration is valid",
                "transport_type": transport_type,
                "note": "Full protocol connection not tested - only transport validation"
            }))
        }
        Err(e) => {
            Ok(serde_json::json!({
                "success": false,
                "message": format!("Failed to create transport: {}", e),
                "transport_type": transport_type,
            }))
        }
    }
}

/// Call a tool on an MCP server
#[tauri::command]
pub async fn mcp_call_tool(
    app: AppHandle,
    request: CallToolRequest,
) -> Result<ToolCallResult, String> {
    let state = app.state::<crate::AppState>();
    let db = state.db.lock().unwrap();
    let conn = &*db;

    // Check if server is connected
    let runtime = mcp_queries::get_runtime_state(conn, &request.server_id)
        .map_err(|e| e.to_string())?;

    match runtime {
        Some(rt) if rt.status == "connected" => {
            // TODO: Implement actual tool call via manager
            let error_msg = "Tool calling not yet fully implemented (Phase 1.2)";

            // Record failed attempt
            let args_json = serde_json::to_string(&request.arguments).ok();
            let _ = mcp_queries::record_tool_call(
                conn,
                &request.server_id,
                &request.tool_name,
                args_json.as_deref(),
                None,
                Some(error_msg),
                0,
            );

            Err(error_msg.to_string())
        }
        _ => Err("Server is not connected".to_string()),
    }
}

/// Read a resource from an MCP server
#[tauri::command]
pub async fn mcp_read_resource(
    app: AppHandle,
    request: ReadResourceRequest,
) -> Result<String, String> {
    let state = app.state::<crate::AppState>();
    let db = state.db.lock().unwrap();
    let conn = &*db;

    // Check if server is connected
    let runtime = mcp_queries::get_runtime_state(conn, &request.server_id)
        .map_err(|e| e.to_string())?;

    match runtime {
        Some(rt) if rt.status == "connected" => {
            // TODO: Implement actual resource reading via manager
            Err("Resource reading not yet fully implemented (Phase 1.2)".to_string())
        }
        _ => Err("Server is not connected".to_string()),
    }
}

/// Get recent tool calls for a server
#[tauri::command]
pub async fn mcp_get_tool_calls(
    app: AppHandle,
    server_id: String,
    limit: i64,
) -> Result<Vec<mcp_queries::McpToolCall>, String> {
    let state = app.state::<crate::AppState>();
    let db = state.db.lock().unwrap();
    let conn = &*db;

    mcp_queries::get_recent_tool_calls(conn, &server_id, limit)
        .map_err(|e| e.to_string())
}

/// Clear runtime state for all servers (app shutdown cleanup)
#[tauri::command]
pub async fn mcp_clear_all_runtime(
    app: AppHandle,
) -> Result<(), String> {
    let state = app.state::<crate::AppState>();
    let db = state.db.lock().unwrap();
    let conn = &*db;

    mcp_queries::clear_all_runtime_state(conn).map_err(|e| e.to_string())
}
